/** Run once after the on-chain delay. Owner signing stays on the Mac. */
import { ethers } from 'ethers'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { provider } from './chain.js'
import { managedSend } from './managed-send.js'
import { withLock } from './ops-lock.js'
const run=promisify(execFile),aws='/Users/kyle/.local/bin/aws'
const args=['--profile','oenbot-operator','--region','us-east-2']
const root=new URL('../',import.meta.url).pathname
const state=JSON.parse(readFileSync(root+'launchd/cloud-final-migration.json','utf8'))
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function cli(a:string[]) {const r=await run(aws,[...args,...a],{maxBuffer:4<<20});return r.stdout?JSON.parse(r.stdout):null}
async function remote(script:string) {
 const r=await cli(['ssm','send-command','--instance-ids',state.outputs.InstanceId,'--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:[script],executionTimeout:['300']})])
 for(let i=0;i<100;i++) {
  await sleep(3000)
  const s=await cli(['ssm','get-command-invocation','--instance-id',state.outputs.InstanceId,'--command-id',r.Command.CommandId])
  if(s.Status==='Success')return s.StandardOutputContent
  if(!['Pending','InProgress','Delayed'].includes(s.Status))throw new Error('Cloud verification failed: '+s.StandardErrorContent.slice(-1000))
 }
 throw new Error('Cloud command is still unresolved; inspect SSM before repeating the handoff')
}
async function main() {
 const f=new ethers.Contract(state.furnace,['function igniter() view returns(address)','function owner() view returns(address)','function pendingIgniter() view returns(address account,uint64 eta)','function commitIgniter()'],provider)
 const isCurrent=(await f.igniter()).toLowerCase()===state.burner.toLowerCase()
 if(!isCurrent) {
  const p=await f.pendingIgniter();const block=await provider.getBlock('latest')
  if(p.account.toLowerCase()!==state.burner.toLowerCase())throw new Error('Expected burner proposal is not pending')
  if(Number(p.eta)>block!.timestamp) {console.log('The contract delay has not elapsed. Eligible at '+new Date(Number(p.eta)*1000).toISOString()+'. Nothing changed.');return}
  if(block!.timestamp>Number(p.eta)+7*86400)throw new Error('Burner proposal expired; inspect before reproposing')
 }
 if(!existsSync(root+'launchd/cloud-fulfiller-migrated.json'))throw new Error('Finish payout handoff first')
 console.log('Checking staged cloud burner and active payout services…')
 await remote(`set -eu\ntest -f /etc/zeal/PAYOUT_ACTIVE\nsystemctl is-enabled zeal-desk-pay.timer\ntest -f /etc/systemd/system/zeal-burn.service\npython3 - <<'PY'\nimport json,pathlib\nk=json.loads(pathlib.Path('/var/lib/zeal/runtime/.keys/burner.json').read_text())\nassert k['address'].lower()=='${state.burner.slice(2).toLowerCase()}'\nassert pathlib.Path('/run/zeal/burner').is_file()\nPY\n`)
 await withLock('burn',async()=>{
  if(!isCurrent) {
   const pendingNow=await f.pendingIgniter()
   if(pendingNow.account.toLowerCase()!==state.burner.toLowerCase())throw new Error('Burner proposal changed during preflight')
   const pass=(await run('security',['find-generic-password','-s','zeal-burner','-w'])).stdout.trimEnd()
   const unlocked=await ethers.Wallet.fromEncryptedJson(readFileSync(root+'.keys/deployer.json','utf8'),pass)
   const owner=new ethers.Wallet(unlocked.privateKey,provider)
   if((await f.owner()).toLowerCase()!==owner.address.toLowerCase())throw new Error('Local owner key mismatch')
   const tx=await managedSend(owner,await f.commitIgniter.populateTransaction());console.log('Burner role committed:',tx.hash)
  }
  if((await f.igniter()).toLowerCase()!==state.burner.toLowerCase())throw new Error('Role verification failed')
  const label='gui/'+process.getuid!()+'/com.zealtoken.burn'
  await run('launchctl',['disable',label]);await run('launchctl',['bootout',label]).catch(()=>{})
  writeFileSync(root+'launchd/cloud-burner-migrated.json',JSON.stringify({at:new Date().toISOString(),instance:state.outputs.InstanceId}),{mode:0o600})
 })
 console.log('Starting and verifying cloud daily burns…')
 console.log(await remote('set -eu\ntouch /etc/zeal/BURN_ACTIVE\nchmod 644 /etc/zeal/BURN_ACTIVE\nsystemctl enable --now zeal-burn.timer\nsystemctl start zeal-burn.service\nsystemctl show zeal-burn.service --property=Result,ExecMainStatus\npython3 /var/lib/zeal/runtime/cloud/health.py\n'))
 // Remove the now-obsolete laptop heartbeat alarm through CloudFormation.
 const st=(await cli(['cloudformation','describe-stacks','--stack-name','zeal-operator'])).Stacks[0]
 const param=st.Parameters.find((p:any)=>p.ParameterKey==='RemainingLaptopBurn')
 if(param?.ParameterValue!=='false') {
  const name='finish-burn-'+Date.now()
  const params=st.Parameters.map((p:any)=>p.ParameterKey==='RemainingLaptopBurn'?{ParameterKey:p.ParameterKey,ParameterValue:'false'}:{ParameterKey:p.ParameterKey,UsePreviousValue:true})
  await cli(['cloudformation','create-change-set','--stack-name','zeal-operator','--change-set-name',name,'--use-previous-template','--capabilities','CAPABILITY_IAM','--parameters',JSON.stringify(params)])
  let change:any
  for(let i=0;i<60;i++){await sleep(3000);change=await cli(['cloudformation','describe-change-set','--stack-name','zeal-operator','--change-set-name',name]);if(change.Status==='CREATE_COMPLETE'||change.Status==='FAILED')break}
  if(change.Status!=='CREATE_COMPLETE'||change.Changes.length!==1||change.Changes[0].ResourceChange.LogicalResourceId!=='LaptopAlarm'||change.Changes[0].ResourceChange.Action!=='Remove')throw new Error('Unexpected infrastructure changes; cloud burn is active, laptop alarm cleanup needs review')
  await cli(['cloudformation','execute-change-set','--stack-name','zeal-operator','--change-set-name',name])
  let done=false
  for(let i=0;i<120;i++){await sleep(3000);const s=(await cli(['cloudformation','describe-stacks','--stack-name','zeal-operator'])).Stacks[0];if(s.StackStatus==='UPDATE_COMPLETE'){done=true;break}if(s.StackStatus.includes('ROLLBACK')||s.StackStatus.includes('FAILED'))break}
  if(!done)throw new Error('Cloud burns are active; confirm laptop alarm stack cleanup before retiring its monitor')
 }
 const monitor='gui/'+process.getuid!()+'/com.zealtoken.email-health'
 await run('launchctl',['disable',monitor]);await run('launchctl',['bootout',monitor]).catch(()=>{})
 console.log('Daily burns and redemption payouts are on AWS. The laptop is no longer required for these operations.')
}
main().catch(e=>{
  const message=e?.shortMessage??e?.message??'Burn handoff failed'
  console.error(/SSO|expired.*token|credentials.*(expired|locate)/i.test(message)?'AWS login needs renewal. Run: /Users/kyle/.local/bin/aws sso login --profile oenbot-operator — then repeat npm run cloud:finish-burn.':message)
  process.exitCode=1
})
