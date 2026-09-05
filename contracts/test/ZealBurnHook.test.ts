import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('ZealBurnHook (unit; the real behaviour is exercised on a chain fork)', () => {
  it('validates its constructor and rejects callers other than the pool manager', async () => {
    const [pm, furnace, stranger] = await ethers.getSigners()
    const H = await ethers.getContractFactory('ZealBurnHook')
    await expect(H.deploy(ethers.ZeroAddress, furnace.address, 700)).to.be.revertedWithCustomError(H, 'ZeroAddress')
    await expect(H.deploy(pm.address, furnace.address, 0)).to.be.revertedWithCustomError(H, 'BadShare')
    await expect(H.deploy(pm.address, furnace.address, 2001)).to.be.revertedWithCustomError(H, 'BadShare')
    const hook = await H.deploy(pm.address, furnace.address, 700)
    const key = { currency0: ethers.ZeroAddress, currency1: stranger.address, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() }
    await expect(hook.connect(stranger).afterSwap(stranger.address, key, { zeroForOne: true, amountSpecified: -1n, sqrtPriceLimitX96: 1n }, 0n, '0x')).to.be.revertedWithCustomError(hook, 'NotPoolManager')
    expect(await hook.shareBps()).to.equal(700n)
    expect(await hook.furnace()).to.equal(furnace.address)
  })
  it('exempts the Furnace and takes nothing on a zero-output swap', async () => {
    const [pm, furnace] = await ethers.getSigners()
    const hook = await (await ethers.getContractFactory('ZealBurnHook')).deploy(pm.address, furnace.address, 700)
    const key = { currency0: ethers.ZeroAddress, currency1: pm.address, fee: 3000, tickSpacing: 60, hooks: await hook.getAddress() }
    const r1 = await hook.connect(pm).afterSwap.staticCall(furnace.address, key, { zeroForOne: true, amountSpecified: -1000n, sqrtPriceLimitX96: 1n }, (-1000n << 128n) | 500n, '0x')
    expect(r1[1]).to.equal(0n)
    const r2 = await hook.connect(pm).afterSwap.staticCall(pm.address, key, { zeroForOne: true, amountSpecified: -1000n, sqrtPriceLimitX96: 1n }, (-1000n << 128n), '0x')
    expect(r2[1]).to.equal(0n)
  })
})
