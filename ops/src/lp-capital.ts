import {ethers} from 'ethers'
import {readFileSync,existsSync} from 'node:fs'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {CHAIN} from './config.js'
import {capitalPlan} from './lp-capital-plan.js'
import {marketPrices} from './market-price.js'
import {atomicJson,withLock,stateDir} from './ops-lock.js'
import {managedSend} from './managed-send.js'
const root=new URL('../',import.meta.url).pathname,run=promisify(execFile)
const config=JSON.parse(readFileSync(root+'cloud/lp-reinvest.json','utf8'))
const P2='0x000000000022D473030F116dDEE9F6B43aC78BA3',Z='0x0b151Ff7a7c5250130EC16C275790961d558E402'
const p=new ethers.JsonRpcProvider(CHAIN.rpc,4663,{staticNetwork:true,cacheTimeout:-1}),abi=ethers.AbiCoder.defaultAbiCoder()
const pm=new ethers.Contract(config.positionManager,['function ownerOf(uint256) view returns(address)','function getPositionLiquidity(uint256) view returns(uint128)','function getPoolAndPositionInfo(uint256) view returns(tuple(address,address,uint24,int24,address),uint256)','function modifyLiquidities(bytes,uint256) payable'],p)
const token=new ethers.Contract(Z,['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],p)
const helper=new ethers.Contract(config.address,['function collect() returns(uint256,uint256,uint256,uint256)','function budget0() view returns(uint256)','function budget1() view returns(uint256)'],p)
const permit=new ethers.Contract(P2,['function allowance(address,address,address) view returns(uint160,uint48,uint48)','function approve(address,address,uint160,uint48)'],p)
const sv=new ethers.Contract(config.stateView,['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)'],p)
const file=root+'cloud/lp-capital-plan.json'
async function main(){
 const execute=process.argv.includes('--execute')
 if((await pm.ownerOf(config.tokenId)).toLowerCase()!==config.owner.toLowerCase())throw Error('Wrong LP owner')
 if(await helper.budget0()!==0n||await helper.budget1()!==0n)throw Error('Reconcile helper fee residue first')
 const prices=await marketPrices(),fair=prices.zecUsd/prices.ethUsd
 const sqrt=(await sv.getSlot0(config.poolId))[0] as bigint
 const pool=1e-10/(Number(sqrt)/2**96)**2
 if(Math.abs(pool/fair-1)>.01)throw Error('Wait until within 1% of reference')
 const [,info]=await pm.getPoolAndPositionInfo(config.tokenId)
 const lowTick=Number(BigInt.asIntN(24,info>>8n)),highTick=Number(BigInt.asIntN(24,info>>32n))
 if(lowTick!==-887220||highTick!==887220)throw Error('Unexpected position range')
 const low=BigInt(Math.floor(Math.sqrt(1.0001**lowTick)*2**96)),high=BigInt(Math.floor(Math.sqrt(1.0001**highTick)*2**96))
 const fee=await helper.collect.staticCall({from:config.operator})
 let record:any,plan:ReturnType<typeof capitalPlan>
 if(!execute){
  const [eth,z,ownerZ]=await Promise.all([p.getBalance(config.operator),token.balanceOf(config.operator),token.balanceOf(config.owner)])
  plan=capitalPlan(sqrt,low,high,eth,z,fee[0],fee[1],ownerZ)
  record={id:'capital-20260907',owner:config.owner,keeper:config.operator,tokenId:config.tokenId,createdAt:new Date().toISOString(),ownerZ:String(ownerZ),keeperEth:String(eth),keeperZ:String(z),...Object.fromEntries(Object.entries(plan).map(([k,v])=>[k,String(v)]))}
  if(existsSync(file))throw Error('Capital plan already exists; inspect before replacing')
  atomicJson(file,record)
 }else{
  record=JSON.parse(readFileSync(file,'utf8'))
  const currentEth=await p.getBalance(config.operator),currentZ=await token.balanceOf(config.operator)
  if(currentEth<ethers.parseEther('1.25')||currentZ<120_000_000n)throw Error('Keeper operating floors breached')
  // Requote using only the transferred capital plus fee credits and recorded owner token dust.
  plan=capitalPlan(sqrt,low,high,ethers.parseEther('1.25')+BigInt(record.funding0),120_000_000n+BigInt(record.funding1),fee[0],fee[1],BigInt(record.ownerZ))
  if(await token.balanceOf(config.owner)<BigInt(record.funding1)+BigInt(record.ownerZ))throw Error('Capital funding not received')
 }
 console.log(JSON.stringify({keeperFundingETH:ethers.formatEther(plan.funding0),keeperFundingZzec:Number(plan.funding1)/1e8,grossLiquidityETH:ethers.formatEther(plan.need0),grossLiquidityZzec:Number(plan.need1)/1e8,feeETH:ethers.formatEther(fee[0]),feeZzec:Number(fee[1])/1e8,addedLiquidity:String(plan.L)}))
 if(!execute)return
 const stateFile=stateDir+record.id+'-deposit.json'
 if(existsSync(stateFile))throw Error('Deposit already attempted; reconcile before repeating')
 const pass=(await run('security',['find-generic-password','-s','zeal-burner','-w'])).stdout.trimEnd()
 const unlocked=await ethers.Wallet.fromEncryptedJson(readFileSync('/Users/kyle/zeal-ops/.keys/deployer.json','utf8'),pass)
 const w=new ethers.Wallet(unlocked.privateKey,p)
 if(w.address.toLowerCase()!==config.owner.toLowerCase())throw Error('Wrong owner key')
 const [allow,pallow]=await Promise.all([token.allowance(w.address,P2),permit.allowance(w.address,Z,config.positionManager)])
 if(allow<plan.max1){await managedSend(w,await token.approve.populateTransaction(P2,plan.max1))}
 if(pallow[0]<plan.max1||Number(pallow[1])<Math.floor(Date.now()/1000)+120){await managedSend(w,await permit.approve.populateTransaction(Z,config.positionManager,plan.max1,Math.floor(Date.now()/1000)+3600))}
 const latest=await p.getBlock('latest');if(!latest)throw Error('No latest block')
 const params=[abi.encode(['uint256','uint256','uint128','uint128','bytes'],[config.tokenId,plan.L,plan.max0,plan.max1,'0x']),abi.encode(['address','address'],[ethers.ZeroAddress,Z]),abi.encode(['address','address','address'],[ethers.ZeroAddress,Z,w.address]),abi.encode(['address','address'],[ethers.ZeroAddress,w.address])]
 const request=await pm.modifyLiquidities.populateTransaction(abi.encode(['bytes','bytes[]'],['0x000d1114',params]),latest.timestamp+60,{value:plan.funding0})
 const gas=await p.estimateGas({...request,from:w.address});const price=(await p.getFeeData()).maxFeePerGas
 if(!price||await p.getBalance(w.address)<plan.funding0+gas*price*2n+ethers.parseEther('0.02'))throw Error('Owner gas floor or funds insufficient')
 if(Date.now()-prices.at>20000)throw Error('Deposit reference quote stale; replan')
 const before=await pm.getPositionLiquidity(config.tokenId)
 atomicJson(stateFile,{phase:'pending',at:new Date().toISOString(),addedLiquidity:String(plan.L),value:String(plan.funding0)})
 const tx=await managedSend(w,request),receipt=await tx.wait()
 const after=await pm.getPositionLiquidity(config.tokenId)
 if(after!==before+plan.L)throw Error('Position increase mismatch: '+tx.hash)
 atomicJson(stateFile,{phase:'complete',tx:tx.hash,at:new Date().toISOString(),before:String(before),after:String(after),addedLiquidity:String(plan.L),gasUsed:String(receipt!.gasUsed),gasPrice:String(receipt!.gasPrice)})
 console.log('Liquidity added to existing wallet-owned position:',tx.hash,'increase',Number(plan.L)/Number(before)*100+'%')
}
withLock('burn',()=>withLock('lp-capital',main)).catch(e=>{console.error(e?.shortMessage??e?.message);process.exitCode=1})
