import {ethers} from 'hardhat'
import {readFileSync,existsSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync} from 'node:fs'
import {unlock} from './lib/secure'
const DESK='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379',TOKEN='0x0b151Ff7a7c5250130EC16C275790961d558E402',LEGACY='0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
const URL='https://7uuuf4b2axfi7spojunedozbei0umsxk.lambda-url.us-east-2.on.aws/'
const JOURNAL='.wrap-public-owner.json'
async function main(){
 const p=ethers.provider;if((await p.getNetwork()).chainId!==4663n)throw Error('Wrong chain')
 const d=await ethers.getContractAt('WrapDeskV2',DESK),z=await ethers.getContractAt('ZZEC',TOKEN)
 if(String(await z.minter()).toLowerCase()!==LEGACY.toLowerCase()||!await d.creditsPaused()||String(await d.zzec()).toLowerCase()!==TOKEN.toLowerCase()||await d.depositKeyFingerprint()!=='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d')throw Error('Unexpected minter or registry state')
 const response=await fetch(URL,{signal:AbortSignal.timeout(15000)}),s:any=await response.json()
 const age=Date.now()-Date.parse(s.at)
 if(!response.ok||!s.workerReady||!s.feeCapacity||s.chainId!==4663||s.registry?.toLowerCase()!==DESK.toLowerCase()||s.minter?.toLowerCase()!==LEGACY.toLowerCase()||!Number.isFinite(age)||age< -10000||age>120000)throw Error('Cloud worker is not ready; do not open')
 console.log('Cloud worker fresh; fee backing available. Public range 0.001–1 ZEC per deposit. V2 minting remains paused; existing minter unchanged.')
 if(!await d.requestsPaused()){console.log('Public route requests already open. No transaction needed.');return}
 if(process.env.ACTION!=='open'){console.log('Preflight passed. ACTION=open enables public deposit-address requests and the UI when the worker reports healthy.');return}
 if(existsSync(JOURNAL)){const j=JSON.parse(readFileSync(JOURNAL,'utf8'));if(!await p.getTransactionReceipt(j.hash))throw Error(`Owner transaction unresolved: ${j.hash}`)}
 const signer=await unlock(p)
 if(signer.address.toLowerCase()!==String(await d.owner()).toLowerCase())throw Error('Expected registry owner')
 const [latest,pending]=await Promise.all([p.getTransactionCount(signer.address,'latest'),p.getTransactionCount(signer.address,'pending')]);if(latest!==pending)throw Error('Owner has a pending transaction')
 const raw=await signer.signTransaction(await signer.populateTransaction({...await d.setPaused.populateTransaction(false,true),nonce:pending})),hash=ethers.keccak256(raw)
 const fd=openSync(JOURNAL+'.tmp','w',0o600);try{writeFileSync(fd,JSON.stringify({hash,action:'open public route requests'}));fsyncSync(fd)}finally{closeSync(fd)}renameSync(JOURNAL+'.tmp',JOURNAL)
 const dir=openSync('.','r');try{fsyncSync(dir)}finally{closeSync(dir)}
 const tx=await p.broadcastTransaction(raw),receipt=await tx.wait(12,120000)
 if(!receipt||receipt.status!==1||await d.requestsPaused()||!await d.creditsPaused()||String(await z.minter()).toLowerCase()!==LEGACY.toLowerCase())throw Error('Opening requires receipt review')
 console.log(`Public requests opened: ${hash}. Return to Codex to verify the live UI and cloud pass. Do not send another test payment yet.`)
}
main().catch(e=>{console.error(e?.shortMessage??e?.message??'Public opening failed');process.exitCode=1})
