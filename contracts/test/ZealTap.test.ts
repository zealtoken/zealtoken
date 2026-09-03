import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'

describe('ZealTap', () => {
  async function deploy() {
    const [deployer, reserve, liquidity, ops, stranger] = await ethers.getSigners()
    const Foundry = await ethers.getContractFactory('ZealFoundry')
    const foundry = await Foundry.deploy(6_000n, 2_500n, 1_500n, reserve.address, liquidity.address, ops.address)
    const Escrow = await ethers.getContractFactory('MockV2FeeEscrow')
    const escrow = await Escrow.deploy()
    const Tap = await ethers.getContractFactory('ZealTap')
    const tap = await Tap.deploy(await escrow.getAddress(), await foundry.getAddress())
    const Mock = await ethers.getContractFactory('MockERC20')
    const weth = await Mock.deploy('Wrapped Ether', 'WETH', 18)
    const addr = { tap: await tap.getAddress(), foundry: await foundry.getAddress(), weth: await weth.getAddress() }
    return { tap, escrow, foundry, weth, deployer, reserve, liquidity, ops, stranger, addr }
  }

  it('is the one-door recipient: no owner, no withdraw, nothing but pull', async () => {
    const { tap } = await loadFixture(deploy)
    const fns = tap.interface.fragments.filter((f) => f.type === 'function').map((f) => (f as unknown as { name: string }).name).sort()
    expect(fns).to.deep.equal(['escrow', 'foundry', 'pull', 'pullToken', 'totalNativeForwarded', 'totalTokenForwarded'])
  })

  it('claims native fees from the escrow and routes them through the Foundry, permissionlessly', async () => {
    const { tap, escrow, stranger, reserve, liquidity, ops, addr } = await loadFixture(deploy)
    const fee = ethers.parseEther('1')
    await escrow.credit(addr.tap, { value: fee })
    expect(await escrow.balanceOf(addr.tap)).to.equal(fee)

    const before = await Promise.all([reserve, liquidity, ops].map((s) => ethers.provider.getBalance(s.address)))
    await expect(tap.connect(stranger).pull()).to.emit(tap, 'Pulled').withArgs(stranger.address, fee)
    const after = await Promise.all([reserve, liquidity, ops].map((s) => ethers.provider.getBalance(s.address)))

    expect(after[0] - before[0]).to.equal((fee * 6_000n) / 10_000n)
    expect(after[1] - before[1]).to.equal((fee * 2_500n) / 10_000n)
    expect(after[2] - before[2]).to.equal((fee * 1_500n) / 10_000n)
    expect(await ethers.provider.getBalance(addr.tap)).to.equal(0n)
    expect(await ethers.provider.getBalance(addr.foundry)).to.equal(0n)
    expect(await escrow.balanceOf(addr.tap)).to.equal(0n)
    expect(await tap.totalNativeForwarded()).to.equal(fee)
  })

  it('claims an ERC-20 quote asset and routes it', async () => {
    const { tap, escrow, weth, deployer, reserve, addr } = await loadFixture(deploy)
    const fee = ethers.parseEther('3')
    await weth.mint(deployer.address, fee)
    await weth.approve(await escrow.getAddress(), fee)
    await escrow.creditToken(addr.tap, addr.weth, fee)

    await tap.pullToken(addr.weth)
    expect(await weth.balanceOf(reserve.address)).to.equal((fee * 6_000n) / 10_000n)
    expect(await weth.balanceOf(addr.tap)).to.equal(0n)
    expect(await weth.balanceOf(addr.foundry)).to.equal(0n)
  })

  it('forwards ETH sent directly to it, so nothing can be stranded', async () => {
    const { tap, deployer, reserve, addr } = await loadFixture(deploy)
    await deployer.sendTransaction({ to: addr.tap, value: ethers.parseEther('0.5') })
    const before = await ethers.provider.getBalance(reserve.address)
    await tap.pull() // escrow has nothing; its NoBalance revert is swallowed
    expect((await ethers.provider.getBalance(reserve.address)) - before).to.equal(ethers.parseEther('0.3'))
  })

  it('reverts when there is nothing anywhere, rather than emitting a zero', async () => {
    const { tap } = await loadFixture(deploy)
    await expect(tap.pull()).to.be.revertedWithCustomError(tap, 'NothingToPull')
  })

  it('rejects zero addresses at construction', async () => {
    const Tap = await ethers.getContractFactory('ZealTap')
    const [a] = await ethers.getSigners()
    await expect(Tap.deploy(ethers.ZeroAddress, a.address)).to.be.revertedWithCustomError(Tap, 'ZeroAddress')
    await expect(Tap.deploy(a.address, ethers.ZeroAddress)).to.be.revertedWithCustomError(Tap, 'ZeroAddress')
  })
})
