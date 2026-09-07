import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
const PM='0x58daec3116aae6d93017baaea7749052e8a04fa7',SV='0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',P2='0x000000000022D473030F116dDEE9F6B43aC78BA3'
const OWNER='0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03',BOT='0x19cece80126b79F76D8b8297B876310a56349738',Z='0x0b151Ff7a7c5250130EC16C275790961d558E402'
const POOL='0xa6d41767e205c89fe05d7ad78354af7bb98cbe9b0c3c60f8371b05e7087fdb84',ID=1909208n
const abi=ethers.AbiCoder.defaultAbiCoder()
;(process.env.FORK_URL ? describe : describe.skip)('ZealLpReinvest against live Robinhood contracts (fork only)',()=>{
 async function setup(){
  for(const address of [OWNER,BOT]) {await network.provider.send('hardhat_impersonateAccount',[address]);await network.provider.send('hardhat_setBalance',[address,'0x56BC75E2D63100000'])}
  const owner=await ethers.getSigner(OWNER),bot=await ethers.getSigner(BOT),[outsider]=await ethers.getSigners()
  const pm=await ethers.getContractAt(['function approve(address,uint256)','function ownerOf(uint256) view returns(address)','function getPositionLiquidity(uint256) view returns(uint128)','function modifyLiquidities(bytes,uint256) payable'],PM,owner)
  const sv=await ethers.getContractAt(['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)'],SV)
  const token=await ethers.getContractAt(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'],Z)
  const f=await (await ethers.getContractFactory('ZealLpReinvest',owner)).deploy(PM,SV,P2,ID,OWNER,BOT,POOL);await f.waitForDeployment()
  await pm.approve(await f.getAddress(),ID)
  const sqrt=(await sv.getSlot0(POOL))[0];const min=sqrt*9990n/10000n,max=sqrt*10010n/10000n
  const deadline=async()=>(await ethers.provider.getBlock('latest'))!.timestamp+60
  return {f,pm,token,owner,bot,outsider,min,max,deadline}
 }
 it('reinvests all fees without an owner payout; preserves ownership and allowances',async()=>{
  const {f,pm,token,bot,min,max,deadline}=await loadFixture(setup)
  const before=await pm.getPositionLiquidity(ID),eth=await ethers.provider.getBalance(OWNER),zec=await token.balanceOf(OWNER)
  const fees=await f.connect(bot).collect.staticCall()
  console.log('Fork fee preview:',ethers.formatEther(fees[0]),'ETH +',Number(fees[1])/1e8,'zZEC')
  expect(fees[0]).gt(0);expect(fees[1]).gt(0)
  const quote=await f.connect(bot).compound.staticCall(min,max,1,await deadline())
  await expect(f.connect(bot).compound(min,max,quote[0]*995n/1000n,await deadline())).emit(f,'Reinvested')
  expect(await pm.ownerOf(ID)).eq(OWNER)
  expect(await pm.getPositionLiquidity(ID)).eq(before+quote[0])
  expect((await ethers.provider.getBalance(OWNER))-eth).eq(0)
  expect((await token.balanceOf(OWNER))-zec).eq(0)
  expect(await token.allowance(await f.getAddress(),P2)).eq(0)
  expect(quote[1]).lte(fees[0]);expect(quote[2]).lte(fees[1])
 })
 it('rejects outsiders, stale quotes and off-market bounds with no collection',async()=>{
  const {f,pm,bot,outsider,min,max,deadline}=await loadFixture(setup)
  const before=await pm.getPositionLiquidity(ID)
  await expect(f.connect(outsider).collect()).revertedWithCustomError(f,'NotAllowed')
  await expect(f.connect(outsider).withdrawFees()).revertedWithCustomError(f,'NotAllowed')
  await expect(f.connect(bot).compound(min,max,1,1)).revertedWithCustomError(f,'InvalidQuote')
  await expect(f.connect(bot).compound(1,2,1,await deadline())).revertedWithCustomError(f,'InvalidQuote')
  await expect(f.connect(bot).compound(min,max,(1n<<127n),await deadline())).revertedWithCustomError(f,'InvalidQuote')
  expect(await pm.getPositionLiquidity(ID)).eq(before);expect(await f.budget0()).eq(0)
 })
 it('collection and uninvested-fee withdrawal cannot change principal; pause and revocation work',async()=>{
  const {f,pm,owner,bot,min,max,deadline}=await loadFixture(setup)
  const before=await pm.getPositionLiquidity(ID)
  await f.connect(bot).collect()
  expect(await pm.getPositionLiquidity(ID)).eq(before)
  await expect(f.connect(bot).withdrawFees()).revertedWithCustomError(f,'NotAllowed')
  await f.connect(owner).setPaused(true)
  await expect(f.connect(bot).compound(min,max,1,await deadline())).revertedWithCustomError(f,'NotAllowed')
  await f.connect(owner).withdrawFees()
  expect(await f.budget0()).eq(0);expect(await f.budget1()).eq(0)
  expect(await pm.getPositionLiquidity(ID)).eq(before)
  await f.connect(owner).setPaused(false)
  await pm.approve(ethers.ZeroAddress,ID)
  await expect(f.connect(bot).collect()).reverted
 })
 it('owner can withdraw ALL liquidity while the helper is approved',async()=>{
  const {f,pm,bot,min,max,deadline}=await loadFixture(setup)
  const before=await pm.getPositionLiquidity(ID)
  const params=[abi.encode(['uint256','uint256','uint128','uint128','bytes'],[ID,before,0,0,'0x']),abi.encode(['address','address','address'],[ethers.ZeroAddress,Z,OWNER])]
  await pm.modifyLiquidities(abi.encode(['bytes','bytes[]'],['0x0111',params]),(await ethers.provider.getBlock('latest'))!.timestamp+60)
  expect(await pm.getPositionLiquidity(ID)).eq(0)
  await expect(f.connect(bot).compound(min,max,1,await deadline())).revertedWithCustomError(f,'InvalidPosition')
  expect(await pm.ownerOf(ID)).eq(OWNER)
 })
})
