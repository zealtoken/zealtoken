import {expect} from 'chai'
import {ethers,network} from 'hardhat'
import fs from 'node:fs'
;(process.env.FORK_URL?describe:describe.skip)('Additional capital into existing zZEC position (fork only)',()=>{
 it('uses capital plus accrued fees, preserves owner and helper approval, and leaves operating floors',async()=>{
 const c=JSON.parse(fs.readFileSync('../ops/cloud/lp-reinvest.json','utf8'))
 const q=JSON.parse(fs.readFileSync('../ops/cloud/lp-capital-plan.json','utf8'))
 const z='0x0b151Ff7a7c5250130EC16C275790961d558E402',p2='0x000000000022D473030F116dDEE9F6B43aC78BA3'
 for(const a of [c.owner,c.operator])await network.provider.send('hardhat_impersonateAccount',[a])
 const owner=await ethers.getSigner(c.owner),keeper=await ethers.getSigner(c.operator)
 const token=await ethers.getContractAt(['function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'],z)
 const pm=await ethers.getContractAt(['function modifyLiquidities(bytes,uint256) payable','function getPositionLiquidity(uint256) view returns(uint128)','function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)'],c.positionManager,owner)
 const permit=await ethers.getContractAt(['function approve(address,address,uint160,uint48)'],p2,owner)
 await token.connect(keeper).getFunction('transfer')(c.owner,q.funding1)
 await keeper.sendTransaction({to:c.owner,value:q.funding0})
 expect(await ethers.provider.getBalance(c.operator)).gte(ethers.parseEther('1.25'))
 expect(await token.balanceOf(c.operator)).gte(120000000n)
 await token.connect(owner).getFunction('approve')(p2,q.max1)
 const now=(await ethers.provider.getBlock('latest'))!.timestamp
 await permit.approve(z,c.positionManager,q.max1,now+1000)
 const abi=ethers.AbiCoder.defaultAbiCoder(),params=[abi.encode(['uint256','uint256','uint128','uint128','bytes'],[c.tokenId,q.L,q.max0,q.max1,'0x']),abi.encode(['address','address'],[ethers.ZeroAddress,z]),abi.encode(['address','address','address'],[ethers.ZeroAddress,z,c.owner]),abi.encode(['address','address'],[ethers.ZeroAddress,c.owner])]
 const before=await pm.getPositionLiquidity(c.tokenId)
 await pm.modifyLiquidities(abi.encode(['bytes','bytes[]'],['0x000d1114',params]),now+60,{value:q.funding0})
 expect(await pm.getPositionLiquidity(c.tokenId)).eq(before+BigInt(q.L))
 expect(await pm.ownerOf(c.tokenId)).eq(c.owner)
 expect(await pm.getApproved(c.tokenId)).eq(c.address)
 expect(await ethers.provider.getBalance(c.owner)).gte(ethers.parseEther('0.02'))
 console.log('Verified extra liquidity:',q.L)
 })
})
