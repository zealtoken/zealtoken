import { expect } from 'chai'
import { ethers, network } from 'hardhat'

;(process.env.FORK_URL ? describe : describe.skip)('Deployed WrapDesk readiness (local fork only)', function () {
  this.timeout(120000)
  it('requires the owner activation, then mints once to the requester and preserves backing', async () => {
    await network.provider.send('hardhat_reset', [{forking:{jsonRpcUrl:process.env.FORK_URL}}])
    await network.provider.send('evm_mine')
    const address = '0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
    const z = await ethers.getContractAt('ZZEC','0x0b151Ff7a7c5250130EC16C275790961d558E402')
    const d = await ethers.getContractAt('WrapDesk',address)
    const [,alice] = await ethers.getSigners()
    const operatorAddress = await d.operator()
    await network.provider.send('hardhat_impersonateAccount',[operatorAddress])
    await network.provider.send('hardhat_setBalance',[operatorAddress,'0x56BC75E2D63100000'])
    const operator = await ethers.getSigner(operatorAddress)
    const amount = await d.minAmount(), id = await d.requestCount()
    await d.connect(alice).request(amount)
    const proof = ethers.id('LOCAL FORK ONLY: synthetic deposit evidence, no native ZEC transferred')
    if ((await z.minter()).toLowerCase() !== address.toLowerCase()) {
      await expect(d.connect(operator).fulfill(id,proof)).to.be.revertedWithCustomError(z,'NotMinter')
      await expect(z.connect(alice).commitMinter()).to.be.revertedWithCustomError(z,'OwnableUnauthorizedAccount')
      const owner = await z.owner(), pending = await z.pendingMinter()
      expect(pending.account.toLowerCase()).to.equal(address.toLowerCase())
      const block = await ethers.provider.getBlock('latest')
      if (pending.eta > BigInt(block!.timestamp)) await network.provider.send('evm_setNextBlockTimestamp',[Number(pending.eta)+1])
      await network.provider.send('hardhat_impersonateAccount',[owner])
      await network.provider.send('hardhat_setBalance',[owner,'0x56BC75E2D63100000'])
      await z.connect(await ethers.getSigner(owner)).commitMinter()
    }
    const before = await z.balanceOf(alice.address)
    await expect(d.connect(alice).fulfill(id,proof)).to.be.revertedWithCustomError(d,'NotOperator')
    await d.connect(operator).fulfill(id,proof)
    expect(await z.balanceOf(alice.address)).to.equal(before+amount)
    expect(await z.totalSupply()).to.be.lte(await z.reserveZats())
    await expect(d.connect(operator).fulfill(id,proof)).to.be.revertedWithCustomError(d,'NotOpen')
  })
})
