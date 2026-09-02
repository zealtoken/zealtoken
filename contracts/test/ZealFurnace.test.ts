import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const DEAD = '0x000000000000000000000000000000000000dEaD'
const FEE_3000 = '000bb8' // 0.3% tier, 3 bytes

/** Uniswap V3 path bytes: tokenA(20) fee(3) tokenB(20). */
function path(tokenIn: string, tokenOut: string, fee = FEE_3000): string {
  return '0x' + tokenIn.slice(2) + fee + tokenOut.slice(2)
}

describe('ZealFurnace', () => {
  async function deploy() {
    const [owner, igniter, stranger, feeder] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zeal = await Mock.deploy('Zeal', 'ZEAL', 18)
    const weth = await Mock.deploy('Wrapped Ether', 'WETH', 18)
    const zzec = await Mock.deploy('Zeal Wrapped Zcash', 'zZEC', 8)

    const Router = await ethers.getContractFactory('MockRouter')
    const router = await Router.deploy(await zeal.getAddress(), 1000n) // 1 WETH -> 1000 ZEAL

    const Furnace = await ethers.getContractFactory('ZealFurnace')
    const furnace = await Furnace.deploy(
      await zeal.getAddress(),
      await router.getAddress(),
      owner.address,
      igniter.address,
    )

    const addr = {
      zeal: await zeal.getAddress(),
      weth: await weth.getAddress(),
      zzec: await zzec.getAddress(),
      furnace: await furnace.getAddress(),
    }
    return { furnace, router, zeal, weth, zzec, owner, igniter, stranger, feeder, addr }
  }

  describe('the one door', () => {
    it('exposes no withdraw, rescue, sweep or transfer path in its ABI', async () => {
      const { furnace } = await loadFixture(deploy)
      const fns = furnace.interface.fragments
        .filter((f) => f.type === 'function')
        .map((f) => (f as unknown as { name: string }).name)

      // transferOwnership is Ownable2Step's role handover; it moves no tokens.
      const tokenMoving = fns.filter((n) => n !== 'transferOwnership')
      for (const forbidden of ['withdraw', 'rescue', 'sweep', 'transfer', 'send', 'skim', 'recover']) {
        expect(tokenMoving.some((n) => n.toLowerCase().includes(forbidden))).to.equal(
          false,
          `found a "${forbidden}"-like function`,
        )
      }
      // The full surface, pinned. Adding anything means re-arguing "one door".
      expect(fns.sort()).to.deep.equal(
        [
          'BURN_ADDRESS',
          'ROLE_TIMELOCK',
          'acceptOwnership',
          'burn',
          'burnCount',
          'cancelIgniterProposal',
          'commitIgniter',
          'igniter',
          'ignite',
          'owner',
          'pendingIgniter',
          'pendingOwner',
          'proposeIgniter',
          'renounceOwnership',
          'router',
          'totalConsumed',
          'totalZealBurned',
          'transferOwnership',
          'zeal',
        ].sort(),
      )
    })

    it('the only address $ZEAL ever leaves to is the burn address', async () => {
      const { furnace, zeal, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('2'))

      const tx = await furnace
        .connect(igniter)
        .ignite(addr.weth, ethers.parseEther('2'), 0n, path(addr.weth, addr.zeal))
      const rc = await tx.wait()

      // Every ZEAL Transfer event out of the furnace goes to DEAD, no exceptions.
      const iface = zeal.interface
      const outbound = rc!.logs
        .filter((l) => l.address.toLowerCase() === addr.zeal.toLowerCase())
        .map((l) => iface.parseLog({ topics: [...l.topics], data: l.data }))
        .filter((p) => p && p.name === 'Transfer' && p.args.from === addr.furnace)
      expect(outbound.length).to.be.greaterThan(0)
      for (const p of outbound) expect(p!.args.to).to.equal(DEAD)
    })
  })

  describe('ignite', () => {
    it('swaps fee tokens for $ZEAL and burns all of it in one transaction', async () => {
      const { furnace, zeal, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('3'))

      await expect(
        furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('3'), 0n, path(addr.weth, addr.zeal)),
      )
        .to.emit(furnace, 'Ignited')
        .withArgs(addr.weth, ethers.parseEther('3'), ethers.parseEther('3000'), igniter.address)
        .and.to.emit(furnace, 'Burned')
        .withArgs(igniter.address, ethers.parseEther('3000'), ethers.parseEther('3000'))

      expect(await zeal.balanceOf(DEAD)).to.equal(ethers.parseEther('3000'))
      expect(await zeal.balanceOf(addr.furnace)).to.equal(0n)
      expect(await furnace.totalZealBurned()).to.equal(ethers.parseEther('3000'))
      expect(await furnace.totalConsumed(addr.weth)).to.equal(ethers.parseEther('3'))
    })

    it('honours the minimum output, so a bad fill reverts instead of burning less', async () => {
      const { furnace, router, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await router.setRate(500n) // price moved against us

      await expect(
        furnace
          .connect(igniter)
          .ignite(addr.weth, ethers.parseEther('1'), ethers.parseEther('900'), path(addr.weth, addr.zeal)),
      ).to.be.revertedWith('Too little received')
      expect(await weth.balanceOf(addr.furnace)).to.equal(ethers.parseEther('1')) // untouched
    })

    it('rejects a path that does not end in $ZEAL', async () => {
      const { furnace, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await expect(
        furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('1'), 0n, path(addr.weth, addr.zzec)),
      ).to.be.revertedWithCustomError(furnace, 'BadPath')
    })

    it('rejects a path that does not start with tokenIn', async () => {
      const { furnace, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await expect(
        furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('1'), 0n, path(addr.zzec, addr.zeal)),
      ).to.be.revertedWithCustomError(furnace, 'BadPath')
    })

    it('rejects malformed path lengths', async () => {
      const { furnace, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await expect(
        furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('1'), 0n, '0x1234'),
      ).to.be.revertedWithCustomError(furnace, 'BadPath')
    })

    it('will not "ignite" $ZEAL itself', async () => {
      const { furnace, zeal, igniter, addr } = await loadFixture(deploy)
      await zeal.mint(addr.furnace, 1n)
      await expect(
        furnace.connect(igniter).ignite(addr.zeal, 1n, 0n, path(addr.zeal, addr.zeal)),
      ).to.be.revertedWithCustomError(furnace, 'CannotIgniteZeal')
    })

    it('cannot spend more than it holds', async () => {
      const { furnace, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await expect(
        furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('2'), 0n, path(addr.weth, addr.zeal)),
      ).to.be.revertedWithCustomError(furnace, 'InsufficientBalance')
    })

    it('is gated to the igniter', async () => {
      const { furnace, weth, stranger, owner, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      for (const who of [stranger, owner]) {
        await expect(
          furnace.connect(who).ignite(addr.weth, ethers.parseEther('1'), 0n, path(addr.weth, addr.zeal)),
        ).to.be.revertedWithCustomError(furnace, 'NotIgniter')
      }
    })

    it('leaves no lingering router allowance', async () => {
      const { furnace, weth, router, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      await furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('1'), 0n, path(addr.weth, addr.zeal))
      expect(await weth.allowance(addr.furnace, await router.getAddress())).to.equal(0n)
    })
  })

  describe('burn', () => {
    it('is permissionless: a stranger can burn $ZEAL sitting in the Furnace', async () => {
      const { furnace, zeal, stranger, addr } = await loadFixture(deploy)
      await zeal.mint(addr.furnace, ethers.parseEther('42'))

      await expect(furnace.connect(stranger).burn())
        .to.emit(furnace, 'Burned')
        .withArgs(stranger.address, ethers.parseEther('42'), ethers.parseEther('42'))
      expect(await zeal.balanceOf(DEAD)).to.equal(ethers.parseEther('42'))
      expect(await furnace.burnCount()).to.equal(1n)
    })

    it('reverts when there is nothing to burn, rather than emitting a zero', async () => {
      const { furnace } = await loadFixture(deploy)
      await expect(furnace.burn()).to.be.revertedWithCustomError(furnace, 'NothingToBurn')
    })

    it('accumulates across many burns', async () => {
      const { furnace, zeal, addr } = await loadFixture(deploy)
      let total = 0n
      for (const a of [1n, 7n, 1000n, ethers.parseEther('0.5')]) {
        await zeal.mint(addr.furnace, a)
        await furnace.burn()
        total += a
      }
      expect(await furnace.totalZealBurned()).to.equal(total)
      expect(await zeal.balanceOf(DEAD)).to.equal(total)
      expect(await furnace.burnCount()).to.equal(4n)
    })
  })

  describe('admin', () => {
    it('rejects zero addresses at construction', async () => {
      const [owner, igniter] = await ethers.getSigners()
      const Furnace = await ethers.getContractFactory('ZealFurnace')
      const Z = ethers.ZeroAddress
      await expect(Furnace.deploy(Z, owner.address, owner.address, igniter.address)).to.be.revertedWithCustomError(
        Furnace,
        'ZeroAddress',
      )
      await expect(Furnace.deploy(owner.address, Z, owner.address, igniter.address)).to.be.revertedWithCustomError(
        Furnace,
        'ZeroAddress',
      )
      await expect(Furnace.deploy(owner.address, owner.address, owner.address, Z)).to.be.revertedWithCustomError(
        Furnace,
        'ZeroAddress',
      )
    })

    it('rotates the igniter only after the 48h timelock', async () => {
      const { furnace, owner, stranger, igniter } = await loadFixture(deploy)
      await furnace.connect(owner).proposeIgniter(stranger.address)
      await expect(furnace.connect(owner).commitIgniter()).to.be.revertedWithCustomError(
        furnace,
        'TimelockNotElapsed',
      )
      expect(await furnace.igniter()).to.equal(igniter.address)
      await time.increase(48 * 3600)
      await furnace.connect(owner).commitIgniter()
      expect(await furnace.igniter()).to.equal(stranger.address)
    })

    it('cancel clears the proposal and commit then fails', async () => {
      const { furnace, owner, stranger } = await loadFixture(deploy)
      await furnace.connect(owner).proposeIgniter(stranger.address)
      await furnace.connect(owner).cancelIgniterProposal()
      await time.increase(48 * 3600)
      await expect(furnace.connect(owner).commitIgniter()).to.be.revertedWithCustomError(furnace, 'NoPendingRole')
    })

    it('gates role admin behind the owner', async () => {
      const { furnace, stranger } = await loadFixture(deploy)
      for (const call of [
        furnace.connect(stranger).proposeIgniter(stranger.address),
        furnace.connect(stranger).commitIgniter(),
        furnace.connect(stranger).cancelIgniterProposal(),
      ]) {
        await expect(call).to.be.revertedWithCustomError(furnace, 'OwnableUnauthorizedAccount')
      }
    })

    it('a hostile igniter still cannot extract anything: worst case is a bad fill into a burn', async () => {
      const { furnace, zeal, weth, igniter, addr } = await loadFixture(deploy)
      await weth.mint(addr.furnace, ethers.parseEther('1'))
      // minOut = 0 is the worst an igniter can do. The output still burns.
      await furnace.connect(igniter).ignite(addr.weth, ethers.parseEther('1'), 0n, path(addr.weth, addr.zeal))
      expect(await zeal.balanceOf(igniter.address)).to.equal(0n)
      expect(await weth.balanceOf(igniter.address)).to.equal(0n)
      expect(await zeal.balanceOf(DEAD)).to.equal(ethers.parseEther('1000'))
    })
  })
})
