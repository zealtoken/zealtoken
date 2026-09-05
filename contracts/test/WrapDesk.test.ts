import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const T1 = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
const TXID = ethers.id('zcash-tx')
describe('WrapDesk', () => {
  async function deploy() {
    const [owner, attestor, minter, operator, alice, bob] = await ethers.getSigners()
    const zzec = await (await ethers.getContractFactory('ZZEC')).deploy(T1, owner.address, attestor.address, minter.address, 36 * 3600)
    const desk = await (await ethers.getContractFactory('WrapDesk')).deploy(await zzec.getAddress(), owner.address, operator.address, 1_00000n)
    // the desk becomes the minter through ZZEC's own 48h timelock
    await zzec.proposeMinter(await desk.getAddress())
    await time.increase(48 * 3600 + 1)
    await zzec.commitMinter()
    await zzec.connect(attestor).attest(10_00000000n, ethers.id('proof'))
    return { zzec, desk, owner, attestor, minter, operator, alice, bob }
  }

  it('assigns unique deposit tags and validates amounts', async () => {
    const { desk, alice, bob } = await loadFixture(deploy)
    await expect(desk.connect(alice).request(50n)).to.be.revertedWithCustomError(desk, 'BelowMinimum')
    await expect(desk.connect(alice).request(1_00000001n)).to.be.revertedWithCustomError(desk, 'NotTagAligned')
    await expect(desk.connect(alice).request(1_00000000n)).to.emit(desk, 'Requested').withArgs(0, alice.address, 1_00000000n, 1_00000001n)
    await expect(desk.connect(bob).request(1_00000000n)).to.emit(desk, 'Requested').withArgs(1, bob.address, 1_00000000n, 1_00000002n)
    expect(await desk.depositZats(0)).to.equal(1_00000001n)
    expect(await desk.depositZats(1)).to.equal(1_00000002n)
    const s = await desk.summary(1)
    expect(s.requester).to.equal(bob.address); expect(s.status).to.equal(1n); expect(s.deposit).to.equal(1_00000002n)
  })

  it('fulfil mints exactly the requested amount to the requester, once, with a txid', async () => {
    const { zzec, desk, operator, alice, bob } = await loadFixture(deploy)
    await desk.connect(alice).request(2_00000000n)
    await expect(desk.connect(alice).fulfill(0, TXID)).to.be.revertedWithCustomError(desk, 'NotOperator')
    await expect(desk.connect(operator).fulfill(0, ethers.ZeroHash)).to.be.revertedWithCustomError(desk, 'ZeroTxid')
    await expect(desk.connect(operator).fulfill(0, TXID)).to.emit(desk, 'Fulfilled').withArgs(0, alice.address, 2_00000000n, TXID)
    expect(await zzec.balanceOf(alice.address)).to.equal(2_00000000n)
    expect((await desk.getRequest(0)).zcashTxid).to.equal(TXID)
    await expect(desk.connect(operator).fulfill(0, TXID)).to.be.revertedWithCustomError(desk, 'NotOpen')
    // the old minter key can no longer mint directly
    const [, , minter] = await ethers.getSigners()
    await expect(zzec.connect(minter).mint(bob.address, 1n)).to.be.revertedWithCustomError(zzec, 'NotMinter')
  })

  it('ZZEC coverage and freshness still bound desk mints', async () => {
    const { zzec, desk, operator, alice } = await loadFixture(deploy)
    await desk.connect(alice).request(11_00000000n) // more than the 10 ZEC attested
    await expect(desk.connect(operator).fulfill(0, TXID)).to.be.revertedWithCustomError(zzec, 'WouldExceedReserve')
    await desk.connect(alice).request(1_00000000n)
    await time.increase(37 * 3600)
    await expect(desk.connect(operator).fulfill(1, TXID)).to.be.revertedWithCustomError(zzec, 'StaleAttestation')
  })

  it('cancel and reject close a request without touching supply; operatorMint tags reserve-growth mints', async () => {
    const { zzec, desk, operator, alice, bob } = await loadFixture(deploy)
    await desk.connect(alice).request(1_00000000n)
    await expect(desk.connect(bob).cancel(0)).to.be.revertedWithCustomError(desk, 'NotRequester')
    await expect(desk.connect(alice).cancel(0)).to.emit(desk, 'Cancelled').withArgs(0)
    await expect(desk.connect(operator).fulfill(0, TXID)).to.be.revertedWithCustomError(desk, 'NotOpen')
    await desk.connect(bob).request(1_00000000n)
    await expect(desk.connect(operator).reject(1, 'sent 0.9')).to.emit(desk, 'Rejected').withArgs(1, 'sent 0.9')
    expect(await zzec.totalSupply()).to.equal(0n)
    await expect(desk.connect(operator).operatorMint(bob.address, 3_00000000n, TXID)).to.emit(desk, 'ReserveMint').withArgs(bob.address, 3_00000000n, TXID)
    expect(await zzec.balanceOf(bob.address)).to.equal(3_00000000n)
    await expect(desk.connect(alice).operatorMint(alice.address, 1n, TXID)).to.be.revertedWithCustomError(desk, 'NotOperator')
  })

  it('owner controls: operator, minimum (tag-aligned), pause on new requests only', async () => {
    const { desk, owner, operator, alice, bob } = await loadFixture(deploy)
    await expect(desk.connect(owner).setMinAmount(123n)).to.be.revertedWithCustomError(desk, 'NotTagAligned')
    await desk.connect(owner).setMinAmount(5_00000n)
    await expect(desk.connect(alice).request(1_00000n)).to.be.revertedWithCustomError(desk, 'BelowMinimum')
    await desk.connect(alice).request(1_00000000n)
    await desk.connect(owner).setRequestsPaused(true)
    await expect(desk.connect(bob).request(1_00000000n)).to.be.revertedWithCustomError(desk, 'Paused')
    await desk.connect(owner).setOperator(bob.address)
    await expect(desk.connect(operator).fulfill(0, TXID)).to.be.revertedWithCustomError(desk, 'NotOperator')
    await expect(desk.connect(bob).fulfill(0, TXID)).to.emit(desk, 'Fulfilled')
  })
})
