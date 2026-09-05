import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const T1 = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
describe('RedemptionDesk', () => {
  async function deploy() {
    const [owner, attestor, minter, operator, holder, stranger] = await ethers.getSigners()
    const zzec = await (await ethers.getContractFactory('ZZEC')).deploy(T1, owner.address, attestor.address, minter.address, 36 * 3600)
    await zzec.connect(attestor).attest(10_00000000n, ethers.id('proof'))
    await zzec.connect(minter).mint(holder.address, 5_00000000n)
    const desk = await (await ethers.getContractFactory('RedemptionDesk')).deploy(await zzec.getAddress(), owner.address, operator.address, 1_00000n) // min 0.001 zZEC
    await zzec.connect(holder).approve(await desk.getAddress(), ethers.MaxUint256)
    return { zzec, desk, owner, operator, holder, stranger, d: await desk.getAddress() }
  }

  it('escrows zZEC on request instead of burning it, and validates the address', async () => {
    const { zzec, desk, holder, d } = await loadFixture(deploy)
    await expect(desk.connect(holder).request(50n, T1)).to.be.revertedWithCustomError(desk, 'BelowMinimum')
    await expect(desk.connect(holder).request(1_00000000n, 'zs1shieldedaddress')).to.be.revertedWithCustomError(desk, 'NotTransparentAddress')
    await expect(desk.connect(holder).request(1_00000000n, T1)).to.emit(desk, 'Requested').withArgs(0, holder.address, 1_00000000n, T1)
    expect(await zzec.balanceOf(d)).to.equal(1_00000000n)
    expect(await zzec.totalSupply()).to.equal(5_00000000n) // nothing burned yet
    const r = await desk.getRequest(0)
    expect(r.status).to.equal(1n)
  })

  it('fulfil records the Zcash txid and only then burns the escrow through the wrapper', async () => {
    const { zzec, desk, operator, holder, stranger, d } = await loadFixture(deploy)
    await desk.connect(holder).request(1_00000000n, T1)
    const txid = ethers.id('zcash-tx')
    await expect(desk.connect(stranger).fulfill(0, txid)).to.be.revertedWithCustomError(desk, 'NotOperator')
    await expect(desk.connect(operator).fulfill(0, ethers.ZeroHash)).to.be.revertedWithCustomError(desk, 'ZeroTxid')
    await expect(desk.connect(operator).fulfill(0, txid)).to.emit(desk, 'Fulfilled').withArgs(0, txid, 1n).and.to.emit(zzec, 'RedemptionRequested').withArgs(1n, d, 1_00000000n, T1)
    expect(await zzec.balanceOf(d)).to.equal(0n)
    expect(await zzec.totalSupply()).to.equal(4_00000000n)
    const r = await desk.getRequest(0)
    expect(r.status).to.equal(2n); expect(r.zcashTxid).to.equal(txid)
    await expect(desk.connect(operator).fulfill(0, txid)).to.be.revertedWithCustomError(desk, 'NotOpen')
  })

  it('the holder reclaims after 7 days, nobody can stop it, and the operator cannot fulfil after', async () => {
    const { zzec, desk, owner, operator, holder, stranger } = await loadFixture(deploy)
    await desk.connect(holder).request(2_00000000n, T1)
    await expect(desk.connect(holder).reclaim(0)).to.be.revertedWithCustomError(desk, 'WindowNotElapsed')
    await expect(desk.connect(stranger).reclaim(0)).to.be.revertedWithCustomError(desk, 'NotHolder').catch(() => {})
    await time.increase(7 * 86400 + 1)
    await desk.connect(owner).setRequestsPaused(true) // pausing new requests never blocks the exit
    await expect(desk.connect(stranger).reclaim(0)).to.be.revertedWithCustomError(desk, 'NotHolder')
    await expect(desk.connect(holder).reclaim(0)).to.emit(desk, 'Reclaimed').withArgs(0, holder.address, 2_00000000n)
    expect(await zzec.balanceOf(holder.address)).to.equal(5_00000000n)
    await expect(desk.connect(operator).fulfill(0, ethers.id('late'))).to.be.revertedWithCustomError(desk, 'NotOpen')
    await expect(desk.connect(holder).request(1_00000000n, T1)).to.be.revertedWithCustomError(desk, 'Paused')
  })

  it('the desk has no path to move escrow anywhere but back to the holder or into the burn', async () => {
    const { desk } = await loadFixture(deploy)
    const fns = desk.interface.fragments.filter((f) => f.type === 'function').map((f) => (f as unknown as { name: string }).name).sort()
    expect(fns).to.deep.equal(['WINDOW', 'acceptOwnership', 'fulfill', 'getRequest', 'minAmount', 'operator', 'owner', 'pendingOwner', 'reclaim', 'reclaimableAt', 'renounceOwnership', 'request', 'requestCount', 'requestsPaused', 'setMinAmount', 'setOperator', 'setRequestsPaused', 'transferOwnership', 'zzec'])
  })
})
