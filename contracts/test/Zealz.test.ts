import { expect } from 'chai'
import { ethers } from 'hardhat'

const ETH = ethers.ZeroAddress
describe('zealz.fun contracts (unit; the factory is exercised on a chain fork)', () => {
  async function hookFixture() {
    const [, factory, furnace, treasury, creator, stranger] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zzec = await Mock.deploy('zZEC', 'zZEC', 8)
    const tok = await Mock.deploy('Meme', 'MEME', 18)
    // The hook calls poolManager.take(), so the manager must be a contract; the mock's take() mints out.
    const pmc = await (await ethers.getContractFactory('MockPoolManagerV4')).deploy()
    const pm = { address: await pmc.getAddress() }
    await pmc.fund(await zzec.getAddress(), ethers.parseUnits('1', 8)); await pmc.fund(await tok.getAddress(), ethers.parseEther('1'))
    const H = await ethers.getContractFactory('ZealzHook')
    const hook = await H.deploy(pm.address, factory.address, furnace.address, treasury.address, await zzec.getAddress(), 100, 50, 50)
    const [z, t] = [await zzec.getAddress(), await tok.getAddress()]
    const key = z.toLowerCase() < t.toLowerCase() ? { currency0: z, currency1: t, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() } : { currency0: t, currency1: z, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() }
    return { hook, key, zzec: z, tok: t, pm, factory, furnace, treasury, creator, stranger, H }
  }
  const delta = (a0: bigint, a1: bigint) => BigInt.asIntN(256, (BigInt.asUintN(128, a0) << 128n) | BigInt.asUintN(128, a1))

  it('hook: only the factory registers, only the pool manager calls, unknown pools revert, split caps at 5%', async () => {
    const { hook, key, tok, factory, creator, stranger, pm, H, furnace, treasury, zzec } = await hookFixture()
    await expect(hook.connect(stranger).register(key, tok, creator.address)).to.be.revertedWithCustomError(hook, 'NotFactory')
    await expect(hook.connect(stranger).afterSwap(stranger.address, key, { zeroForOne: true, amountSpecified: -1n, sqrtPriceLimitX96: 1n }, 0n, '0x')).to.be.revertedWithCustomError(hook, 'NotPoolManager')
    const pmSigner = await ethers.getImpersonatedSigner(pm.address); await ethers.provider.send('hardhat_setBalance', [pm.address, '0x56bc75e2d63100000']); await expect(hook.connect(pmSigner).afterSwap(stranger.address, key, { zeroForOne: true, amountSpecified: -1n, sqrtPriceLimitX96: 1n }, 0n, '0x')).to.be.revertedWithCustomError(hook, 'UnknownPool')
    await hook.connect(factory).register(key, tok, creator.address)
    expect(await hook.creatorOf(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['tuple(address,address,uint24,int24,address)'], [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]])))).to.equal(creator.address)
    await expect(H.deploy(pm.address, factory.address, furnace.address, treasury.address, zzec, 400, 100, 100)).to.be.revertedWithCustomError(H, 'BadSplit')
  })

  it('hook: zZEC output splits burn/creator/treasury; token output splits creator/treasury only', async () => {
    const { hook, key, tok, zzec, factory, creator, pm } = await hookFixture()
    await hook.connect(factory).register(key, tok, creator.address)
    const zzecIs0 = key.currency0.toLowerCase() === zzec.toLowerCase()
    // a SELL of token for zZEC: specified = token in (negative), output = zZEC 1,000,000 raw
    const sellZeroForOne = !zzecIs0 // token is currency0 when zZEC is currency1
    const dSell = zzecIs0 ? delta(1_000_000n, -5n) : delta(-5n, 1_000_000n)
    const pmSigner = await ethers.getImpersonatedSigner(pm.address); await ethers.provider.send('hardhat_setBalance', [pm.address, '0x56bc75e2d63100000']); const r1 = await hook.connect(pmSigner).afterSwap.staticCall(pm.address, key, { zeroForOne: sellZeroForOne, amountSpecified: -5n, sqrtPriceLimitX96: 1n }, dSell, '0x')
    expect(r1[1]).to.equal(20_000n) // 2% of 1,000,000: 1% burn + 0.5% + 0.5%
    // a BUY: specified = zZEC in, output = token 1,000,000
    const dBuy = zzecIs0 ? delta(-5n, 1_000_000n) : delta(1_000_000n, -5n)
    const r2 = await hook.connect(pmSigner).afterSwap.staticCall(pm.address, key, { zeroForOne: zzecIs0, amountSpecified: -5n, sqrtPriceLimitX96: 1n }, dBuy, '0x')
    expect(r2[1]).to.equal(20_000n) // still 2%, all to creator + treasury
  })

  it('locker: accepts only factory deposits via the position manager, collects fees to the treasury, never releases', async () => {
    const [, factory, treasury, stranger] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zzec = await Mock.deploy('zZEC', 'zZEC', 8)
    const posm = await (await ethers.getContractFactory('MockPositionManagerV4')).deploy()
    const locker = await (await ethers.getContractFactory('ZealzLocker')).deploy(await posm.getAddress(), factory.address, treasury.address)
    const key = { currency0: ETH, currency1: await zzec.getAddress(), fee: 3000, tickSpacing: 60, hooks: ETH }
    await posm.setPositionPool(5, key)
    await expect(posm.giveFrom(stranger.address, await locker.getAddress(), 5)).to.be.revertedWithCustomError(locker, 'NotFactoryDeposit')
    await posm.giveFrom(factory.address, await locker.getAddress(), 5)
    expect(await locker.positionCount()).to.equal(1n)
    await expect(locker.collect(6)).to.be.revertedWithCustomError(locker, 'NotLocked')
    await posm.setFees(await zzec.getAddress(), 777n, 0n)
    await expect(locker.connect(stranger).collect(5)).to.emit(locker, 'FeesCollected')
    expect(await zzec.balanceOf(treasury.address)).to.equal(777n)
    const fns = locker.interface.fragments.filter((f) => f.type === 'function').map((f) => (f as unknown as { name: string }).name).sort()
    expect(fns).to.deep.equal(['collect', 'factory', 'locked', 'onERC721Received', 'positionCount', 'positionIds', 'positionManager', 'treasury'])
  })

  it('token: fixed supply to the recipient, no owner, metadata readable', async () => {
    const [a] = await ethers.getSigners()
    const t = await (await ethers.getContractFactory('ZealzToken')).deploy('Meme', 'MEME', 'ipfs://meta', ethers.parseEther('1000000000'), a.address)
    expect(await t.totalSupply()).to.equal(ethers.parseEther('1000000000'))
    expect(await t.balanceOf(a.address)).to.equal(ethers.parseEther('1000000000'))
    expect(await t.metadataURI()).to.equal('ipfs://meta')
    expect(t.interface.fragments.some((f) => f.type === 'function' && (f as unknown as { name: string }).name === 'owner')).to.equal(false)
  })
})
