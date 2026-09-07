/** Controlled route-0 test only. Not a public wrapping worker. One transition per run. */
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
const OWNER='0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03'
const FINGERPRINT='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d'
const ABI=['function operator() view returns(address)','function creditsPaused() view returns(bool)','function requestsPaused() view returns(bool)','function depositKeyFingerprint() view returns(bytes32)','function route(uint256) view returns(tuple(address recipient,uint64 requestedAt,string depositAddress,uint256 creditedZats))','function assignAddress(uint256,string)']
function inflight(){
 const file=process.env.REDEEM_LEDGER??'./redemptions.json'
 if(!existsSync(file))return 0n
 const raw=JSON.parse(readFileSync(file,'utf8')),entries=raw.entries??raw
 return Object.values(entries as Record<string,{txid:string;amountZats?:string}>).filter(x=>x.txid==='PENDING').reduce((s,x)=>s+BigInt(x.amountZats??'0'),0n)
}
async function main(){
 if(!process.argv.includes('--execute')){console.log('Controlled interim test is disabled by default; use wrap:interim:preview for public checks.');return}
 if(process.platform!=='linux'||!existsSync('/etc/zeal/WRAP_INTERIM_TEST')||!existsSync('/etc/zeal/ACTIVE'))throw Error('Cloud test gate missing')
 if(!existsSync(INTERIM_LEDGER))throw Error('Controlled test ledger must be initialized before activation')
 const ledger=validateInterimLedger(readJson<InterimLedger|null>(INTERIM_LEDGER,null))
 if(ledger.deposits.some(d=>d.routeId!==0||d.recipient.toLowerCase()!==OWNER.toLowerCase()))throw Error('Non-test deposit found')
 const config=JSON.parse(readFileSync(stateDir+'wrap-v2-public.json','utf8'))
 if(config.encryptedKey||config.fingerprint!==FINGERPRINT||ethers.id(config.xpub)!==FINGERPRINT)throw Error('Public config mismatch')
 if((await provider.getNetwork()).chainId!==4663n)throw Error('Wrong chain')
 const registry=new ethers.Contract(ROUTE_DESK,ABI,provider),token=zzec()
 if(await registry.depositKeyFingerprint()!==FINGERPRINT||!await registry.creditsPaused()||!await registry.requestsPaused())throw Error('Registry must remain paused during controlled test')
 if(String(await token.minter()).toLowerCase()!==INTERIM_DESK.toLowerCase())throw Error('Legacy minter changed')
 const row=await registry.route(0)
 if(String(row.recipient).toLowerCase()!==OWNER.toLowerCase())throw Error('Route zero is not the owner')
 const signer=await roleSigner('minter')
 const old=new ethers.Contract(INTERIM_DESK,['function operator() view returns(address)','function operatorMint(address,uint256,bytes32)'],signer)
 if(String(await registry.operator()).toLowerCase()!==signer.address.toLowerCase()||String(await old.operator()).toLowerCase()!==signer.address.toLowerCase())throw Error('Operator mismatch')
 const address=deriveDepositAddress(config.xpub,0)
 if(!row.depositAddress){
  const tx=await managedSend(signer,await (registry.connect(signer) as ethers.Contract).assignAddress.populateTransaction(0,address))
  console.log(`Test address assigned to owner route: ${address}; transaction ${tx.hash}. Await operator readiness confirmation before funding.`);return
 }
 const route={id:0,recipient:OWNER,depositAddress:String(row.depositAddress),requestedAt:Number(row.requestedAt)}
 verifyRoute(config.xpub,route)
 const history=await scanInterimHistory()
 if(!history.caughtUp){console.log('Mint history catching up; no signing');return}
 const info=await Promise.all(RESERVE_NODES.map(host=>reserveRpc(host,'GetLightdInfo',{})))
 if(info.some(i=>i.chainName!=='main')||info[0].consensusBranchId!==info[1].consensusBranchId)throw Error('Zcash chain disagreement')
 const tips=info.map(i=>Number(i.blockHeight)),height=Math.min(...tips),branchId=parseInt(info[0].consensusBranchId,16)
 if(tips.some(h=>!Number.isSafeInteger(h)||h<=0)||Math.abs(tips[0]-tips[1])>2)throw Error('Zcash tip disagreement')
 const snapshots=await Promise.all(RESERVE_NODES.map(host=>addressUtxos(address,host)))
 const encode=(outs:typeof snapshots[number])=>outs.map(o=>`${o.txid}:${o.index}:${o.height}:${o.valueZat}`).sort().join('|')
 if(encode(snapshots[0])!==encode(snapshots[1]))throw Error('Deposit output disagreement')
 for(const o of snapshots[0]){
  if(o.height<=0||height-o.height+1<3)continue
  const existing=ledger.deposits.find(d=>d.txid===o.txid&&d.index===o.index)
  if(existing)continue
  const times=await Promise.all(RESERVE_NODES.map(host=>blockTime(o.height,host)))
  eligibleOutput(o,o,tips[0],tips[1],route.requestedAt,times[0],times[1])
  if(o.valueZat>1000000n)throw Error('Controlled test max is 0.01 ZEC per payment; hold for review')
  // No original user transfer is inferred here: only this dedicated destination.
  ledger.deposits=addDeposit(ledger.deposits,route,o)
  atomicJson(INTERIM_LEDGER,ledger)
 }
 if(ledger.deposits.length>3)throw Error('Controlled test payment capacity reached; review')
 for(const d of ledger.deposits){
  requireSameRoute(d,route)
  const prior=history.events.filter(e=>e.ref===interimRef(d.txid,d.index))
  if(prior.length>1)throw Error('Duplicate on-chain native-output credits detected')
  if(prior.length){
   const e=prior[0]
   if(e.recipient.toLowerCase()!==OWNER.toLowerCase()||e.amountZats!==d.amountZats)throw Error('Historical credit mismatch')
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
   if(!await sweepIsConfirmed(d)){console.log('Sweep awaiting confirmations; no retry');return}
   d.state='sweep-confirmed';atomicJson(INTERIM_LEDGER,ledger);console.log(`Sweep confirmed: ${d.sweepTxid}`);return
  }
  const wrapping=await wrapAccounting(),a=await redemptionAccounting(),pending=inflight()
  if(d.state==='observed'){
   const source=snapshots[0].find(o=>o.txid===d.txid&&o.index===d.index)
   if(!source||source.valueZat!==BigInt(d.amountZats))throw Error('Deposit spent or altered before sweep')
   if(await verifyDepositBytes(d,branchId)!==source.height)throw Error('Native height mismatch')
   const excess=wrapping.live-a.supply-a.reimbursementZats-pending-wrapping.reserved+BigInt(d.amountZats)
   const stage=JSON.parse(readFileSync('/etc/zeal/wrap-interim-stage.json','utf8'))
   const prepared=await prepareDepositSweep(d,{xpub:config.xpub,unencumberedExcess:excess,height,branchId,credentialPath:process.env.CREDENTIALS_DIRECTORY+'/deposit',signerPath:'/usr/local/bin/zeal-deposit-signer',signerSha256:stage.signerSha256})
   Object.assign(d,prepared);atomicJson(INTERIM_LEDGER,ledger)
   const result=await reserveRpc(RESERVE_NODES[0],'SendTransaction',{data:Buffer.from(d.sweepRaw!,'hex'),height:0})
   if(Number(result.errorCode)!==0)throw Error('Sweep broadcast uncertain; signed record retained; no blind retry')
   console.log(`Test sweep submitted: ${d.sweepTxid}`);return
  }
  if(d.state!=='sweep-confirmed'||!await sweepIsConfirmed(d))throw Error('Sweep no longer confirmed')
  const amount=BigInt(d.amountZats),other=wrapping.reserved-amount
  if(other<0n||amount>mintCapacity(wrapping.live,a.supply,a.reimbursementZats,pending+other))throw Error('Insufficient backing after other obligations')
  if(!await token.attestationIsFresh()||BigInt(await token.reserveZats())<a.supply+amount){
   const result=spawnSync(process.execPath,['--import','tsx','src/attest.ts'],{stdio:'inherit',env:process.env,timeout:120000})
   if(result.status!==0)throw Error('Attestation failed')
   console.log('Attestation refreshed; recheck backing on next run');return
  }
  // managedSend persists the wallet hash and this payment hash before broadcast.
  const tx=await managedSend(signer,await old.operatorMint.populateTransaction(OWNER,amount,interimRef(d.txid,d.index)),hash=>{d.state='mint-signed';d.mintTxid=hash;atomicJson(INTERIM_LEDGER,ledger)})
  console.log(`Test mint submitted: ${tx.hash}; next run reconciles exact receipt`);return
 }
 console.log('Controlled route has no pending action')
}
withLock('issuance',main).catch(()=>{console.error('Controlled wrap test stopped for review; no blind retry. Inspect public journals and chain evidence. Secret details withheld.');process.exitCode=1}).finally(()=>provider.destroy())
