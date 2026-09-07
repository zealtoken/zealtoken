/** Encrypt the stopped local float and its final ledger; never upload plaintext wallet data. */
import { readFileSync,writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createCipheriv,createHash,randomBytes } from 'node:crypto'
import { SecretsManagerClient,GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { withLock } from './ops-lock.js'
const root=new URL('../',import.meta.url).pathname
async function main(){
 for(const job of ['desk-pay','email-health']) {
  let loaded=false;try{execFileSync('launchctl',['list','com.zealtoken.'+job],{stdio:'pipe'});loaded=true}catch{}
  if(loaded)throw new Error('Stop the local '+job+' service before copying the wallet')
 }
 const state=JSON.parse(readFileSync(root+'launchd/cloud-final-migration.json','utf8'))
 const sm=new SecretsManagerClient({region:'us-east-2',profile:'oenbot-operator',maxAttempts:3})
 const response=await sm.send(new GetSecretValueCommand({SecretId:state.outputs.FloatWalletSecret}))
 const key=Buffer.from(JSON.parse(response.SecretString!).backupKey,'hex')
 await withLock('desk-pay',async()=>{
  const plain=execFileSync('python3',['-c',`import io,pathlib,tarfile,sys
r=pathlib.Path(sys.argv[1]);buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w:gz') as t:
 for source,dest in [('.float/zingo-wallet.dat','.float/zingo-wallet.dat'),('.float/connectivity-consent','.float/connectivity-consent'),('desk-ledger.json','launchd/desk-ledger.json')]:
  p=r/source
  if p.exists():t.add(p,arcname=dest)
sys.stdout.buffer.write(buf.getvalue())`,root],{maxBuffer:8<<20})
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from('ZEAL redemption float backup v1'))
  const encrypted=Buffer.concat([Buffer.from('ZEALF1'),nonce,cipher.update(plain),cipher.final(),cipher.getAuthTag()])
  const path='/tmp/zeal-float-handoff.enc';writeFileSync(path,encrypted,{mode:0o600})
  const walletHash=createHash('sha256').update(readFileSync(root+'.float/zingo-wallet.dat')).digest('hex')
  const ledgerHash=createHash('sha256').update(readFileSync(root+'desk-ledger.json')).digest('hex')
  writeFileSync(root+'launchd/float-handoff.json',JSON.stringify({at:new Date().toISOString(),walletHash,ledgerHash}),{mode:0o600})
  execFileSync('/Users/kyle/.local/bin/aws',['--profile','oenbot-operator','--region','us-east-2','s3','cp',path,'s3://'+state.outputs.Bucket+'/releases/float-handoff.enc','--only-show-errors'],{stdio:'pipe'})
  console.log('Encrypted float and final payout ledger uploaded; fingerprints recorded. Cloud payouts remain disabled.')
 })
}
main().catch(e=>{console.error('Wallet handoff packaging failed:',e?.name??'Error','Inspect stage; credential details withheld.');process.exitCode=1})
