/** Creates isolated encrypted deposit custody locally. No network or activation. */
import {ethers} from 'ethers'
import {mkdirSync,existsSync,lstatSync,writeFileSync,readFileSync,chmodSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {deriveDepositAddress} from './wrap-v2-policy.js'
class SetupError extends Error{}
async function hidden(label:string){
 const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true})
 const write=process.stdout.write.bind(process.stdout);write(label);process.stdout.write=(()=>true) as typeof process.stdout.write
 try{return await new Promise<string>((resolve,reject)=>{rl.once('SIGINT',()=>reject(new SetupError('Cancelled')));rl.once('close',()=>reject(new SetupError('Input closed')));rl.question('',resolve)})}
 finally{process.stdout.write=write;rl.close();write('\n')}
}
async function main(){
 if(process.platform!=='darwin'||!process.stdin.isTTY||!process.stdout.isTTY)throw new SetupError('Run npm run wrapv2:prepare in your Mac terminal')
 process.umask(0o077)
 const dir=new URL('../.keys/',import.meta.url).pathname,file=dir+'wrap-v2-deposits.json',publicFile=new URL('../launchd/wrap-v2-public.json',import.meta.url).pathname
 if(existsSync(file)||existsSync(publicFile))throw new SetupError('Deposit custody/config already exists. Preserved; never replace keys after assigning addresses.')
 if(existsSync(dir)&&(lstatSync(dir).isSymbolicLink()||!lstatSync(dir).isDirectory()))throw new SetupError('Unsafe key directory')
 mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700)
 mkdirSync(new URL('../launchd/',import.meta.url),{recursive:true,mode:0o700})
 console.log('Create a NEW dedicated ZEAL deposit wallet. No existing recovery phrase is needed. No upload, funds moved or activation.')
 const password=await hidden('Create a deposit-wallet encryption password (at least 16 characters): ')
 const again=await hidden('Repeat the password: ')
 if(password.length<16||password!==again)throw new SetupError('Passwords must match and contain at least 16 characters. Nothing saved.')
 const random=ethers.Wallet.createRandom()
 const path="m/44'/133'/0'/0"
 const branch=ethers.HDNodeWallet.fromPhrase(random.mnemonic!.phrase,'',path)
 const xpub=branch.neuter().extendedKey,fingerprint=ethers.id(xpub)
 const encrypted=await branch.encrypt(password)
 const restored=await ethers.Wallet.fromEncryptedJson(encrypted,password)
 if(!(restored instanceof ethers.HDNodeWallet)||restored.neuter().extendedKey!==xpub)throw new SetupError('Encrypted wallet restore test failed; nothing saved')
 const publicConfig={version:2,network:'zcash-mainnet',path,xpub,fingerprint,createdAt:new Date().toISOString()}
 const record={...publicConfig,encryptedKey:JSON.parse(encrypted)}
 writeFileSync(file,JSON.stringify(record,null,2),{flag:'wx',mode:0o600})
 const backup=file+'.backup';writeFileSync(backup,readFileSync(file),{flag:'wx',mode:0o600})
 const backupRecord=JSON.parse(readFileSync(backup,'utf8'));const checked=await ethers.Wallet.fromEncryptedJson(JSON.stringify(backupRecord.encryptedKey),password)
 if(!(checked instanceof ethers.HDNodeWallet)||checked.neuter().extendedKey!==xpub)throw new SetupError('Backup verification failed. Keep both encrypted files and inspect before proceeding.')
 writeFileSync(publicFile,JSON.stringify(publicConfig,null,2),{flag:'wx',mode:0o600})
 console.log(`Dedicated deposit wallet encrypted and local backup decrypt-tested.\nPublic key fingerprint: ${fingerprint}\nExample address (DO NOT FUND): ${deriveDepositAddress(xpub,0)}`)
 console.log(`Keep ${file} and its .backup, plus the password, in your backups. These local copies are not an off-device backup.`)
 console.log('No upload or activation. Return only this success output to Codex; never send the password, seed, or encrypted key file in chat.')
}
main().catch(e=>{console.error(e instanceof SetupError?e.message:'Deposit preparation failed; secret details withheld. No upload or transfer occurred.');process.exitCode=1})
