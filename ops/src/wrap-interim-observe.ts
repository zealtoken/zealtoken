/** Read-only public preflight; never loads keys, assigns addresses, sweeps or mints. */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { provider } from './chain.js'
import { CONTRACTS } from './config.js'
import { ROUTE_DESK,INTERIM_DESK } from './wrap-interim-policy.js'
import { deriveDepositAddress,verifyRoute,eligibleOutput } from './wrap-v2-policy.js'
import { RESERVE_NODES,reserveRpc } from './reserve-rpc.js'
import { addressUtxos,blockTime } from './zcash-light.js'
async function main(){
 const config=JSON.parse(readFileSync(new URL('../launchd/wrap-v2-public.json',import.meta.url),'utf8'))
 if(config.encryptedKey||config.version!==2||config.network!=='zcash-mainnet'||ethers.id(config.xpub)!==config.fingerprint)throw Error('Expected public-only deposit config')
 if((await provider.getNetwork()).chainId!==4663n)throw Error('Wrong EVM network')
 const desk=new ethers.Contract(ROUTE_DESK,['function depositKeyFingerprint() view returns(bytes32)','function operator() view returns(address)','function requestsPaused() view returns(bool)','function creditsPaused() view returns(bool)','function requestCount() view returns(uint256)','function route(uint256) view returns(tuple(address recipient,uint64 requestedAt,string depositAddress,uint256 creditedZats))'],provider)
 const old=new ethers.Contract(INTERIM_DESK,['function operator() view returns(address)'],provider)
 const token=new ethers.Contract(CONTRACTS.zzec,['function minter() view returns(address)'],provider)
 if(await desk.depositKeyFingerprint()!==config.fingerprint)throw Error('Wrong pinned deposit wallet')
 if(String(await old.operator()).toLowerCase()!==String(await desk.operator()).toLowerCase())throw Error('Operator mismatch')
 if(String(await token.minter()).toLowerCase()!==INTERIM_DESK.toLowerCase())throw Error('Temporary minter path no longer applies')
 const count=Number(await desk.requestCount())
 if(!Number.isSafeInteger(count)||count>10000)throw Error('Route count requires bounded indexer review')
 console.log(JSON.stringify({mode:'read-only',registry:ROUTE_DESK,legacyMinter:INTERIM_DESK,requestsPaused:await desk.requestsPaused(),v2CreditsPaused:await desk.creditsPaused(),routes:count}))
 if(!count)return
 // Inspect one route at a time: no unbounded address scan or automatic assignment.
 const id=Number(process.env.WRAP_ROUTE_ID??'0')
 if(!Number.isSafeInteger(id)||id<0||id>=count)throw Error('Invalid WRAP_ROUTE_ID')
 const value=await desk.route(id)
 if(!value.depositAddress){console.log(`Route ${id} awaits verified address assignment. No deposit instructions issued.`);return}
 const route={id,recipient:String(value.recipient),requestedAt:Number(value.requestedAt),depositAddress:String(value.depositAddress)}
 verifyRoute(config.xpub,route)
 const results=await Promise.all(RESERVE_NODES.map(async host=>{
  const [info,outputs]=await Promise.all([reserveRpc(host,'GetLightdInfo',{}),addressUtxos(deriveDepositAddress(config.xpub,id),host)])
  if(info.chainName!=='main')throw Error('Wrong Zcash network')
  return {height:Number(info.blockHeight),outputs}
 }))
 const keys=(r:typeof results[number])=>r.outputs.map(o=>`${o.txid}:${o.index}:${o.valueZat}:${o.height}`).sort().join('|')
 if(keys(results[0])!==keys(results[1]))throw Error('Deposit sources disagree')
 for(const o of results[0].outputs){
  const b=results[1].outputs.find(x=>x.txid===o.txid&&x.index===o.index)!
  if(o.height<=0){console.log(`${o.txid}:${o.index} awaiting confirmations`);continue}
  const times=await Promise.all(RESERVE_NODES.map(host=>blockTime(o.height,host)))
  try{const amount=eligibleOutput(o,b,results[0].height,results[1].height,route.requestedAt,times[0],times[1]);console.log(JSON.stringify({routeId:id,recipient:route.recipient,txid:o.txid,index:o.index,actualZats:String(amount),status:'confirmed candidate; raw transaction, consolidation, accounting and prior-credit checks still required'}))}
  catch{console.log(`${o.txid}:${o.index} held for confirmation or manual review`)}
 }
}
main().catch(()=>{console.error('Interim wrap preflight failed. No signing or funds movement performed.');process.exitCode=1}).finally(()=>provider.destroy())
