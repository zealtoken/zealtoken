/** Cloud fee-only reinvestment. No LP owner credential is used by this job. */
import { ethers } from 'ethers'
import { existsSync, readFileSync } from 'node:fs'
import { CHAIN } from './config.js'
import { roleSigner } from './chain.js'
import { marketPrices } from './market-price.js'
import { managedSend } from './managed-send.js'
import { atomicJson, withLock, stateDir } from './ops-lock.js'

const configPath = new URL('../cloud/lp-reinvest.json',import.meta.url)
const provider = new ethers.JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true,cacheTimeout:-1})
const ABI = [
 'function beneficiary() view returns(address)', 'function operator() view returns(address)',
 'function tokenId() view returns(uint256)', 'function poolId() view returns(bytes32)',
 'function paused() view returns(bool)', 'function REINVEST_BPS() view returns(uint256)',
 'function collect() returns(uint256,uint256,uint256,uint256)',
 'function compound(uint160,uint160,uint128,uint256) returns(uint256,uint256,uint256)',
 'event Reinvested(uint256 liquidity,uint256 used0,uint256 used1)',
 'event FeesSplit(uint256 fee0,uint256 fee1,uint256 retained0,uint256 retained1)',
]
function active() {
 if (process.platform!=='linux' || !existsSync('/etc/zeal/ACTIVE') || !existsSync('/etc/zeal/LP_REINVEST_ACTIVE')) throw new Error('LP reinvestment cloud signing is not activated')
}
async function main() {
 const execute=process.argv.includes('--execute')
 if(execute)active()
 const config=JSON.parse(readFileSync(configPath,'utf8'))
 const contract=new ethers.Contract(config.address,ABI,provider)
 const code=await provider.getCode(config.address)
 if(ethers.keccak256(code)!==config.runtimeHash)throw new Error('LP reinvest helper code mismatch')
 const [owner,operator,id,pool,bps,paused]=await Promise.all([contract.beneficiary(),contract.operator(),contract.tokenId(),contract.poolId(),contract.REINVEST_BPS(),contract.paused()])
 if(owner.toLowerCase()!==config.owner.toLowerCase() || operator.toLowerCase()!==config.operator.toLowerCase() || String(id)!==config.tokenId || pool!==config.poolId || bps!==10000n)throw new Error('LP reinvest helper configuration mismatch')
 if(paused)throw new Error('LP reinvestment is paused by its owner')
 const pm=new ethers.Contract(config.positionManager,['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)'],provider)
 const [positionOwner,approval]=await Promise.all([pm.ownerOf(id),pm.getApproved(id)])
 if(positionOwner.toLowerCase()!==owner.toLowerCase() || approval.toLowerCase()!==config.address.toLowerCase())throw new Error('LP ownership or per-position approval changed; automation stopped')
 const fee=await contract.collect.staticCall({from:operator})
 const prices=await marketPrices()
 const usd=(a:bigint,b:bigint)=>Number(ethers.formatEther(a))*prices.ethUsd+Number(b)/1e8*prices.zecUsd
 console.log(`LP #${id}: newly accrued fees ~$${usd(fee[0],fee[1]).toFixed(2)}; available reinvestment funds ~$${usd(fee[2],fee[3]).toFixed(2)}`)
 const note=(reason:string)=>{console.log(reason);atomicJson(stateDir+'lp-reinvest-status.json',{at:new Date().toISOString(),reason,address:config.address})}
 if(fee[2]===0n || fee[3]===0n || usd(fee[2],fee[3])<5){note('Waiting for at least $5 of usable fee funds and both tokens');return}
 const fair=prices.zecUsd/prices.ethUsd
 const sv=new ethers.Contract(config.stateView,['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)'],provider)
 const block=await provider.getBlock('latest');if(!block)throw new Error('No latest block')
 const sqrt=(await sv.getSlot0(pool,{blockTag:block.number}))[0] as bigint
 const actual=1e-10/(Number(sqrt)/2**96)**2
 if(Math.abs(actual/fair-1)>.01){note('Waiting until pool is within 1% of the independent reference');return}
 // Bound both the independent reference and the observed pool quote.
 const sqrtFor=(ethPerZec:number)=>BigInt(Math.floor(Math.sqrt(1e-10/ethPerZec)*2**96))
 const low=[sqrtFor(fair*1.01),sqrt*9975n/10000n].reduce((a,b)=>a>b?a:b)
 const high=[sqrtFor(fair*.99),sqrt*10025n/10000n].reduce((a,b)=>a<b?a:b)
 const deadline=block.timestamp+90
 const quote=await contract.compound.staticCall(low,high,1n,deadline,{from:operator})
 const usedUsd=usd(quote[1],quote[2])
 if(usedUsd<5){note(`Waiting: matching token amounts would reinvest only $${usedUsd.toFixed(2)}`);return}
 const minL=quote[0]*995n/1000n
 const request=await contract.compound.populateTransaction(low,high,minL,deadline)
 const estimate=await provider.estimateGas({...request,from:operator})
 const feeData=await provider.getFeeData();const price=feeData.maxFeePerGas??feeData.gasPrice
 if(!price)throw new Error('Gas pricing unavailable')
 const gasLimit=estimate*120n/100n
 const gasUsd=Number(ethers.formatEther(gasLimit*price))*prices.ethUsd
 if(gasUsd>usedUsd*.02){note(`Waiting: conservative transaction cost $${gasUsd.toFixed(3)} exceeds 2% of the $${usedUsd.toFixed(2)} matching reinvestment`);return}
 if(await provider.getBalance(operator)<ethers.parseEther('0.01')+gasLimit*price)throw new Error('Keeper needs gas funding for LP reinvestment')
 console.log(`Plan: reinvest ~$${usedUsd.toFixed(2)} from allocated fees; transaction cost bound ~$${gasUsd.toFixed(3)}; allocate all new fees to your position`)
 if(!execute)return
 const signer=await roleSigner('keeper');if(signer.address.toLowerCase()!==operator.toLowerCase())throw new Error('Operator signer mismatch')
 active()
 if(Date.now()-prices.at>20000)throw new Error('LP reference quote expired; retry next scheduled pass')
 const tx=await managedSend(signer,{...request,gasLimit,...(feeData.maxFeePerGas?{maxFeePerGas:feeData.maxFeePerGas,maxPriorityFeePerGas:feeData.maxPriorityFeePerGas??0n}:{gasPrice:price})})
 const receipt=await tx.wait()
 const events=receipt!.logs.filter(l=>l.address.toLowerCase()===config.address.toLowerCase()).map(l=>contract.interface.parseLog(l)).filter(Boolean).map(l=>({name:l!.name,values:Array.from(l!.args).map(String)}))
 atomicJson(stateDir+'lp-reinvest-'+tx.hash+'.json',{at:new Date().toISOString(),tx:tx.hash,events,gasUsed:receipt!.gasUsed.toString(),gasPrice:receipt!.gasPrice.toString()})
 note('Reinvested successfully: '+tx.hash)
}
withLock('lp-reinvest',main).catch(e=>{console.error(e?.shortMessage??e?.message??e);process.exitCode=1})
