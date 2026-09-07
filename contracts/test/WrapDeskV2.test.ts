import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
const ADDRESS='t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw', OTHER='t1cS6wHSvxJat1zuayeFYSU8QmzQYutvuUK'
const TX=ethers.id('native payment'), SWEEP=ethers.id('confirmed consolidation')
describe('WrapDeskV2 permanent deposit routes',()=>{
 async function fixture(){
  const [owner,attestor,operator,alice,bob]=await ethers.getSigners()
  const z=await(await ethers.getContractFactory('ZZEC')).deploy(ADDRESS,owner.address,attestor.address,operator.address,129600)
  const d=await(await ethers.getContractFactory('WrapDeskV2')).deploy(await z.getAddress(),owner.address,operator.address,ethers.id('public account key'))
  await z.proposeMinter(await d.getAddress());await time.increase(172801);await z.commitMinter();await z.connect(attestor).attest(1000000000n,ethers.id('reserve'))
  return {z,d,owner,attestor,operator,alice,bob}
 }
 async function ready(){const f=await fixture();await f.d.setPaused(false,false);await f.d.connect(f.alice).request();await f.d.connect(f.operator).assignAddress(0,ADDRESS);return f}
 it('starts closed, owner alone controls opening',async()=>{const {d,alice}=await loadFixture(fixture);await expect(d.connect(alice).request()).revertedWithCustomError(d,'PausedNow');await expect(d.connect(alice).setPaused(false,false)).revertedWithCustomError(d,'OwnableUnauthorizedAccount')})
 it('one permanent route per wallet; requesting again does not consume IDs',async()=>{const {d,alice,bob}=await loadFixture(ready);await d.connect(alice).request();expect(await d.requestCount()).eq(1);await d.connect(bob).request();expect(await d.requestCount()).eq(2);expect((await d.route(0)).recipient).eq(alice.address);await d.setPaused(true,false);await d.connect(alice).request();expect(await d.requestCount()).eq(2)})
 it('address cannot be reassigned or reused by another recipient',async()=>{const {d,operator,bob}=await loadFixture(ready);await expect(d.connect(operator).assignAddress(0,OTHER)).revertedWithCustomError(d,'AlreadyAssigned');await d.connect(bob).request();await expect(d.connect(operator).assignAddress(1,ADDRESS)).revertedWithCustomError(d,'AlreadyAssigned');await expect(d.connect(bob).assignAddress(1,OTHER)).revertedWithCustomError(d,'NotOperator')})
 it('credits actual received amounts without requiring trailing tags',async()=>{const {z,d,operator,alice}=await loadFixture(ready);await d.connect(operator).credit(0,TX,0,107001,SWEEP);expect(await z.balanceOf(alice.address)).eq(107001);expect((await d.route(0)).creditedZats).eq(107001)})
 it('deduplicates globally by txid + output index, including across routes',async()=>{const {d,operator,bob}=await loadFixture(ready);await d.connect(operator).credit(0,TX,0,100001,SWEEP);await d.connect(bob).request();await d.connect(operator).assignAddress(1,OTHER);await expect(d.connect(operator).credit(1,TX,0,100001,SWEEP)).revertedWithCustomError(d,'DuplicateOutput');await d.connect(operator).credit(1,TX,1,100001,SWEEP)})
 it('accepts later deposits to the same immutable recipient',async()=>{const {z,d,operator,alice}=await loadFixture(ready);await d.connect(operator).credit(0,TX,0,100000,SWEEP);await d.connect(operator).credit(0,ethers.id('second'),0,223456,SWEEP);expect(await z.balanceOf(alice.address)).eq(323456)})
 it('fails before issuing for invalid amount or missing consolidation evidence',async()=>{const {d,operator}=await loadFixture(ready);for(const n of [0,99999,100000001])await expect(d.connect(operator).credit(0,TX,0,n,SWEEP)).revertedWithCustomError(d,'Invalid');await expect(d.connect(operator).credit(0,TX,0,100000,ethers.ZeroHash)).revertedWithCustomError(d,'Invalid')})
 it('cannot credit an unassigned route or mint via a non-operator',async()=>{const {d,operator,bob}=await loadFixture(ready);await d.connect(bob).request();await expect(d.connect(operator).credit(1,TX,0,100000,SWEEP)).revertedWithCustomError(d,'Invalid');await expect(d.connect(bob).credit(0,TX,0,100000,SWEEP)).revertedWithCustomError(d,'NotOperator')})
 it('backing failure rolls back consumption so a funded retry can succeed',async()=>{const {z,d,operator,attestor}=await loadFixture(ready);await z.connect(attestor).attest(0,ethers.id('empty'));await expect(d.connect(operator).credit(0,TX,0,100000,SWEEP)).revertedWithCustomError(z,'WouldExceedReserve');await z.connect(attestor).attest(100000,ethers.id('funded'));await d.connect(operator).credit(0,TX,0,100000,SWEEP)})
 it('credit pause also blocks reserve-growth mints',async()=>{const {d,operator,alice}=await loadFixture(ready);await d.setPaused(false,true);await expect(d.connect(operator).credit(0,TX,0,100000,SWEEP)).revertedWithCustomError(d,'PausedNow');await expect(d.connect(operator).operatorMint(alice.address,100000,TX)).revertedWithCustomError(d,'PausedNow')})
})
