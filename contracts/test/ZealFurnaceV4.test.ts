import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const ETH = ethers.ZeroAddress
const BURN = '0x000000000000000000000000000000000000dEaD'

describe('ZealFurnaceV4', () => {
  async function deploy() {
    const [owner, igniter, stranger] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zeal = await Mock.deploy('Zeal', 'ZEAL', 18)
    const zzec = await Mock.deploy('Zeal Wrapped Zcash', 'zZEC', 8)
    const pm = await (await ethers.getContractFactory('MockPoolManagerV4')).deploy()
    const posm = await (await ethers.getContractFactory('MockPositionManagerV4')).deploy()
    const a = { zeal: await zeal.getAddress(), zzec: await zzec.getAddress(), pm: await pm.getAddress(), posm: await posm.getAddress() }
    const zzecPool = { currency0: ETH, currency1: a.zzec, fee: 10_000, tickSpacing: 200, hooks: ETH }
    const zealPool = { currency0: ETH, currency1: a.zeal, fee: 0, tickSpacing: 200, hooks: stranger.address }
    const furnace = await (await ethers.getContractFactory('ZealFurnaceV4')).deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, zealPool, owner.address, igniter.address)
    const f = await furnace.getAddress()
    // 1 zZEC (1e8) -> 0.4 ETH ; 1 ETH -> 1,000,000 ZEAL
    await pm.setRate(zzecPool, ethers.parseEther('0.4'), 1e8)
    await pm.setRate(zealPool, ethers.parseEther('1000000'), ethers.parseEther('1'))
    await pm.fund(a.zeal, ethers.parseEther('1000000000'))
    await owner.sendTransaction({ to: a.pm, value: ethers.parseEther('50') })
    await owner.sendTransaction({ to: a.posm, value: ethers.parseEther('5') })
    return { furnace, f, zeal, zzec, pm, posm, a, zzecPool, zealPool, owner, igniter, stranger }
  }

  it('exposes no withdraw, rescue, sweep, transfer or liquidity-decrease path', async () => {
    const { furnace } = await loadFixture(deploy)
    const fns = furnace.interface.fragments.filter((x) => x.type === 'function').map((x) => (x as unknown as { name: string }).name).sort()
    // Every state-changing function, by name. Anything not on this list is a door that must not exist.
    expect(fns).to.deep.equal([
      'BURN_ADDRESS', 'ROLE_TIMELOCK', 'acceptOwnership', 'burn', 'burnCount', 'cancelIgniterProposal', 'collectFees',
      'commitIgniter', 'ignite', 'igniter', 'onERC721Received', 'owner', 'pendingIgniter', 'pendingOwner', 'poolManager',
      'positionId', 'positionManager', 'proposeIgniter', 'renounceOwnership', 'totalEthConsumed', 'totalZealBurned',
      'totalZzecConsumed', 'transferOwnership', 'unlockCallback', 'zeal', 'zealPool', 'zzec', 'zzecPool',
    ])
  })

  it('ignites both legs: zZEC -> ETH -> $ZEAL, and burns everything, with a floor', async () => {
    const { furnace, f, zeal, zzec, igniter } = await loadFixture(deploy)
    await zzec.mint(f, 2n * 10n ** 8n) // 2 zZEC -> 0.8 ETH
    await igniter.sendTransaction({ to: f, value: ethers.parseEther('0.2') }) // + 0.2 ETH held = 1 ETH -> 1,000,000 ZEAL
    const expected = ethers.parseEther('1000000')
    await expect(furnace.connect(igniter).ignite(expected)).to.emit(furnace, 'Ignited').withArgs(2n * 10n ** 8n, ethers.parseEther('1'), expected, igniter.address).and.to.emit(furnace, 'Burned')
    expect(await zeal.balanceOf(BURN)).to.equal(expected)
    expect(await zeal.balanceOf(f)).to.equal(0n)
    expect(await zzec.balanceOf(f)).to.equal(0n)
    expect(await ethers.provider.getBalance(f)).to.equal(0n)
    expect(await furnace.totalZealBurned()).to.equal(expected)
    expect(await furnace.totalEthConsumed()).to.equal(ethers.parseEther('1'))
    expect(await furnace.totalZzecConsumed()).to.equal(2n * 10n ** 8n)
  })

  it('reverts below the floor instead of burning less', async () => {
    const { furnace, f, igniter } = await loadFixture(deploy)
    await igniter.sendTransaction({ to: f, value: ethers.parseEther('1') })
    await expect(furnace.connect(igniter).ignite(ethers.parseEther('1000001'))).to.be.revertedWithCustomError(furnace, 'InsufficientOutput')
  })

  it('ignite is gated to the igniter; unlockCallback only to the pool manager', async () => {
    const { furnace, f, stranger, pm } = await loadFixture(deploy)
    await stranger.sendTransaction({ to: f, value: 1n })
    await expect(furnace.connect(stranger).ignite(0)).to.be.revertedWithCustomError(furnace, 'NotIgniter')
    await expect(furnace.connect(stranger).unlockCallback('0x')).to.be.revertedWithCustomError(furnace, 'NotPoolManager')
    void pm
  })

  it('reverts when there is nothing to ignite', async () => {
    const { furnace, igniter } = await loadFixture(deploy)
    await expect(furnace.connect(igniter).ignite(0)).to.be.revertedWithCustomError(furnace, 'NothingToIgnite')
  })

  it('accepts one LP position from the position manager only, and collects its fees permissionlessly', async () => {
    const { furnace, f, posm, zzec, a, stranger } = await loadFixture(deploy)
    await expect(furnace.connect(stranger).collectFees()).to.be.revertedWithCustomError(furnace, 'NoPosition')
    await expect(furnace.onERC721Received(stranger.address, stranger.address, 7, '0x')).to.be.revertedWithCustomError(furnace, 'NotPositionManager')
    await posm.give(f, 42)
    expect(await furnace.positionId()).to.equal(42n)
    await expect(posm.give(f, 43)).to.be.revertedWith('bad receiver').catch(() => {}) // second position is refused
    expect(await furnace.positionId()).to.equal(42n)
    await posm.setFees(a.zzec, 5n * 10n ** 7n, ethers.parseEther('0.1'))
    await expect(furnace.connect(stranger).collectFees()).to.emit(furnace, 'FeesCollected').withArgs(stranger.address, 42n)
    expect(await zzec.balanceOf(f)).to.equal(5n * 10n ** 7n)
    expect(await ethers.provider.getBalance(f)).to.equal(ethers.parseEther('0.1'))
  })

  it('burn is permissionless and only ever pays the burn address', async () => {
    const { furnace, f, zeal, stranger } = await loadFixture(deploy)
    await zeal.mint(f, 123n)
    await expect(furnace.connect(stranger).burn()).to.emit(furnace, 'Burned').withArgs(stranger.address, 123n, 123n)
    expect(await zeal.balanceOf(BURN)).to.equal(123n)
    await expect(furnace.burn()).to.be.revertedWithCustomError(furnace, 'NothingToBurn')
  })

  it('rejects pool keys that are not ETH-quoted markets of the right tokens', async () => {
    const { a, owner, igniter, zzecPool, zealPool } = await loadFixture(deploy)
    const F = await ethers.getContractFactory('ZealFurnaceV4')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, { ...zzecPool, currency1: a.zeal }, zealPool, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadPoolKey')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, { ...zealPool, currency0: a.zzec }, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadPoolKey')
  })

  it('rotates the igniter only after the 48h timelock', async () => {
    const { furnace, owner, stranger } = await loadFixture(deploy)
    await furnace.connect(owner).proposeIgniter(stranger.address)
    await expect(furnace.connect(owner).commitIgniter()).to.be.revertedWithCustomError(furnace, 'TimelockNotElapsed')
    await time.increase(48 * 3600 + 1)
    await furnace.connect(owner).commitIgniter()
    expect(await furnace.igniter()).to.equal(stranger.address)
  })
})
