import { ethers } from 'ethers'
import { pendingV2Zats, outputKey, type V2Deposit, type V2Route } from './wrap-v2-policy.js'
export const INTERIM_DESK='0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
export const ROUTE_DESK='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379'
export const INTERIM_START_BLOCK=57103151
export const SWEEP_FEE=10000n
export type InterimDeposit=V2Deposit & {sweepRaw?:string;branchId?:number;expiryHeight?:number;mintBlock?:number}
export type InterimLedger={version:1;deposits:InterimDeposit[]}
const coder=ethers.AbiCoder.defaultAbiCoder()
/** Same reference for a native output regardless of route, preventing reattribution on replay. */
export function interimRef(txid:string,index:number){
 if(!/^0x[0-9a-f]{64}$/i.test(txid)||!Number.isSafeInteger(index)||index<0||index>0xffffffff)throw Error('Invalid native outpoint')
 return ethers.keccak256(coder.encode(['string','uint256','address','bytes32','uint32'],['ZEAL_WRAP_INTERIM_V1',4663,INTERIM_DESK,txid,index]))
}
export function validateInterimLedger(raw:unknown):InterimLedger{
 const l=raw as InterimLedger
 if(!l||l.version!==1||!Array.isArray(l.deposits)||l.deposits.length>10000)throw Error('Interim ledger missing or invalid')
 pendingV2Zats(l.deposits)
 for(const d of l.deposits){
  interimRef(d.txid,d.index)
  if(!Number.isSafeInteger(d.routeId)||d.routeId<0||d.routeId>=2**31||!ethers.isAddress(d.recipient)||d.recipient===ethers.ZeroAddress||!/^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(d.address))throw Error('Invalid interim recipient or address')
  if(!/^\d+$/.test(d.amountZats))throw Error('Invalid amount')
  if(d.state!=='observed'&&(!/^0x[0-9a-f]{64}$/.test(d.sweepTxid??'')||!/^([0-9a-f]{2})+$/.test(d.sweepRaw??'')||!Number.isSafeInteger(d.branchId)||!Number.isSafeInteger(d.expiryHeight)))throw Error('Signed sweep evidence missing')
  if(['mint-signed','minted'].includes(d.state)&&!/^0x[0-9a-f]{64}$/.test(d.mintTxid??''))throw Error('Mint transaction evidence missing')
 }
 return l
}
export function requireSameRoute(d:InterimDeposit,r:V2Route){
 if(d.routeId!==r.id||d.recipient.toLowerCase()!==r.recipient.toLowerCase()||d.address!==r.depositAddress)throw Error('Deposit route changed')
}
export function sweepBudget(d:InterimDeposit,unencumberedExcess:bigint){
 const n=BigInt(d.amountZats)
 if(d.state!=='observed'||n<100000n||n>100000000n||unencumberedExcess<SWEEP_FEE)throw Error('Sweep held: amount, state or project fee funding')
 return {gross:n,net:n-SWEEP_FEE,fee:SWEEP_FEE}
}
export function validateSweep(d:InterimDeposit,decoded:any){
 const script='76a914'+ethers.toBeHex(ethers.decodeBase58('t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'),26).slice(6,46)+'88ac'
 if(!d.sweepTxid||decoded.txid!==d.sweepTxid.slice(2)||decoded.transparent_only!==true||decoded.inputs?.length!==1||decoded.outputs?.length!==1)throw Error('Sweep structure mismatch')
 if(outputKey('0x'+decoded.inputs[0].txid,decoded.inputs[0].index)!==outputKey(d.txid,d.index)||decoded.outputs[0].script!==script||BigInt(decoded.outputs[0].value_zats)!==BigInt(d.amountZats)-SWEEP_FEE)throw Error('Sweep input, destination or amount mismatch')
}
export const MINT_IFACE=new ethers.Interface(['function operatorMint(address to,uint256 amount,bytes32 ref)','event ReserveMint(address indexed to,uint256 amount,bytes32 ref)'])
export function validateInterimMint(d:InterimDeposit,tx:{to:string|null;data:string},logs:readonly {address:string;topics:readonly string[];data:string}[]){
 if(tx.to?.toLowerCase()!==INTERIM_DESK.toLowerCase())throw Error('Wrong mint destination')
 const expected=MINT_IFACE.encodeFunctionData('operatorMint',[d.recipient,BigInt(d.amountZats),interimRef(d.txid,d.index)])
 if(tx.data.toLowerCase()!==expected.toLowerCase())throw Error('Wrong mint calldata')
 const events=logs.filter(l=>l.address.toLowerCase()===INTERIM_DESK.toLowerCase()).flatMap(l=>{try{const p=MINT_IFACE.parseLog({topics:[...l.topics],data:l.data});return p?.name==='ReserveMint'?[p]:[]}catch{return []}})
 if(events.length!==1||events[0].args.to.toLowerCase()!==d.recipient.toLowerCase()||events[0].args.amount!==BigInt(d.amountZats)||events[0].args.ref!==interimRef(d.txid,d.index))throw Error('Mint event mismatch')
}
