/** Local hidden prompt; stages dedicated deposit custody, never activates a service. */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createCloudSecretClient, putCloudSecret } from './cloud-secrets.js'
import { CHAIN, CONTRACTS } from './config.js'
import { atomicJson, stateDir } from './ops-lock.js'
const DESK='0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379'
const FINGERPRINT='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d'
const SECRET='arn:aws:secretsmanager:us-east-2:589158200866:secret:zeal/wrap-v2-deposits-fNs1Cq'
const BUCKET='zeal-operator-artifacts-z0jy5fu8vvsh'
async function main(){
 if(process.platform!=='darwin'||!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Local terminal required')
 const aws='/Users/kyle/.local/bin/aws',args=['--profile','oenbot-operator','--region','us-east-2']
 const meta=JSON.parse(execFileSync(aws,[...args,'secretsmanager','describe-secret','--secret-id',SECRET,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
 if(meta.ARN!==SECRET||meta.DeletedDate)throw Error('Unexpected secret')
 const p=new ethers.JsonRpcProvider(CHAIN.rpc)
 try{
  if((await p.getNetwork()).chainId!==4663n)throw Error('Wrong chain')
  const d=new ethers.Contract(DESK,['function depositKeyFingerprint() view returns(bytes32)','function zzec() view returns(address)'],p)
  if(await d.depositKeyFingerprint()!==FINGERPRINT||String(await d.zzec()).toLowerCase()!==CONTRACTS.zzec.toLowerCase())throw Error('Contract mismatch')
 }finally{p.destroy()}
 const file=new URL('../.keys/wrap-v2-deposits.json',import.meta.url).pathname
 const raw=readFileSync(file,'utf8'),record=JSON.parse(raw)
 const pub=JSON.parse(readFileSync(new URL('../launchd/wrap-v2-public.json',import.meta.url),'utf8'))
 if(record.version!==2||record.network!=='zcash-mainnet'||record.fingerprint!==FINGERPRINT||record.xpub!==pub.xpub||ethers.id(record.xpub)!==FINGERPRINT)throw Error('Custody mismatch')
 console.log('Stage the dedicated ZEAL deposit wallet in AWS and verify an off-device encrypted backup. No funds move and no service is activated.')
 console.log('Use the new deposit-wallet encryption password, not your owner keystore password or a recovery phrase.')
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true})
 const write=process.stdout.write.bind(process.stdout);write('Deposit-wallet encryption password (hidden): ');process.stdout.write=(()=>true) as typeof process.stdout.write
 let password:string
 try{password=await new Promise((resolve,reject)=>{rl.once('SIGINT',()=>reject(Error('Cancelled')));rl.once('close',()=>reject(Error('Input closed')));rl.question('',resolve)})}
 finally{process.stdout.write=write;rl.close();write('\n')}
 const wallet=await ethers.Wallet.fromEncryptedJson(JSON.stringify(record.encryptedKey),password)
 if(!(wallet instanceof ethers.HDNodeWallet)||wallet.neuter().extendedKey!==pub.xpub)throw Error('Restore mismatch')
 const hash=createHash('sha256').update(raw).digest('hex')
 const backup=`s3://${BUCKET}/backups/wrap-v2-deposits-${hash}.json`
 execFileSync(aws,[...args,'s3','cp',file,backup,'--only-show-errors'],{stdio:['ignore','pipe','pipe']})
 const downloaded=execFileSync(aws,[...args,'s3','cp',backup,'-','--only-show-errors'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
 if(createHash('sha256').update(downloaded).digest('hex')!==hash)throw Error('Backup bytes mismatch')
 const recovered=await ethers.Wallet.fromEncryptedJson(JSON.stringify(JSON.parse(downloaded).encryptedKey),password)
 if(!(recovered instanceof ethers.HDNodeWallet)||recovered.neuter().extendedKey!==pub.xpub)throw Error('Off-device restore failed')
 const client=createCloudSecretClient()
 try{await putCloudSecret(client,{SecretId:SECRET,ClientRequestToken:hash,SecretString:JSON.stringify({record,passphrase:password})})}
 finally{client.destroy();password=''}
 atomicJson(stateDir+'wrap-v2-cloud-ready.json',{status:'staged-disabled',fingerprint:FINGERPRINT,desk:DESK,secretArn:SECRET,backup,backupSha256:hash,at:new Date().toISOString()})
 console.log('Dedicated deposit credential staged; off-device encrypted backup downloaded and decrypt-tested. No funds moved or services activated. Return only this success output to Codex.')
}
main().catch(()=>{console.error('Deposit cloud staging did not complete. Check AWS login and the deposit-wallet password. Secret details withheld; this command does not activate signing.');process.exitCode=1})
