import { expect } from 'chai'
import { ethers } from 'hardhat'

const ETH = ethers.ZeroAddress
describe('zealz.fun contracts (unit; the factory is exercised on a chain fork)', () => {
  async function hookFixture() {
    const [, factory, furnace, treasury, creator, stranger] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zzec = await Mock.deploy('zZEC', 'zZEC', 8)
    // The hook calls poolManager.take(), so the manager must be a contract; the mock's take() mints out.
    const pmc = await (await ethers.getContractFactory('MockPoolManagerV4')).deploy()
    const pm = { address: await pmc.getAddress() }
    await pmc.fund(await zzec.getAddress(), ethers.parseUnits('1', 8)); 
    const H = await ethers.getContractFactory('ZealzHook')
    const hook = await H.deploy(pm.address, factory.address, furnace.address, treasury.address, await zzec.getAddress())
    // a real launched token so reflections have a ledger; the "factory" signer deploys it
    const tokC = await (await ethers.getContractFactory('ZealzToken', factory)).deploy('Meme', 'MEME', 'ipfs://meme', ethers.parseEther('1000000000'), factory.address, await zzec.getAddress(), await hook.getAddress(), pm.address)
    const tok = { getAddress: () => tokC.getAddress() }
    const [z, t] = [await zzec.getAddress(), await tok.getAddress()]
    const key = z.toLowerCase() < t.toLowerCase() ? { currency0: z, currency1: t, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() } : { currency0: t, currency1: z, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() }
    return { hook, key, zzec: z, tok: t, pm, factory, furnace, treasury, creator, stranger, H }
  }
  const delta = (a0: bigint, a1: bigint) => BigInt.asIntN(256, (BigInt.asUintN(128, a0) << 128n) | BigInt.asUintN(128, a1))

  it('hook: only the factory registers, only the pool manager calls, unknown pools revert, bad splits revert', async () => {
    const { hook, key, tok, factory, creator, stranger, pm, H, furnace, treasury, zzec } = await hookFixture()
    await expect(hook.connect(stranger).register(key, tok, creator.address, true, 200, 100, 50)).to.be.revertedWithCustomError(hook, 'NotFactory')
    await expect(hook.connect(stranger).afterSwap(stranger.address, key, { zeroForOne: true, amountSpecified: -1n, sqrtPriceLimitX96: 1n }, 0n, '0x')).to.be.revertedWithCustomError(hook, 'NotPoolManager')
    const pmSigner = await ethers.getImpersonatedSigner(pm.address); await ethers.provider.send('hardhat_setBalance', [pm.address, '0x56bc75e2d63100000']); await expect(hook.connect(pmSigner).afterSwap(stranger.address, key, { zeroForOne: true, amountSpecified: -1n, sqrtPriceLimitX96: 1n }, 0n, '0x')).to.be.revertedWithCustomError(hook, 'UnknownPool')
    await hook.connect(factory).register(key, tok, creator.address, false, 200, 100, 50)
    expect(await hook.creatorOf(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['tuple(address,address,uint24,int24,address)'], [[key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks]])))).to.equal(creator.address)
    await expect(hook.connect(factory).register(key, tok, creator.address, true, 200, 24, 50)).to.be.revertedWithCustomError(hook, 'BadSplit') // burn below 0.25%
    await expect(hook.connect(factory).register(key, tok, creator.address, true, 200, 100, 51)).to.be.revertedWithCustomError(hook, 'BadSplit') // creator above 0.5%
    await expect(hook.connect(factory).register(key, tok, creator.address, true, 200, 150, 50)).to.be.revertedWithCustomError(hook, 'BadSplit') // shares exceed the total
    await expect(hook.connect(factory).register(key, tok, creator.address, true, 501, 25, 0)).to.be.revertedWithCustomError(hook, 'BadSplit') // total above 5%
    await expect(hook.connect(factory).register(key, tok, creator.address, true, 49, 25, 0)).to.be.revertedWithCustomError(hook, 'BadSplit') // total below 0.5%
  })

  it('hook: the 2% always comes off the zZEC leg, whichever side it is on', async () => {
    const { hook, key, tok, zzec, factory, creator, pm } = await hookFixture()
    await hook.connect(factory).register(key, tok, creator.address, false, 200, 100, 50)
    const zzecIs0 = key.currency0.toLowerCase() === zzec.toLowerCase()
    // a SELL of token for zZEC: specified = token in (negative), output = zZEC 1,000,000 raw
    const sellZeroForOne = !zzecIs0 // token is currency0 when zZEC is currency1
    const dSell = zzecIs0 ? delta(1_000_000n, -5n) : delta(-5n, 1_000_000n)
    const pmSigner = await ethers.getImpersonatedSigner(pm.address); await ethers.provider.send('hardhat_setBalance', [pm.address, '0x56bc75e2d63100000']); const r1 = await hook.connect(pmSigner).afterSwap.staticCall(pm.address, key, { zeroForOne: sellZeroForOne, amountSpecified: -5n, sqrtPriceLimitX96: 1n }, dSell, '0x')
    expect(r1[1]).to.equal(20_000n) // 2% of 1,000,000: 1% burn + 0.5% creator + 0.25% platform + 0.25% reflected
    // a BUY: specified = zZEC in, output = token 1,000,000
    const dBuy = zzecIs0 ? delta(-5n, 1_000_000n) : delta(1_000_000n, -5n)
    const r2 = await hook.connect(pmSigner).afterSwap.staticCall(pm.address, key, { zeroForOne: zzecIs0, amountSpecified: -5n, sqrtPriceLimitX96: 1n }, dBuy, '0x')
    expect(r2[1]).to.equal(0n) // token output: nothing here, the fee came off the zZEC input in beforeSwap
    // the same BUY seen by beforeSwap: zZEC specified 1,000,000 in -> 2% taken before the pool sees it
    const r3 = await hook.connect(pmSigner).beforeSwap.staticCall(pm.address, key, { zeroForOne: zzecIs0, amountSpecified: -1_000_000n, sqrtPriceLimitX96: 1n }, '0x')
    expect(r3[1] >> 128n).to.equal(20_000n)
    // a SELL seen by beforeSwap: token specified -> nothing here
    const r4 = await hook.connect(pmSigner).beforeSwap.staticCall(pm.address, key, { zeroForOne: sellZeroForOne, amountSpecified: -5n, sqrtPriceLimitX96: 1n }, '0x')
    expect(r4[1]).to.equal(0n)
  })

  it('locker: accepts only factory deposits via the position manager and refuses unknown positions', async () => {
    const [, factory, stranger] = await ethers.getSigners()
    const Mock = await ethers.getContractFactory('MockERC20')
    const zzec = await Mock.deploy('zZEC', 'zZEC', 8)
    const posm = await (await ethers.getContractFactory('MockPositionManagerV4')).deploy()
    const pm = await (await ethers.getContractFactory('MockPoolManagerV4')).deploy()
    const locker = await (await ethers.getContractFactory('ZealzLocker')).deploy(await posm.getAddress(), await pm.getAddress(), '0x000000000022D473030F116dDEE9F6B43aC78BA3', factory.address)
    const key = { currency0: ETH, currency1: await zzec.getAddress(), fee: 3000, tickSpacing: 60, hooks: ETH }
    await posm.setPositionPool(5, key)
    await expect(posm.giveFrom(stranger.address, await locker.getAddress(), 5)).to.be.revertedWithCustomError(locker, 'NotFactoryDeposit')
    await posm.giveFrom(factory.address, await locker.getAddress(), 5)
    expect(await locker.positionCount()).to.equal(1n)
    expect(await locker.locked(5)).to.equal(true)
    await expect(locker.compound(6)).to.be.revertedWithCustomError(locker, 'NotLocked')
  })

  it('token: fixed supply to the recipient, no owner, metadata readable', async () => {
    const [a] = await ethers.getSigners()
    const t = await (await ethers.getContractFactory('ZealzToken')).deploy('Meme', 'MEME', 'ipfs://meta', ethers.parseEther('1000000000'), a.address, a.address, a.address, a.address)
    expect(await t.totalSupply()).to.equal(ethers.parseEther('1000000000'))
    expect(await t.balanceOf(a.address)).to.equal(ethers.parseEther('1000000000'))
    expect(await t.metadataURI()).to.equal('ipfs://meta')
    expect(t.interface.fragments.some((f) => f.type === 'function' && (f as unknown as { name: string }).name === 'owner')).to.equal(false)
  })
})
