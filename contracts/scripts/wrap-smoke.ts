import { ethers } from 'hardhat'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { unlock, keystoreAddress } from './lib/secure'

const DESK = '0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
const TOKEN = '0x0b151Ff7a7c5250130EC16C275790961d558E402'
const RESERVE = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
const FILE = '.wrap-smoke-request.json'
const AMOUNT = 100000n // 0.001 zZEC, the minimum test amount
function save(value: unknown) { writeFileSync(FILE+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(FILE+'.tmp',FILE) }
async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 4663n) throw Error('Expected Robinhood mainnet')
  const address=keystoreAddress();if(!address)throw Error('Existing owner keystore required')
  const z=await ethers.getContractAt('ZZEC',TOKEN)
  const d=await ethers.getContractAt('WrapDesk',DESK)
  if ((await z.minter()).toLowerCase()!==DESK.toLowerCase() || await z.mintingPaused() || await d.requestsPaused()) throw Error('Wrapping is not activated')
  if(await z.reserveAddress()!==RESERVE)throw Error('Reserve address mismatch')
  let state: {hash?:string; id?:number; address?:string} = existsSync(FILE)?JSON.parse(readFileSync(FILE,'utf8')):{}
  if(state.address && state.address.toLowerCase()!==address.toLowerCase())throw Error('Smoke-test journal belongs to another wallet')
  if(state.hash) {
    const receipt=await ethers.provider.getTransactionReceipt(state.hash)
    if(!receipt)throw Error(`Request transaction still unresolved: ${state.hash}. Do not open another request.`)
    if(receipt.status!==1)throw Error(`Request reverted: ${state.hash}. Review before clearing the journal.`)
  }
  let id=state.id
  if(id===undefined) {
    const n=Number(await d.requestCount());if(n>10000)throw Error('Request history requires review')
    const matches:number[]=[]
    for(let i=0;i<n;i++){const r=await d.getRequest(i);if(r.requester.toLowerCase()===address.toLowerCase()&&r.amount===AMOUNT&&(Number(r.status)===1||Number(r.status)===2))matches.push(i)}
    if(matches.length>1)throw Error('Multiple test-sized requests; identify the existing one before continuing')
    if(matches.length===1)id=matches[0]
  }
  if(id===undefined) {
    if(process.env.ACTION!=='request'){console.log('No test request yet. ACTION=request npm run wrap:smoke opens one request for 0.001 zZEC. No ZEC is sent by this command.');return}
    console.log(`Open a minimum-size wrap request. Recipient: ${address}. Native ZEC is sent separately after the exact amount is printed.`)
    const signer=await unlock(ethers.provider)
    const [latest,pending]=await Promise.all([ethers.provider.getTransactionCount(address,'latest'),ethers.provider.getTransactionCount(address,'pending')])
    if(latest!==pending)throw Error('Wallet has a pending transaction; reconcile first')
    const request=await d.connect(signer).request.populateTransaction(AMOUNT)
    const raw=await signer.signTransaction(await signer.populateTransaction({...request,nonce:pending}))
    const hash=ethers.keccak256(raw);save({address,hash})
    console.log(`Request transaction ${hash}`)
    const tx=await ethers.provider.broadcastTransaction(raw)
    const receipt=await tx.wait(1,60000);if(!receipt||receipt.status!==1)throw Error('Request confirmation needs review')
    for(const log of receipt.logs){try{const e=d.interface.parseLog(log);if(log.address.toLowerCase()===DESK.toLowerCase()&&e?.name==='Requested')id=Number(e.args.id)}catch{}}
    if(id===undefined)throw Error('Confirmed transaction has no request event; inspect before retrying')
    state={address,hash,id};save(state)
  }
  const r=await d.getRequest(id)
  if(r.requester.toLowerCase()!==address.toLowerCase()||r.amount!==AMOUNT)throw Error('Test request mismatch')
  save({...state,address,id})
  console.log(`Request #${id}; receives ${ethers.formatUnits(r.amount,8)} zZEC at ${address}`)
  if(Number(r.status)===2){console.log(`Already minted. Zcash proof: ${r.zcashTxid}. Do not send again.`);return}
  if(Number(r.status)!==1)throw Error('Request is closed; do not send ZEC')
  console.log(`If you have NOT funded this request, send exactly ${ethers.formatUnits(await d.depositZats(id),8)} ZEC to ${RESERVE}`)
  console.log('Send once from your Zcash wallet. If already sent, do not repeat. Return the output and Zcash transaction ID to Codex for verification.')
}
main().catch(e=>{console.error(e?.shortMessage??e?.message??e);process.exitCode=1})
