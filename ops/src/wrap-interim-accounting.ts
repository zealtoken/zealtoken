/** Pending unique-address deposits remain liabilities until a confirmed exact mint. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { ethers } from 'ethers'
import { provider } from './chain.js'
import { readJson,stateDir } from './ops-lock.js'
import { validateInterimLedger,validateInterimMint,type InterimLedger } from './wrap-interim-policy.js'
export const INTERIM_LEDGER=stateDir+'wrap-interim.json'
export async function interimAccounting(){
 if(existsSync('/etc/zeal/WRAP_INTERIM_ACTIVE')&&!process.env.WRAP_INTERIM_RUN_ID){
  const marker=JSON.parse(readFileSync('/run/zeal-status/wrap-checkpoint-ready.json','utf8'))
  if(Date.now()-marker.at>600000||marker.hash!==createHash('sha256').update(readFileSync(INTERIM_LEDGER)).digest('hex'))throw Error('Public wrapping checkpoint is unavailable or ledger changed; reconcile before issuance')
 }

 if(!existsSync(INTERIM_LEDGER)){
  if(existsSync('/etc/zeal/WRAP_INTERIM_ACTIVE')||existsSync('/etc/zeal/WRAP_INTERIM_TEST'))throw Error('Active interim deposit ledger missing')
  return {reserved:0n,knownSweepOutpoints:[] as string[],holds:[] as {id:number;outpoint:string;value:string}[]}
 }
 const ledger=validateInterimLedger(readJson<InterimLedger|null>(INTERIM_LEDGER,null))
 let reserved=0n
 const holds:{id:number;outpoint:string;value:string}[]=[]
 const head=await provider.getBlockNumber()
 for(const d of ledger.deposits){
  if(d.state==='minted'){
   const [receipt,tx]=await Promise.all([provider.getTransactionReceipt(d.mintTxid!),provider.getTransaction(d.mintTxid!)])
   if(!receipt||receipt.status!==1||!tx||head-receipt.blockNumber+1<12)throw Error('Interim mint settlement lost confirmation')
   const block=await provider.getBlock(receipt.blockNumber)
   if(block?.hash!==receipt.blockHash)throw Error('Interim mint is not canonical')
   validateInterimMint(d,tx,receipt.logs)
   continue
  }
  reserved+=BigInt(d.amountZats)
  // The gross liability includes project-paid network fees. The swept output
  // cannot fund a reserve reimbursement before its corresponding user credit.
  if(d.sweepTxid)holds.push({id:-1,outpoint:`${d.sweepTxid.toLowerCase()}:0`,value:d.amountZats})
 }
 return {reserved,holds,knownSweepOutpoints:ledger.deposits.flatMap(d=>d.sweepTxid?[`${d.sweepTxid.toLowerCase()}:0`]:[])}
}
