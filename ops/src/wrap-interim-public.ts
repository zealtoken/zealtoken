/** Public interim worker: permanent on-chain routes, checkpointed one-action runs. */
import {ethers} from 'ethers'
import {existsSync,readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {provider,roleSigner,zzec} from './chain.js'
import {withLock,atomicJson,readJson,stateDir} from './ops-lock.js'
import {managedSend} from './managed-send.js'
import {wrapAccounting} from './wrap-accounting.js'
import {redemptionAccounting,mintCapacity} from './redemption-accounting.js'
import {INTERIM_LEDGER} from './wrap-interim-accounting.js'
import {INTERIM_DESK,ROUTE_DESK,interimRef,requireSameRoute,validateInterimLedger,validateInterimMint,type InterimDeposit,type InterimLedger} from './wrap-interim-policy.js'
import {deriveDepositAddress,verifyRoute,eligibleOutput,addDeposit} from './wrap-v2-policy.js'
import {prepareDepositSweep,verifyDepositBytes,sweepIsConfirmed} from './wrap-interim-settlements.js'
import {scanInterimHistory} from './wrap-interim-history.js'
import {RESERVE_NODES,reserveRpc} from './reserve-rpc.js'
import {addressUtxos,blockTime} from './zcash-light.js'
let statusBase:any=null
const ROUTE_LIMIT=1000
const FINGERPRINT='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d'
const ABI=['function operator() view returns(address)','function creditsPaused() view returns(bool)','function requestsPaused() view returns(bool)','function depositKeyFingerprint() view returns(bytes32)','function route(uint256) view returns(tuple(address recipient,uint64 requestedAt,string depositAddress,uint256 creditedZats))','function assignAddress(uint256,string)','function requestCount() view returns(uint256)']
function inflight(){
 const file=process.env.REDEEM_LEDGER??'./redemptions.json'
 if(!existsSync(file))return 0n
 const raw=JSON.parse(readFileSync(file,'utf8')),entries=raw.entries??raw
 return Object.values(entries as Record<string,{txid:string;amountZats?:string}>).filter(x=>x.txid==='PENDING').reduce((s,x)=>s+BigInt(x.amountZats??'0'),0n)
}
async function main(){
 if(!process.argv.includes('--execute')){console.log('Public worker requires --execute and cloud checkpoint gates.');return}
 if(process.platform!=='linux'||!existsSync('/etc/zeal/WRAP_INTERIM_ACTIVE')||!process.env.WRAP_INTERIM_RUN_ID||!existsSync('/etc/zeal/ACTIVE'))throw Error('Cloud test gate missing')
 if(!existsSync(INTERIM_LEDGER))throw Error('Controlled test ledger must be initialized before activation')
 const ledger=validateInterimLedger(readJson<InterimLedger|null>(INTERIM_LEDGER,null))
 const config=JSON.parse(readFileSync(stateDir+'wrap-v2-public.json','utf8'))
 if(config.encryptedKey||config.fingerprint!==FINGERPRINT||ethers.id(config.xpub)!==FINGERPRINT)throw Error('Public config mismatch')
 if((await provider.getNetwork()).chainId!==4663n)throw Error('Wrong chain')
 const registry=new ethers.Contract(ROUTE_DESK,ABI,provider),token=zzec()
 if(await registry.depositKeyFingerprint()!==FINGERPRINT||!await registry.creditsPaused())throw Error('Registry must remain paused during controlled test')
 if(String(await token.minter()).toLowerCase()!==INTERIM_DESK.toLowerCase())throw Error('Legacy minter changed')
 const signer=await roleSigner('minter')
 const old=new ethers.Contract(INTERIM_DESK,['function operator() view returns(address)','function operatorMint(address,uint256,bytes32)'],signer)
 if(String(await registry.operator()).toLowerCase()!==signer.address.toLowerCase()||String(await old.operator()).toLowerCase()!==signer.address.toLowerCase())throw Error('Operator mismatch')
 const block=await provider.getBlockNumber()-12
 const totalRoutes=Number(await registry.requestCount({blockTag:block}))
 if(!Number.isSafeInteger(totalRoutes)||totalRoutes<0)throw Error('Invalid route count')
 const count=Math.min(totalRoutes,ROUTE_LIMIT)
 const routes=[]
 for(let id=0;id<count;id++){
  const r=await registry.route(id,{blockTag:block})
  const route={id,recipient:String(r.recipient),depositAddress:String(r.depositAddress),requestedAt:Number(r.requestedAt)}
  if(route.depositAddress)verifyRoute(config.xpub,route)
  routes.push(route)
 }
 const paused=await registry.requestsPaused()
 statusBase={version:1,totalRoutes,capacityReached:totalRoutes>=ROUTE_LIMIT,chainId:4663,registry:ROUTE_DESK,minter:INTERIM_DESK,requestsPaused:paused,minZats:'100000',maxZats:'100000000',routes,review:[]}
 const history=await scanInterimHistory()
 if(!history.caughtUp){console.log('Mint history catching up; no signing');return}
 const info=await Promise.all(RESERVE_NODES.map(host=>reserveRpc(host,'GetLightdInfo',{})))
 if(info.some(i=>i.chainName!=='main')||info[0].consensusBranchId!==info[1].consensusBranchId)throw Error('Zcash chain disagreement')
 const tips=info.map(i=>Number(i.blockHeight)),height=Math.min(...tips),branchId=parseInt(info[0].consensusBranchId,16)
 if(tips.some(h=>!Number.isSafeInteger(h)||h<=0)||Math.abs(tips[0]-tips[1])>2)throw Error('Zcash tip disagreement')
 const allOutputs=new Map<string,Awaited<ReturnType<typeof addressUtxos>>>()
 for(const route of routes.filter(r=>r.depositAddress)){
  const snapshots=await Promise.all(RESERVE_NODES.map(host=>addressUtxos(route.depositAddress,host)))
  const encode=(outs:typeof snapshots[number])=>outs.map(o=>`${o.txid}:${o.index}:${o.height}:${o.valueZat}`).sort().join('|')
  if(encode(snapshots[0])!==encode(snapshots[1]))throw Error('Deposit output disagreement')
  allOutputs.set(route.depositAddress,snapshots[0])
  for(const o of snapshots[0]){
   if(o.height<=0||height-o.height+1<3)continue
   if(ledger.deposits.some(d=>d.txid===o.txid&&d.index===o.index))continue
   if(o.valueZat<100000n||o.valueZat>100000000n){statusBase.review.push({routeId:route.id,txid:o.txid,index:o.index,amountZats:String(o.valueZat),reason:'outside automatic range'});continue}
   const times=await Promise.all(RESERVE_NODES.map(host=>blockTime(o.height,host)))
   if(Math.min(...times)<route.requestedAt){statusBase.review.push({routeId:route.id,txid:o.txid,index:o.index,amountZats:String(o.valueZat),reason:'payment predates route'});continue}
   eligibleOutput(o,o,tips[0],tips[1],route.requestedAt,times[0],times[1])
   ledger.deposits=addDeposit(ledger.deposits,route,o)
   atomicJson(INTERIM_LEDGER,ledger)
  }
 }
 const before=await wrapAccounting(),debt=await redemptionAccounting()
 // Pending deposits outside the central reserve do not spend the project's fee margin.
 const outside=ledger.deposits.filter(d=>d.state==='observed').reduce((n,d)=>n+BigInt(d.amountZats),0n)
 statusBase.feeCapacity=before.live-debt.supply-debt.reimbursementZats-inflight()-before.reserved+outside>=10000n
 statusBase.accepting=!paused&&statusBase.feeCapacity&&totalRoutes<ROUTE_LIMIT
 for(const d of ledger.deposits){
  const route=routes.find(r=>r.id===d.routeId)
  if(!route)throw Error('Ledger route missing')
  requireSameRoute(d,route)
  const prior=history.events.filter(e=>e.ref===interimRef(d.txid,d.index))
  if(prior.length>1)throw Error('Duplicate on-chain native-output credits detected')
  if(prior.length){
   const e=prior[0]
   if(e.recipient.toLowerCase()!==d.recipient.toLowerCase()||e.amountZats!==d.amountZats)throw Error('Historical credit mismatch')
   if(!d.sweepRaw)throw Error('Credit exists but sweep record missing: restore and reconcile; never mint again')
   if(d.mintTxid&&d.mintTxid!==e.txid)throw Error('Mint transaction identity changed')
   const [tx,receipt,head]=await Promise.all([provider.getTransaction(e.txid),provider.getTransactionReceipt(e.txid),provider.getBlockNumber()])
   if(!tx||!receipt||receipt.status!==1)throw Error('Credit receipt missing')
   if(head-receipt.blockNumber+1<12){console.log('Mint awaiting confirmations');return}
   if((await provider.getBlock(receipt.blockNumber))?.hash!==receipt.blockHash)throw Error('Mint is not canonical')
   validateInterimMint(d,tx,receipt.logs)
   if(d.state!=='minted'){d.state='minted';d.mintTxid=e.txid;d.mintBlock=receipt.blockNumber;atomicJson(INTERIM_LEDGER,ledger);console.log(`Mint reconciled: ${e.txid}`);return}
   continue
  }
  if(d.state==='minted'||d.state==='mint-signed'){console.log('Mint awaiting history reconciliation; no retry');return}
  if(d.state==='sweep-signed'){
   if(!await sweepIsConfirmed(d)){console.log('Sweep awaiting confirmations; no retry');continue}
   d.state='sweep-confirmed';atomicJson(INTERIM_LEDGER,ledger);console.log(`Sweep confirmed: ${d.sweepTxid}`);return
  }
  const wrapping=await wrapAccounting(),a=await redemptionAccounting(),pending=inflight()
  if(d.state==='observed'){
   const source=allOutputs.get(d.address)?.find(o=>o.txid===d.txid&&o.index===d.index)
   if(!source||source.valueZat!==BigInt(d.amountZats))throw Error('Deposit spent or altered before sweep')
   if(await verifyDepositBytes(d,branchId)!==source.height)throw Error('Native height mismatch')
   const excess=wrapping.live-a.supply-a.reimbursementZats-pending-wrapping.reserved+ledger.deposits.filter(x=>x.state==='observed').reduce((n,x)=>n+BigInt(x.amountZats),0n)
   if(excess<10000n){console.log('Waiting for project fee funding');continue}
   const stage=JSON.parse(readFileSync('/etc/zeal/wrap-interim-stage.json','utf8'))
   const prepared=await prepareDepositSweep(d,{xpub:config.xpub,unencumberedExcess:excess,height,branchId,credentialPath:process.env.CREDENTIALS_DIRECTORY+'/deposit',signerPath:'/usr/local/bin/zeal-deposit-signer',signerSha256:stage.signerSha256})
   Object.assign(d,prepared);atomicJson(INTERIM_LEDGER,ledger)
   const result=await reserveRpc(RESERVE_NODES[0],'SendTransaction',{data:Buffer.from(d.sweepRaw!,'hex'),height:0})
   if(Number(result.errorCode)!==0)throw Error('Sweep broadcast uncertain; signed record retained; no blind retry')
   console.log(`Sweep submitted: ${d.sweepTxid}`);return
  }
  if(d.state!=='sweep-confirmed'||!await sweepIsConfirmed(d))throw Error('Sweep no longer confirmed')
  const amount=BigInt(d.amountZats),other=wrapping.reserved-amount
  if(other<0n||amount>mintCapacity(wrapping.live,a.supply,a.reimbursementZats,pending+other)){console.log('Waiting for other pending deposits to consolidate');continue}
  if(!await token.attestationIsFresh()||BigInt(await token.reserveZats())<a.supply+amount){
   const result=spawnSync(process.execPath,['--import','tsx','src/attest.ts'],{stdio:'inherit',env:process.env,timeout:120000})
   if(result.status!==0)throw Error('Attestation failed')
   console.log('Attestation refreshed; recheck backing on next run');return
  }
  // managedSend persists the wallet hash and this payment hash before broadcast.
  const tx=await managedSend(signer,await old.operatorMint.populateTransaction(d.recipient,amount,interimRef(d.txid,d.index)),hash=>{d.state='mint-signed';d.mintTxid=hash;atomicJson(INTERIM_LEDGER,ledger)})
  console.log(`Mint submitted: ${tx.hash}; next run reconciles exact receipt`);return
 }
 const unassigned=routes.find(r=>!r.depositAddress)
 if(unassigned){
  const address=deriveDepositAddress(config.xpub,unassigned.id)
  const tx=await managedSend(signer,await (registry.connect(signer) as ethers.Contract).assignAddress.populateTransaction(unassigned.id,address))
  console.log(`Address assigned for route ${unassigned.id}: ${tx.hash}`);return
 }
 console.log('No pending action')
}
withLock('issuance',async()=>{await main();if(!statusBase)throw Error('Incomplete public observation');const l=validateInterimLedger(readJson(INTERIM_LEDGER,null));atomicJson(stateDir+'wrap-public-status.json',{...statusBase,at:new Date().toISOString(),deposits:l.deposits.map(({sweepRaw,branchId,expiryHeight,...d})=>d)})}).catch(()=>{console.error('Controlled wrap test stopped for review; no blind retry. Inspect public journals and chain evidence. Secret details withheld.');process.exitCode=1}).finally(()=>provider.destroy())
