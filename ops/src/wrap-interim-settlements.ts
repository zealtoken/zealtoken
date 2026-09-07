/** Offline signing and public-chain verification only. Caller owns issuance lock and journal. */
import { ethers } from 'ethers'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { RESERVE_NODES, reserveRpc } from './reserve-rpc.js'
import { inspectTransaction } from './reserve-settlements.js'
import { transparentAddress } from './reserve-key.js'
import { deriveDepositAddress } from './wrap-v2-policy.js'
import { sweepBudget,validateSweep,type InterimDeposit } from './wrap-interim-policy.js'
const script=(address:string)=>'76a914'+ethers.toBeHex(ethers.decodeBase58(address),26).slice(6,46)+'88ac'
export async function verifyDepositBytes(d:InterimDeposit,branchId:number){
 const sources=await Promise.all(RESERVE_NODES.map(async host=>{
  const tx=await reserveRpc(host,'GetTransaction',{hash:Buffer.from(d.txid.slice(2),'hex').reverse()})
  const raw=Buffer.from(tx.data).toString('hex'),decoded=inspectTransaction(raw,branchId)
  const output=decoded.outputs[d.index]
  if(decoded.txid!==d.txid.slice(2)||!output||output.script!==script(d.address)||BigInt(output.value_zats)!==BigInt(d.amountZats))throw Error('Native deposit bytes mismatch')
  return {raw,height:Number(tx.height)}
 }))
 if(sources[0].raw!==sources[1].raw||sources[0].height!==sources[1].height||!Number.isSafeInteger(sources[0].height)||sources[0].height<=0)throw Error('Native transaction sources disagree')
 return sources[0].height
}
/** Returns a signed transaction but never broadcasts. Persist it before any submission. */
export async function prepareDepositSweep(d:InterimDeposit,options:{xpub:string;unencumberedExcess:bigint;height:number;branchId:number;credentialPath:string;signerPath:string;signerSha256:string}):Promise<InterimDeposit>{
 const budget=sweepBudget(d,options.unencumberedExcess)
 if(!Number.isSafeInteger(options.height)||options.height<=0||!Number.isSafeInteger(options.branchId))throw Error('Invalid consensus parameters')
 if(deriveDepositAddress(options.xpub,d.routeId)!==d.address)throw Error('Derived deposit address mismatch')
 if(createHash('sha256').update(readFileSync(options.signerPath)).digest('hex')!==options.signerSha256)throw Error('Deposit signer integrity mismatch')
 let signed:any
 try{
  const secret=JSON.parse(readFileSync(options.credentialPath,'utf8')),record=secret.record
  if(record.version!==2||record.network!=='zcash-mainnet'||record.xpub!==options.xpub||record.fingerprint!==ethers.id(options.xpub))throw Error('Credential mismatch')
  const branch=await ethers.Wallet.fromEncryptedJson(JSON.stringify(record.encryptedKey),secret.passphrase)
  if(!(branch instanceof ethers.HDNodeWallet)||branch.neuter().extendedKey!==options.xpub)throw Error('Credential derivation mismatch')
  const child=branch.deriveChild(d.routeId)
  if(transparentAddress(child.publicKey)!==d.address)throw Error('Child address mismatch')
  signed=JSON.parse(execFileSync(options.signerPath,[],{input:JSON.stringify({private_key:child.privateKey,source_address:d.address,height:options.height,branch_id:options.branchId,fee_zats:Number(budget.fee),inputs:[{txid:d.txid.slice(2),index:d.index,value_zats:Number(budget.gross)}]}),encoding:'utf8',maxBuffer:1<<20,stdio:['pipe','pipe','pipe']}))
 }catch{throw Error('Deposit signing failed; secret details withheld')}
 if(signed.amount_zats!==Number(budget.net)||signed.fee_zats!==Number(budget.fee)||signed.change_zats!==0||signed.branch_id!==options.branchId||signed.target_height!==options.height+1||signed.expiry_height!==options.height+21)throw Error('Signer policy output mismatch')
 const prepared:InterimDeposit={...d,state:'sweep-signed',sweepTxid:'0x'+signed.txid,sweepRaw:signed.raw,branchId:signed.branch_id,expiryHeight:signed.expiry_height}
 validateSweep(prepared,inspectTransaction(signed.raw,signed.branch_id))
 return prepared
}
/** Exact bytes, original payment and confirmations must still agree after a restart. */
export async function sweepIsConfirmed(d:InterimDeposit){
 if(!d.sweepRaw||d.branchId===undefined||!d.sweepTxid)throw Error('Sweep evidence missing')
 validateSweep(d,inspectTransaction(d.sweepRaw,d.branchId))
 await verifyDepositBytes(d,d.branchId)
 const sources=await Promise.all(RESERVE_NODES.map(async host=>{
  const [info,tx]=await Promise.all([reserveRpc(host,'GetLightdInfo',{}),reserveRpc(host,'GetTransaction',{hash:Buffer.from(d.sweepTxid!.slice(2),'hex').reverse()})])
  if(info.chainName!=='main'||Buffer.from(tx.data).toString('hex')!==d.sweepRaw)throw Error('Confirmed sweep bytes mismatch')
  const tip=Number(info.blockHeight),height=Number(tx.height)
  if(!Number.isSafeInteger(tip)||!Number.isSafeInteger(height)||tip<=0||height<0)throw Error('Invalid confirmation evidence')
  return {tip,height}
 }))
 if(sources[0].height!==sources[1].height||Math.abs(sources[0].tip-sources[1].tip)>2)throw Error('Sweep confirmation sources disagree')
 return sources[0].height>0&&Math.min(...sources.map(s=>s.tip))-sources[0].height+1>=3
}
