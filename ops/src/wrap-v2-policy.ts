import { ethers } from 'ethers'
import { transparentAddress } from './reserve-key.js'
export const MIN_V2_DEPOSIT=100000n, MAX_V2_DEPOSIT=100000000n
export type V2Output={txid:string;index:number;valueZat:bigint;height:number}
export type V2Route={id:number;recipient:string;depositAddress:string;requestedAt:number}
export type V2Deposit={routeId:number;recipient:string;address:string;txid:string;index:number;amountZats:string;state:'observed'|'sweep-signed'|'sweep-confirmed'|'mint-signed'|'minted';sweepTxid?:string;mintTxid?:string}
export const outputKey=(txid:string,index:number)=>`${txid.toLowerCase()}:${index}`
export function deriveDepositAddress(xpub:string,id:number){
 if(!Number.isSafeInteger(id)||id<0||id>=2**31)throw Error('Invalid deposit route index')
 const branch=ethers.HDNodeWallet.fromExtendedKey(xpub)
 if(!(branch instanceof ethers.HDNodeVoidWallet))throw Error('Only a public deposit derivation key is allowed')
 return transparentAddress(branch.deriveChild(id).publicKey)
}
export function verifyRoute(xpub:string,route:V2Route){
 if(!ethers.isAddress(route.recipient)||route.recipient===ethers.ZeroAddress||!Number.isSafeInteger(route.requestedAt)||route.requestedAt<=0)throw Error('Invalid route')
 if(route.depositAddress!==deriveDepositAddress(xpub,route.id))throw Error('Deposit address does not match pinned public key')
}
/** Same-provider regional redundancy. Both sources must attest the same confirmed output. */
export function eligibleOutput(a:V2Output,b:V2Output,tipA:number,tipB:number,requestAt:number,timeA:number,timeB:number){
 if(!/^0x[0-9a-f]{64}$/i.test(a.txid)||!Number.isInteger(a.index)||a.index<0||a.index>0xffffffff)throw Error('Invalid output identity')
 if(outputKey(a.txid,a.index)!==outputKey(b.txid,b.index)||a.valueZat!==b.valueZat||a.height!==b.height||timeA!==timeB)throw Error('Deposit sources disagree')
 if(![tipA,tipB,a.height,requestAt,timeA].every(Number.isSafeInteger)||a.height<=0||timeA<requestAt||Math.abs(tipA-tipB)>2||Math.min(tipA,tipB)-a.height+1<3)throw Error('Deposit is not sufficiently confirmed after request')
 if(a.valueZat<MIN_V2_DEPOSIT||a.valueZat>MAX_V2_DEPOSIT)throw Error('Deposit outside automatic limits; hold for review')
 return a.valueZat
}
export function addDeposit(records:V2Deposit[],route:V2Route,output:V2Output):V2Deposit[]{
 const key=outputKey(output.txid,output.index),existing=records.find(r=>outputKey(r.txid,r.index)===key)
 if(existing){if(existing.routeId!==route.id||existing.recipient.toLowerCase()!==route.recipient.toLowerCase()||existing.address!==route.depositAddress||existing.amountZats!==String(output.valueZat))throw Error('Existing deposit identity changed');return records}
 return [...records,{routeId:route.id,recipient:route.recipient,address:route.depositAddress,txid:output.txid.toLowerCase(),index:output.index,amountZats:String(output.valueZat),state:'observed'}]
}
/** Gross liability is held before sweep/signing, including project-paid network fees.
 * Do not net these funds against supply until a verified successful mint consumes it.
 */
export function pendingV2Zats(records:V2Deposit[]){
 const seen=new Set<string>();let owed=0n
 for(const r of records){const k=outputKey(r.txid,r.index);if(seen.has(k))throw Error('Duplicate deposit ledger output');seen.add(k);if(!['observed','sweep-signed','sweep-confirmed','mint-signed','minted'].includes(r.state))throw Error('Unknown deposit state');const n=BigInt(r.amountZats);if(n<=0n)throw Error('Invalid deposit amount');if(r.state!=='minted')owed+=n}
 return owed
}
export function creditReady(d:V2Deposit,confirmedSweepTxid:string,availableBacking:bigint){
 if(d.state!=='sweep-confirmed'||d.sweepTxid?.toLowerCase()!==confirmedSweepTxid.toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(confirmedSweepTxid))throw Error('Consolidation has not been verified')
 const n=BigInt(d.amountZats)
 if(n<MIN_V2_DEPOSIT||n>MAX_V2_DEPOSIT||availableBacking<n)throw Error('Insufficient unencumbered central reserve backing')
 return n
}
