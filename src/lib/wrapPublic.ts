import {hexToBig,word,wordAddress} from './chain'
export const WRAP_REGISTRY='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379'
export const WRAP_MINTER='0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
export const WRAP_SELECTORS={request:'0x338cdca1',mine:'0x4033c358',route:'0xb980c78f',paused:'0xe43b7531',credits:'0x13d1f020',minter:'0x07546172'}
export type Deposit={txid:string;index:number;amountZats:string;state:string;sweepTxid?:string;mintTxid?:string}
export type Route={id:number;recipient:string;depositAddress:string;requestedAt:number}
export type WrapStatus={version:number;at:string;workerReady:boolean;accepting:boolean;feeCapacity:boolean;requestsPaused:boolean;registry:string;minter:string;chainId:number;route:Route|null;deposits:Deposit[];review:{txid:string;index:number;amountZats:string;reason:string}[]}
export function parseZec(input:string){
 if(!/^\d{1,8}(\.\d{0,8})?$/.test(input))return 0n
 const [whole,part='']=input.split('.')
 return BigInt(whole)*100000000n+BigInt(part.padEnd(8,'0'))
}
export function decodeRoute(raw:string,id:number):Route{
 if(!/^0x[0-9a-f]+$/i.test(raw)||raw.length<322||hexToBig(word(raw,0))!==32n||hexToBig(word(raw,3))!==128n)throw Error('Invalid route response')
 const length=Number(hexToBig(word(raw,5)))
 if(length!==0&&length!==35)throw Error('Invalid deposit address length')
 const encoded=raw.slice(2+6*64,2+6*64+length*2)
 if(encoded.length!==length*2)throw Error('Truncated address')
 const depositAddress=Array.from({length},(_,i)=>String.fromCharCode(parseInt(encoded.slice(i*2,i*2+2),16))).join('')
 if(length&&!/^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(depositAddress))throw Error('Invalid deposit address')
 return {id,recipient:wordAddress(raw,1),requestedAt:Number(hexToBig(word(raw,2))),depositAddress}
}
export function canDeposit(s:WrapStatus|null,account:string|null,route:Route|null,now=Date.now()){
 return !!(s&&s.version===1&&s.workerReady&&s.accepting&&s.chainId===4663&&s.registry?.toLowerCase()===WRAP_REGISTRY.toLowerCase()&&s.minter?.toLowerCase()===WRAP_MINTER.toLowerCase()&&now-Date.parse(s.at)>=-10000&&now-Date.parse(s.at)<120000&&account&&route?.depositAddress&&s.route?.id===route.id&&route.recipient.toLowerCase()===account.toLowerCase()&&s.route.recipient.toLowerCase()===account.toLowerCase()&&route.depositAddress===s.route.depositAddress)
}

/** Prefer the newest unfinished payment over earlier completed receipts. */
export function activeDeposit(deposits:Deposit[]){
 return [...deposits].reverse().find(d=>d.state!=='minted')??deposits[deposits.length-1]
}
export function depositProgress(state:string){
 switch(state){
  case 'observed':return {stage:1,title:'Your deposit is confirmed.',detail:'We detected your ZEC after three confirmations. Next, it moves into the reserve.'}
  case 'sweep-signed':return {stage:1,title:'Moving your ZEC into the reserve.',detail:'Your reserve transfer is awaiting confirmation. Minting begins after three reserve-transfer confirmations and a backing check.'}
  case 'sweep-confirmed':return {stage:2,title:'Preparing your zZEC.',detail:'Your ZEC is confirmed in the reserve. We are checking backing and preparing the mint to your linked wallet.'}
  case 'mint-signed':return {stage:2,title:'Your mint is confirming.',detail:'A mint transaction has been prepared. We verify its confirmed receipt before marking your payment complete.'}
  case 'minted':return {stage:3,title:'Your zZEC is in your wallet.',detail:'Minting is confirmed. The receipt below records the amount delivered to your linked wallet.'}
  default:return {stage:1,title:'Your payment needs review.',detail:'Keep your transaction receipt. Do not send the payment again.'}
 }
}

/** An empty list is authoritative only after fresh, account-bound checks. */
export function historyVerified(s:WrapStatus,account:string|null,route:Route|null,now=Date.now()){
 if(!s||s.version!==1||!s.workerReady||s.chainId!==4663||s.registry?.toLowerCase()!==WRAP_REGISTRY.toLowerCase()||s.minter?.toLowerCase()!==WRAP_MINTER.toLowerCase()||!Number.isFinite(Date.parse(s.at))||now-Date.parse(s.at)<-10000||now-Date.parse(s.at)>=120000||!Array.isArray(s.deposits)||!Array.isArray(s.review))return false
 if(!account)return true
 if(!route)return s.route===null&&s.deposits.length===0&&s.review.length===0
 return !!s.route&&s.route.id===route.id&&s.route.recipient.toLowerCase()===account.toLowerCase()&&route.recipient.toLowerCase()===account.toLowerCase()&&s.route.depositAddress===route.depositAddress
}
