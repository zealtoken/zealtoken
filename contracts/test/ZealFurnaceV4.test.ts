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
    const Q96 = 2n ** 96n
    await pm.initPool(zzecPool, Q96)
    await pm.initPool(zealPool, Q96)
    const furnace = await (await ethers.getContractFactory('ZealFurnaceV4')).deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, zealPool, 500, owner.address, igniter.address)
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
      'BURN_ADDRESS', 'PROPOSAL_WINDOW', 'ROLE_TIMELOCK', 'acceptOwnership', 'burn', 'burnCount', 'cancelIgniterProposal',
      'adoptPosition', 'collectFees', 'commitIgniter', 'ignite', 'igniter', 'maxImpactBps', 'onERC721Received', 'owner', 'pendingIgniter',
      'pendingOwner', 'poolManager', 'positionCount', 'positionIds', 'positionManager', 'proposeIgniter', 'renounceOwnership',
      'totalEthConsumed', 'totalZealBurned', 'totalZzecConsumed', 'transferOwnership', 'unlockCallback', 'zeal', 'zealPool',
      'zzec', 'zzecPool',
    ])
  })

  it('ignites both legs: zZEC -> ETH -> $ZEAL, and burns everything, with a floor', async () => {
    const { furnace, f, zeal, zzec, igniter } = await loadFixture(deploy)
    await zzec.mint(f, 2n * 10n ** 8n) // 2 zZEC -> 0.8 ETH
    await igniter.sendTransaction({ to: f, value: ethers.parseEther('0.2') }) // + 0.2 ETH held = 1 ETH -> 1,000,000 ZEAL
    const expected = ethers.parseEther('1000000')
    await expect(furnace.connect(igniter).ignite(expected, '0x')).to.emit(furnace, 'Ignited').withArgs(2n * 10n ** 8n, ethers.parseEther('1'), expected, igniter.address).and.to.emit(furnace, 'Burned')
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
    await expect(furnace.connect(igniter).ignite(ethers.parseEther('1000001'), '0x')).to.be.revertedWithCustomError(furnace, 'InsufficientOutput')
  })

  it('ignite is gated to the igniter; unlockCallback only to the pool manager', async () => {
    const { furnace, f, stranger, pm } = await loadFixture(deploy)
    await stranger.sendTransaction({ to: f, value: 1n })
    await expect(furnace.connect(stranger).ignite(0, '0x')).to.be.revertedWithCustomError(furnace, 'NotIgniter')
    await expect(furnace.connect(stranger).unlockCallback('0x')).to.be.revertedWithCustomError(furnace, 'NotPoolManager')
    void pm
  })

  it('reverts when there is nothing to ignite', async () => {
    const { furnace, igniter } = await loadFixture(deploy)
    await expect(furnace.connect(igniter).ignite(0, '0x')).to.be.revertedWithCustomError(furnace, 'NothingToIgnite')
  })

  it('accepts LP positions from the owner via the position manager, zZEC pool only, and collects all their fees permissionlessly', async () => {
    const { furnace, f, posm, zzec, a, owner, stranger, zzecPool, zealPool } = await loadFixture(deploy)
    await expect(furnace.connect(stranger).collectFees()).to.be.revertedWithCustomError(furnace, 'NoPosition')
    await expect(furnace.onERC721Received(stranger.address, stranger.address, 7, '0x')).to.be.revertedWithCustomError(furnace, 'NotPositionManager')
    await posm.setPositionPool(42, zzecPool)
    await posm.setPositionPool(43, zzecPool)
    await posm.setPositionPool(99, zealPool)
    // a stranger cannot occupy the slot with their own NFT
    await expect(posm.giveFrom(stranger.address, f, 42)).to.be.revertedWithCustomError(furnace, 'NotOwnerDeposit')
    // the owner cannot deposit a position from the wrong pool
    await expect(posm.giveFrom(owner.address, f, 99)).to.be.revertedWithCustomError(furnace, 'WrongPool')
    await posm.giveFrom(owner.address, f, 42)
    await posm.giveFrom(owner.address, f, 43)
    expect(await furnace.positionCount()).to.equal(2n)
    expect(await furnace.positionIds(1)).to.equal(43n)
    await posm.setFees(a.zzec, 5n * 10n ** 7n, ethers.parseEther('0.1'))
    await expect(furnace.connect(stranger).collectFees()).to.emit(furnace, 'FeesCollected').withArgs(stranger.address, 42n).and.to.emit(furnace, 'FeesCollected').withArgs(stranger.address, 43n)
    expect(await zzec.balanceOf(f)).to.equal(5n * 10n ** 7n)
    expect(await ethers.provider.getBalance(f)).to.equal(ethers.parseEther('0.1'))
  })

  it('adopts a position that arrived without the receiver hook: owner only, held here, right pool, once', async () => {
    const { furnace, f, posm, owner, stranger, zzecPool, zealPool } = await loadFixture(deploy)
    await posm.setPositionPool(7, zzecPool)
    await posm.setPositionPool(8, zealPool)
    await expect(furnace.connect(stranger).adoptPosition(7)).to.be.revertedWithCustomError(furnace, 'OwnableUnauthorizedAccount')
    await expect(furnace.connect(owner).adoptPosition(7)).to.be.revertedWithCustomError(furnace, 'NotHeld')
    await posm.setOwner(7, f)
    await posm.setOwner(8, f)
    await expect(furnace.connect(owner).adoptPosition(8)).to.be.revertedWithCustomError(furnace, 'WrongPool')
    await furnace.connect(owner).adoptPosition(7)
    expect(await furnace.positionCount()).to.equal(1n)
    await expect(furnace.connect(owner).adoptPosition(7)).to.be.revertedWithCustomError(furnace, 'AlreadyListed')
  })

  it('burn is permissionless and only ever pays the burn address', async () => {
    const { furnace, f, zeal, stranger } = await loadFixture(deploy)
    await zeal.mint(f, 123n)
    await expect(furnace.connect(stranger).burn()).to.emit(furnace, 'Burned').withArgs(stranger.address, 123n, 123n)
    expect(await zeal.balanceOf(BURN)).to.equal(123n)
    await expect(furnace.burn()).to.be.revertedWithCustomError(furnace, 'NothingToBurn')
  })

  it('rejects wrong pool keys, uninitialized pools, and a bad impact bound at construction', async () => {
    const { a, owner, igniter, zzecPool, zealPool } = await loadFixture(deploy)
    const F = await ethers.getContractFactory('ZealFurnaceV4')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, { ...zzecPool, currency1: a.zeal }, zealPool, 500, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadPoolKey')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, { ...zealPool, currency0: a.zzec }, 500, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadPoolKey')
    // a typo in fee/spacing/hooks points at a pool that does not exist: refuse to deploy rather than lock inflows forever
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, { ...zzecPool, fee: 3000 }, zealPool, 500, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'PoolNotInitialized')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, { ...zealPool, tickSpacing: 60 }, 500, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'PoolNotInitialized')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, zealPool, 0, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadImpact')
    await expect(F.deploy(a.pm, a.posm, a.zeal, a.zzec, zzecPool, zealPool, 5001, owner.address, igniter.address)).to.be.revertedWithCustomError(F, 'BadImpact')
  })

  it('ownership cannot be renounced, and a matured proposal expires after the window', async () => {
    const { furnace, owner, stranger } = await loadFixture(deploy)
    await expect(furnace.connect(owner).renounceOwnership()).to.be.revertedWithCustomError(furnace, 'CannotRenounce')
    await furnace.connect(owner).proposeIgniter(stranger.address)
    await time.increase(48 * 3600 + 7 * 86400 + 1)
    await expect(furnace.connect(owner).commitIgniter()).to.be.revertedWithCustomError(furnace, 'ProposalExpired')
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
