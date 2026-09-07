/** Upload only the already-prepared single-address key; never a wallet recovery phrase. */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createHash } from 'node:crypto'
import { createCloudSecretClient, putCloudSecret } from './cloud-secrets.js'
import { RESERVE_ADDRESS, transparentAddress } from './reserve-key.js'
import { CHAIN, CONTRACTS } from './config.js'
async function main() {
 if(process.platform!=='darwin'||!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Local terminal required')
 const ready=JSON.parse(readFileSync(new URL('../launchd/reserve-cloud-ready.json',import.meta.url),'utf8'))
 if(ready.status!=='staged-disabled'||ready.address!==RESERVE_ADDRESS||!ready.signerSha256)throw new Error('Cloud reserve staging is not ready')
 const aws='/Users/kyle/.local/bin/aws', args=['--profile','oenbot-operator','--region','us-east-2']
 const stack=JSON.parse(execFileSync(aws,[...args,'cloudformation','describe-stacks','--stack-name','zeal-operator','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).Stacks[0]
 if(!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(stack.StackStatus))throw new Error('Stack not ready')
 const config=Object.fromEntries(stack.Outputs.map((x:any)=>[x.OutputKey,x.OutputValue]))
 if(config.ReserveSecret!==ready.secretArn)throw new Error('Reserve secret mismatch')
 const p=new ethers.JsonRpcProvider(CHAIN.rpc,CHAIN.id)
 try {if(await new ethers.Contract(CONTRACTS.zzec,['function reserveAddress() view returns(string)'],p).reserveAddress()!==RESERVE_ADDRESS)throw new Error('Contract mismatch')}
 finally {p.destroy()}
 const path=new URL('../.keys/reserve-transparent.json',import.meta.url).pathname
 const raw=readFileSync(path,'utf8'),record=JSON.parse(raw)
 if(record.version!==1||record.address!==RESERVE_ADDRESS||record.network!=='zcash-mainnet')throw new Error('Local key metadata mismatch')
 console.log('This stages AWS control of the existing reserve address. Signing remains disabled until verification.')
 console.log('Enter the encryption passphrase you created for reserve:prepare. Do NOT enter the recovery phrase.')
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true})
 const write=process.stdout.write.bind(process.stdout);write('Reserve encryption passphrase (hidden): ');process.stdout.write=(()=>true) as typeof process.stdout.write
 let pass:string
 try {pass=await new Promise((resolve,reject)=>{rl.once('SIGINT',()=>reject(new Error('Cancelled')));rl.once('close',()=>reject(new Error('Input closed')));rl.question('',resolve)})}
 finally {process.stdout.write=write;rl.close();write('\n')}
 const wallet=await ethers.Wallet.fromEncryptedJson(JSON.stringify(record.encryptedKey),pass)
 if(transparentAddress(wallet.signingKey.publicKey)!==RESERVE_ADDRESS)throw new Error('Key mismatch')
 // Independent off-host copy contains ciphertext only, without its password.
 const hash=createHash('sha256').update(raw).digest('hex')
 const backup=`s3://${config.Bucket}/backups/reserve-key-${hash}.json`
 execFileSync(aws,[...args,'s3','cp',path,backup,'--only-show-errors'],{stdio:['ignore','pipe','pipe']})
 const downloaded=execFileSync(aws,[...args,'s3','cp',backup,'-','--only-show-errors'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
 if(createHash('sha256').update(downloaded).digest('hex')!==hash)throw new Error('Backup mismatch')
 const recovered=await ethers.Wallet.fromEncryptedJson(JSON.stringify(JSON.parse(downloaded).encryptedKey),pass)
 if(transparentAddress(recovered.signingKey.publicKey)!==RESERVE_ADDRESS)throw new Error('Backup restore check failed')
 const client=createCloudSecretClient()
 try {await putCloudSecret(client,{SecretId:config.ReserveSecret,ClientRequestToken:hash,SecretString:JSON.stringify({record,passphrase:pass})})}
 finally {client.destroy();pass=''}
 console.log('Reserve credential uploaded; encrypted backup downloaded and decrypt-tested successfully.')
 console.log('No funds moved. Cloud reserve signing remains disabled. Return to Codex to verify and activate.')
}
main().catch(()=>{console.error('Reserve cloud staging did not complete. Check the encryption password, AWS login and staging status. Secret details withheld; signing remains disabled.');process.exitCode=1})
