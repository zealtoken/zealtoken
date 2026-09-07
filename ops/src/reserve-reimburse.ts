/** Bounded reserve reimbursement. Preview by default. Cloud activation is explicit. */
import { ethers } from 'ethers'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CHAIN, CONTRACTS } from './config.js'
import { withLock, atomicJson } from './ops-lock.js'
import { redemptionAccounting } from './redemption-accounting.js'
import { RESERVE_ADDRESS, transparentAddress } from './reserve-key.js'
import { RESERVE_NODES, reserveRpc } from './reserve-rpc.js'
import { planReimbursement, type ReserveCoin } from './reserve-policy.js'
import { transferLedger, TRANSFERS, confirmedTransfer, reserveSigner, inspectTransaction, type Transfer } from './reserve-settlements.js'

const execute=process.argv.includes('--execute')
async function main() {
  if(execute && (process.platform!=='linux'||!existsSync('/etc/zeal/RESERVE_ACTIVE'))) throw new Error('Cloud reserve signing is not activated')
  const all=transferLedger(), pending=all.filter(t=>t.status!=='confirmed')
  if(pending.length>1)throw new Error('Multiple pending reserve transfers; reconcile manually')
  if(pending.length) {
    const t=pending[0]
    if(await confirmedTransfer(t)) {
      if(execute){t.status='confirmed';t.confirmedAt=new Date().toISOString();atomicJson(TRANSFERS,all)}
      console.log(JSON.stringify({status:execute?'reimbursement confirmed':'confirmation available',txid:t.txid,amountZec:t.amount_zats/1e8}));return
    }
    console.log('Reserve transfer awaiting confirmations; not sending again');return
  }
  const provider=new ethers.JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true,cacheTimeout:-1})
  try {
    const token=new ethers.Contract(CONTRACTS.zzec,['function reserveAddress() view returns(string)'],provider)
    if(await token.reserveAddress()!==RESERVE_ADDRESS)throw new Error('Contract reserve address mismatch')
    const snapshots=await Promise.all(RESERVE_NODES.map(async host=>{
      const [info,u]=await Promise.all([reserveRpc(host,'GetLightdInfo',{}),reserveRpc(host,'GetAddressUtxos',{addresses:[RESERVE_ADDRESS],startHeight:0,maxEntries:0})])
      if(info.chainName!=='main'||!Number.isSafeInteger(Number(info.blockHeight)))throw new Error('Invalid reserve chain')
      const coins:ReserveCoin[]=(u.addressUtxos??[]).map((x:any)=>({txid:Buffer.from(x.txid).reverse().toString('hex'),index:Number(x.index),value_zats:Number(x.valueZat),height:Number(x.height)}))
      coins.sort((a,b)=>a.txid.localeCompare(b.txid)||a.index-b.index)
      return {height:Number(info.blockHeight),branch_id:parseInt(info.consensusBranchId,16),coins}
    }))
    if(snapshots[0].branch_id!==snapshots[1].branch_id||Math.abs(snapshots[0].height-snapshots[1].height)>2||JSON.stringify(snapshots[0].coins)!==JSON.stringify(snapshots[1].coins))throw new Error('Reserve nodes disagree; retry later')
    const height=Math.min(...snapshots.map(s=>s.height))
    const coins=snapshots[0].coins.filter(c=>c.height>0&&height-c.height+1>=3)
    const live=coins.reduce((n,c)=>n+BigInt(c.value_zats),0n)
    // Keep exact-tag deposits available until their wrap requests are fulfilled.
    const protectedDeposits=new Set<string>()
    const wd=process.env.WRAP_DESK_ADDRESS
    if(!wd)throw new Error('WrapDesk must be configured before reserve spends')
    const desk=new ethers.Contract(wd,['function requestCount() view returns(uint256)','function summary(uint256) view returns(address,uint256,uint64,uint8,bytes32,uint256)'],provider)
    const n=Number(await desk.requestCount())
    if(n>10000)throw new Error('Wrap index requires reconciliation')
    for(let i=0;i<n;i++){const s=await desk.summary(i);if(Number(s[3])===1)protectedDeposits.add(String(s[5]))}
    const a=await redemptionAccounting()
    const spent=all.filter(t=>Date.parse(t.at)>Date.now()-86400000).reduce((v,t)=>v+BigInt(t.amount_zats),0n)
    const plan=planReimbursement(live,a.supply,a.reimbursementZats,coins.filter(c=>!protectedDeposits.has(String(c.value_zats))),spent)
    if(!plan){console.log('No eligible reserve reimbursement');return}
    console.log(JSON.stringify({mode:execute?'execute':'preview',reserveZec:Number(live)/1e8,supply:Number(a.supply)/1e8,owedToFloat:Number(a.reimbursementZats)/1e8,repayZec:Number(plan.amount)/1e8,feeZec:Number(plan.fee)/1e8,inputs:plan.inputs.length,retainedChangeZec:Number(plan.change)/1e8}))
    if(!execute)return
    const credential=process.env.CREDENTIALS_DIRECTORY
    if(!credential)throw new Error('Reserve service credential missing')
    const secret=JSON.parse(readFileSync(credential+'/reserve','utf8'))
    const record=secret.record
    if(record.address!==RESERVE_ADDRESS||record.version!==1||record.network!=='zcash-mainnet')throw new Error('Reserve credential metadata mismatch')
    const wallet=await ethers.Wallet.fromEncryptedJson(JSON.stringify(record.encryptedKey),secret.passphrase)
    if(transparentAddress(wallet.signingKey.publicKey)!==RESERVE_ADDRESS)throw new Error('Reserve credential address mismatch')
    let signed:any
    try {signed=JSON.parse(execFileSync(reserveSigner(),[],{input:JSON.stringify({private_key:wallet.privateKey,height,branch_id:snapshots[0].branch_id,amount_zats:Number(plan.amount),fee_zats:Number(plan.fee),inputs:plan.inputs.map(({height,...c})=>c)}),encoding:'utf8',maxBuffer:1<<20,stdio:['pipe','pipe','pipe']}))}
    catch {throw new Error('Reserve signer rejected the transfer; credential details withheld')}
    const decoded=inspectTransaction(signed.raw,signed.branch_id)
    if(decoded.txid!==signed.txid||signed.amount_zats!==Number(plan.amount)||signed.fee_zats!==Number(plan.fee))throw new Error('Signed reserve transfer mismatch')
    const t:Transfer={...signed,inputs:plan.inputs,at:new Date().toISOString(),status:'signed'}
    all.push(t);atomicJson(TRANSFERS,all)
    // Persist exact txid/raw before one broadcast attempt. No automatic re-sign/re-send.
    const result=await reserveRpc(RESERVE_NODES[0],'SendTransaction',{data:Buffer.from(t.raw,'hex'),height:0})
    if(Number(result.errorCode)!==0)throw new Error('Reserve broadcast was not accepted; inspect persisted transaction before retrying')
    t.status='submitted';atomicJson(TRANSFERS,all)
    console.log(`Reserve reimbursement submitted: ${t.txid}; minting waits for confirmation`)
  } finally {provider.destroy()}
}
withLock('issuance',main).catch(()=>{console.error('Reserve reimbursement needs review. No blind retry; inspect public transfer state and service status. Secret details withheld.');process.exitCode=1})
