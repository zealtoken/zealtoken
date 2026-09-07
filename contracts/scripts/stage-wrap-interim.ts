import {ethers} from 'hardhat'
import {readFileSync,existsSync,writeFileSync,renameSync} from 'node:fs'
import {unlock} from './lib/secure'
const DESK='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379'
const TOKEN='0x0b151Ff7a7c5250130EC16C275790961d558E402'
const FINGERPRINT='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d'
const FILE='.wrap-interim-owner.json'
async function main(){
 const p=ethers.provider
 if((await p.getNetwork()).chainId!==4663n)throw Error('Expected Robinhood mainnet')
 const d=await ethers.getContractAt('WrapDeskV2',DESK),z=await ethers.getContractAt('ZZEC',TOKEN)
 if(await d.depositKeyFingerprint()!==FINGERPRINT||String(await d.zzec()).toLowerCase()!==TOKEN.toLowerCase()||!await d.creditsPaused())throw Error('Unexpected registry or V2 credit activation')
 if(String(await z.owner()).toLowerCase()!==String(await d.owner()).toLowerCase())throw Error('Owners differ')
 const owner=String(await d.owner())
 console.log(`Registry ${DESK}; owner test route ${await d.routePlusOne(owner)} (0 means not created). V2 credits remain paused.`)
 if(process.env.ACTION!=='stage'){console.log('ACTION=stage starts/preserves the V2 minter proposal, briefly enables route requests, opens the owner test route, then pauses requests again. No ZEC deposit or mint.');return}
 const pending=await z.pendingMinter()
 if(pending.account!==ethers.ZeroAddress&&pending.account.toLowerCase()!==DESK.toLowerCase())throw Error('Different minter proposal exists; preserved')
 const signer=await unlock(p)
 if(signer.address.toLowerCase()!==owner.toLowerCase())throw Error('Expected contract owner')
 const records:{hash:string;label:string}[]=existsSync(FILE)?JSON.parse(readFileSync(FILE,'utf8')):[]
 for(const r of records){const receipt=await p.getTransactionReceipt(r.hash);if(!receipt)throw Error(`Owner transaction unresolved: ${r.hash}`)}
 async function send(request:Record<string,unknown>,label:string){
  const [latest,next]=await Promise.all([p.getTransactionCount(owner,'latest'),p.getTransactionCount(owner,'pending')]);if(latest!==next)throw Error('Owner transaction pending')
  const raw=await signer.signTransaction(await signer.populateTransaction({...request,nonce:next}))
  const hash=ethers.keccak256(raw)
  records.push({hash,label});writeFileSync(FILE+'.tmp',JSON.stringify(records,null,2),{mode:0o600});renameSync(FILE+'.tmp',FILE)
  const tx=await p.broadcastTransaction(raw),receipt=await tx.wait(1,60000)
  if(!receipt||receipt.status!==1)throw Error('Owner transaction failed; inspect journal')
  console.log(`${label}: ${hash}`)
 }
 if(pending.account===ethers.ZeroAddress&&String(await z.minter()).toLowerCase()!==DESK.toLowerCase())await send(await z.proposeMinter.populateTransaction(DESK),'V2 minter proposed')
 const next=await z.pendingMinter();if(next.eta>0n)console.log(`V2 commit eligible: ${new Date(Number(next.eta)*1000).toISOString()}; readiness checks still required`)
 if(await d.routePlusOne(owner)===0n){
  if(await d.requestsPaused())await send(await d.setPaused.populateTransaction(false,true),'Test route requests briefly enabled')
  try{await send(await d.request.populateTransaction(),'Owner test route opened')}
  finally{if(!await d.requestsPaused())await send(await d.setPaused.populateTransaction(true,true),'Route requests paused again')}
 }
 if(!await d.requestsPaused())await send(await d.setPaused.populateTransaction(true,true),'Route requests paused')
 const id=await d.routePlusOne(owner)-1n,r=await d.route(id)
 if(r.recipient.toLowerCase()!==owner.toLowerCase()||!await d.requestsPaused()||!await d.creditsPaused())throw Error('Test route or final pause check failed')
 console.log(`Owner route #${id}; recipient ${owner}. Both V2 pauses verified. No ZEC moved or zZEC minted. Return output to Codex; do not fund an example address.`)
}
main().catch(e=>{console.error(e?.shortMessage??e?.message??'Owner staging failed');process.exitCode=1})
