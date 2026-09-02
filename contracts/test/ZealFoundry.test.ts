import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const BPS = 10_000n
const RESERVE = 6_000n
const LIQUIDITY = 2_500n
const OPS = 1_500n

describe('ZealFoundry', () => {
  async function deploy() {
    const [deployer, reserve, liquidity, ops, stranger] = await ethers.getSigners()

    const Foundry = await ethers.getContractFactory('ZealFoundry')
    const foundry = await Foundry.deploy(
      RESERVE,
      LIQUIDITY,
      OPS,
      reserve.address,
      liquidity.address,
      ops.address,
    )

    const Mock = await ethers.getContractFactory('MockERC20')
    const weth = await Mock.deploy('Wrapped Ether', 'WETH', 18)

    return { foundry, weth, deployer, reserve, liquidity, ops, stranger }
  }

  describe('deployment invariants', () => {
    it('rejects a split that does not total 100%', async () => {
      const [, a, b, c] = await ethers.getSigners()
      const Foundry = await ethers.getContractFactory('ZealFoundry')
      await expect(
        Foundry.deploy(6_000n, 2_500n, 1_400n, a.address, b.address, c.address),
      ).to.be.revertedWithCustomError(Foundry, 'BadSplit')
      await expect(
        Foundry.deploy(6_000n, 2_500n, 1_600n, a.address, b.address, c.address),
      ).to.be.revertedWithCustomError(Foundry, 'BadSplit')
    })

    it('rejects a zero reserve share, which is always a deploy mistake', async () => {
      const [, a, b, c] = await ethers.getSigners()
      const Foundry = await ethers.getContractFactory('ZealFoundry')
      await expect(
        Foundry.deploy(0n, 5_000n, 5_000n, a.address, b.address, c.address),
      ).to.be.revertedWithCustomError(Foundry, 'BadSplit')
    })

    it('rejects zero-address sinks', async () => {
      const [, a, b] = await ethers.getSigners()
      const Foundry = await ethers.getContractFactory('ZealFoundry')
      const Z = ethers.ZeroAddress
      await expect(
        Foundry.deploy(RESERVE, LIQUIDITY, OPS, Z, a.address, b.address),
      ).to.be.revertedWithCustomError(Foundry, 'ZeroAddress')
      await expect(
        Foundry.deploy(RESERVE, LIQUIDITY, OPS, a.address, Z, b.address),
      ).to.be.revertedWithCustomError(Foundry, 'ZeroAddress')
      await expect(
        Foundry.deploy(RESERVE, LIQUIDITY, OPS, a.address, b.address, Z),
      ).to.be.revertedWithCustomError(Foundry, 'ZeroAddress')
    })

    it('exposes no way to change the sinks or the split', async () => {
      const { foundry } = await loadFixture(deploy)
      const fns = foundry.interface.fragments
        .filter((f) => f.type === 'function')
        .map((f) => (f as unknown as { name: string }).name)

      // If any of these ever appear, the "enforced by code" claim is dead.
      for (const forbidden of ['setReserveSink', 'setSplit', 'transferOwnership', 'rescue', 'sweep']) {
        expect(fns).to.not.include(forbidden)
      }
      expect(fns.sort()).to.deep.equal(
        [
          'BPS_DENOMINATOR',
          'liquidityBps',
          'liquiditySink',
          'opsBps',
          'opsSink',
          'previewSplit',
          'reserveBps',
          'reserveSink',
          'route',
          'routeNative',
          'totalRouted',
          'totalRoutedNative',
          'totalToReserve',
          'totalToReserveNative',
        ].sort(),
      )
    })
  })

  describe('routing ERC-20 fees', () => {
    it('splits exactly 60 / 25 / 15', async () => {
      const { foundry, weth, reserve, liquidity, ops } = await loadFixture(deploy)
      const amount = ethers.parseEther('10')
      await weth.mint(await foundry.getAddress(), amount)

      await foundry.route(await weth.getAddress())

      expect(await weth.balanceOf(reserve.address)).to.equal((amount * RESERVE) / BPS)
      expect(await weth.balanceOf(liquidity.address)).to.equal((amount * LIQUIDITY) / BPS)
      expect(await weth.balanceOf(ops.address)).to.equal((amount * OPS) / BPS)
      expect(await weth.balanceOf(await foundry.getAddress())).to.equal(0n)
    })

    it('gives the rounding remainder to the reserve, never to ops', async () => {
      const { foundry, weth, reserve, liquidity, ops } = await loadFixture(deploy)
      // 7 wei: liquidity floor(1.75)=1, ops floor(1.05)=1, reserve gets 5 not 4.
      await weth.mint(await foundry.getAddress(), 7n)

      await foundry.route(await weth.getAddress())

      expect(await weth.balanceOf(liquidity.address)).to.equal(1n)
      expect(await weth.balanceOf(ops.address)).to.equal(1n)
      expect(await weth.balanceOf(reserve.address)).to.equal(5n)
    })

    it('never loses a wei, across many awkward amounts', async () => {
      const { foundry, weth, reserve, liquidity, ops } = await loadFixture(deploy)
      const foundryAddr = await foundry.getAddress()
      const amounts = [1n, 2n, 3n, 9n, 13n, 99n, 1001n, 123_456_789n, ethers.parseEther('0.000001')]

      let total = 0n
      for (const a of amounts) {
        await weth.mint(foundryAddr, a)
        await foundry.route(await weth.getAddress())
        total += a
      }

      const sum =
        (await weth.balanceOf(reserve.address)) +
        (await weth.balanceOf(liquidity.address)) +
        (await weth.balanceOf(ops.address))
      expect(sum).to.equal(total)
      expect(await weth.balanceOf(foundryAddr)).to.equal(0n)
    })

    it('is permissionless — a stranger can push the queue forward', async () => {
      const { foundry, weth, reserve, stranger } = await loadFixture(deploy)
      const amount = ethers.parseEther('4')
      await weth.mint(await foundry.getAddress(), amount)

      await expect(foundry.connect(stranger).route(await weth.getAddress())).to.not.be.reverted
      expect(await weth.balanceOf(reserve.address)).to.equal((amount * RESERVE) / BPS)
    })

    it('reverts when there is nothing to route', async () => {
      const { foundry, weth } = await loadFixture(deploy)
      await expect(foundry.route(await weth.getAddress())).to.be.revertedWithCustomError(
        foundry,
        'NothingToRoute',
      )
    })

    it('accumulates lifetime totals for public accounting', async () => {
      const { foundry, weth } = await loadFixture(deploy)
      const token = await weth.getAddress()
      const a = ethers.parseEther('10')
      const b = ethers.parseEther('6')

      await weth.mint(await foundry.getAddress(), a)
      await foundry.route(token)
      await weth.mint(await foundry.getAddress(), b)
      await foundry.route(token)

      expect(await foundry.totalRouted(token)).to.equal(a + b)
      expect(await foundry.totalToReserve(token)).to.equal(((a + b) * RESERVE) / BPS)
    })

    it('emits a Routed event that reconciles to the transfers', async () => {
      const { foundry, weth, stranger } = await loadFixture(deploy)
      const amount = ethers.parseEther('3')
      await weth.mint(await foundry.getAddress(), amount)

      await expect(foundry.connect(stranger).route(await weth.getAddress()))
        .to.emit(foundry, 'Routed')
        .withArgs(
          await weth.getAddress(),
          stranger.address,
          amount,
          (amount * RESERVE) / BPS,
          (amount * LIQUIDITY) / BPS,
          (amount * OPS) / BPS,
        )
    })

    it('previewSplit agrees with what route actually does', async () => {
      const { foundry, weth, reserve, liquidity, ops } = await loadFixture(deploy)
      const amount = 123_456_791n
      const [pr, pl, po] = await foundry.previewSplit(amount)

      await weth.mint(await foundry.getAddress(), amount)
      await foundry.route(await weth.getAddress())

      expect(await weth.balanceOf(reserve.address)).to.equal(pr)
      expect(await weth.balanceOf(liquidity.address)).to.equal(pl)
      expect(await weth.balanceOf(ops.address)).to.equal(po)
    })

    it('handles $ZEAL itself, not just WETH', async () => {
      const { foundry, reserve } = await loadFixture(deploy)
      const Mock = await ethers.getContractFactory('MockERC20')
      const zeal = await Mock.deploy('Zeal', 'ZEAL', 18)
      const amount = ethers.parseEther('1000')
      await zeal.mint(await foundry.getAddress(), amount)

      await foundry.route(await zeal.getAddress())
      expect(await zeal.balanceOf(reserve.address)).to.equal((amount * RESERVE) / BPS)
    })
  })

  describe('routing native ETH', () => {
    it('accepts and splits native value', async () => {
      const { foundry, deployer, reserve, liquidity, ops } = await loadFixture(deploy)
      const amount = ethers.parseEther('5')
      await deployer.sendTransaction({ to: await foundry.getAddress(), value: amount })

      const before = {
        r: await ethers.provider.getBalance(reserve.address),
        l: await ethers.provider.getBalance(liquidity.address),
        o: await ethers.provider.getBalance(ops.address),
      }
      await foundry.routeNative()

      expect((await ethers.provider.getBalance(reserve.address)) - before.r).to.equal(
        (amount * RESERVE) / BPS,
      )
      expect((await ethers.provider.getBalance(liquidity.address)) - before.l).to.equal(
        (amount * LIQUIDITY) / BPS,
      )
      expect((await ethers.provider.getBalance(ops.address)) - before.o).to.equal(
        (amount * OPS) / BPS,
      )
      expect(await ethers.provider.getBalance(await foundry.getAddress())).to.equal(0n)
    })

    it('reverts when a sink refuses native value, rather than silently losing it', async () => {
      const [, , liquidity, ops, deployer] = await ethers.getSigners()
      const Rejecting = await ethers.getContractFactory('RejectingSink')
      const bad = await Rejecting.deploy()

      const Foundry = await ethers.getContractFactory('ZealFoundry')
      const foundry = await Foundry.deploy(
        RESERVE,
        LIQUIDITY,
        OPS,
        await bad.getAddress(),
        liquidity.address,
        ops.address,
      )
      await deployer.sendTransaction({
        to: await foundry.getAddress(),
        value: ethers.parseEther('1'),
      })

      await expect(foundry.routeNative()).to.be.revertedWithCustomError(
        foundry,
        'NativeTransferFailed',
      )
    })

    it('blocks a re-entrant sink from double-routing', async () => {
      const [, , liquidity, ops, deployer] = await ethers.getSigners()
      const Reentrant = await ethers.getContractFactory('ReentrantSink')
      const evil = await Reentrant.deploy()

      const Foundry = await ethers.getContractFactory('ZealFoundry')
      const foundry = await Foundry.deploy(
        RESERVE,
        LIQUIDITY,
        OPS,
        await evil.getAddress(),
        liquidity.address,
        ops.address,
      )
      await evil.arm(await foundry.getAddress())
      await deployer.sendTransaction({
        to: await foundry.getAddress(),
        value: ethers.parseEther('1'),
      })

      // The nested routeNative() reverts, which bubbles through the sink's
      // receive() and fails the whole transaction. Nothing is half-routed.
      await expect(foundry.routeNative()).to.be.reverted
      expect(await ethers.provider.getBalance(await foundry.getAddress())).to.equal(
        ethers.parseEther('1'),
      )
    })
  })
})
