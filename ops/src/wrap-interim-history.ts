/** Rebuildable on-chain credit index; never infer nonpayment from a stale local ledger. */
import {provider} from './chain.js'
import {atomicJson,readJson,stateDir} from './ops-lock.js'
import {INTERIM_DESK,INTERIM_START_BLOCK,MINT_IFACE} from './wrap-interim-policy.js'
export type MintEvidence={ref:string;recipient:string;amountZats:string;txid:string;block:number;blockHash:string}
type History={version:1;cursor:number;hash:string;events:MintEvidence[]}
export async function scanInterimHistory():Promise<{caughtUp:boolean;events:MintEvidence[]}>{
 const file=stateDir+'wrap-interim-history.json'
 let h=readJson<History|null>(file,null)
 if(h){
  if(h.version!==1||!Number.isSafeInteger(h.cursor)||h.cursor<INTERIM_START_BLOCK-1||!Array.isArray(h.events)||h.events.length>100000)throw Error('Invalid interim history index')
  const block=await provider.getBlock(h.cursor)
  if(block?.hash!==h.hash){h=null} // Full reindex after a canonical-history change.
 }
 const head=await provider.getBlockNumber()
 const start=h?Math.max(INTERIM_START_BLOCK,h.cursor-24):INTERIM_START_BLOCK
 const end=Math.min(head,start+49999)
 if(end<start)throw Error('Chain tip is behind interim deployment')
 const anchor=await provider.getBlock(end)
 if(!anchor?.hash)throw Error('History anchor unavailable')
 const events=h?h.events.filter(e=>e.block<start):[]
 for(let from=start;from<=end;from+=5000){
  const logs=await provider.getLogs({address:INTERIM_DESK,topics:[MINT_IFACE.getEvent('ReserveMint')!.topicHash],fromBlock:from,toBlock:Math.min(end,from+4999)})
  for(const log of logs){
   if(log.removed)throw Error('Removed mint event')
   const event=MINT_IFACE.parseLog(log)
   if(!event)throw Error('Unparseable mint event')
   events.push({ref:String(event.args.ref),recipient:String(event.args.to),amountZats:String(event.args.amount),txid:log.transactionHash,block:log.blockNumber,blockHash:log.blockHash})
  }
 }
 const block=await provider.getBlock(end)
 if(!block?.hash||block.hash!==anchor.hash)throw Error('History changed during scan')
 if(events.length>100000)throw Error('History capacity needs review')
 atomicJson(file,{version:1,cursor:end,hash:block.hash,events})
 return {caughtUp:end===head,events}
}
