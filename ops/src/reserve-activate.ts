/** User-run activation: this enables real native ZEC reserve transfers. */
import { execFileSync } from 'node:child_process'
const aws='/Users/kyle/.local/bin/aws'
const base=['--profile','oenbot-operator','--region','us-east-2']
function call(args:string[]) { return JSON.parse(execFileSync(aws,[...base,...args,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})) }
const script=`set -eu
# Refuse repeat activation; reconcile an existing operation instead.
test ! -e /etc/zeal/RESERVE_ACTIVE
printf '%s  %s\\n' f874082783d7af348a6ecb193e4dab437c582779b9eabf8978949cd46c1b157e /usr/local/bin/zeal-reserve-signer | sha256sum -c -
python3 - <<'PYREMOTE'
import json,pathlib
assert json.loads(pathlib.Path('/var/lib/zeal/runtime/launchd/reserve-transfers.json').read_text()) == [], 'Reconcile existing transfers first'
s=json.loads(pathlib.Path('/etc/zeal/reserve-stage.json').read_text())
assert s['address']=='t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
assert s['signerSha256']=='f874082783d7af348a6ecb193e4dab437c582779b9eabf8978949cd46c1b157e'
PYREMOTE
install -o root -g root -m 600 /dev/null /etc/zeal/RESERVE_ACTIVE
systemctl start zeal-reserve-secret.service
systemctl start zeal-reserve-reimburse.service
systemctl enable --now zeal-reserve-reimburse.timer
systemctl is-active zeal-reserve-reimburse.timer
printf 'Reserve reimbursement automation activated. Confirm settlement and accounting before considering handoff complete.\\n'
`
async function main(){
 if(process.platform!=='darwin'||!process.stdin.isTTY)throw new Error('Run in your local terminal')
 console.log('Activating REAL reserve reimbursements: only completed-redemption debt; up to 0.1 ZEC per transfer and 0.25 ZEC per rolling day, plus bounded fees.')
 const sent=call(['ssm','send-command','--instance-ids','i-00c95b5a0ed0a8ec4','--document-name','AWS-RunShellScript','--parameters',JSON.stringify({commands:[script],executionTimeout:['600']})])
 const id=sent.Command.CommandId
 console.log('Cloud activation command:',id)
 for(let i=0;i<210;i++){
  await new Promise(resolve=>setTimeout(resolve,3000))
  let r:any
  try { r=call(['ssm','get-command-invocation','--instance-id','i-00c95b5a0ed0a8ec4','--command-id',id]) }catch {continue}
  if(['Pending','InProgress','Delayed'].includes(r.Status))continue
  console.log('Status:',r.Status)
  if(r.StandardOutputContent)console.log(r.StandardOutputContent.trim())
  if(r.Status!=='Success')throw new Error('Activation needs review')
  console.log('Return to Codex with this output to verify the transaction, reserve accounting and wallet credit.');return
 }
 throw new Error('Activation status uncertain')
}
main().catch(()=>{console.error('Activation did not report verified success. Do not retry: return the command ID to Codex for reconciliation. No secret input is needed.');process.exitCode=1})
