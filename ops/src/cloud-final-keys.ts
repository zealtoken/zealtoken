/** Prepare only the operational keys for the final migration. No reserve or owner key is uploaded. */
import { ethers } from 'ethers'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { provider } from './chain.js'
import { managedSend } from './managed-send.js'
import { requireEnv } from './config.js'
const aws = '/Users/kyle/.local/bin/aws'
const stack = JSON.parse(execFileSync(aws, ['cloudformation','describe-stacks','--profile','oenbot-operator','--region','us-east-2','--stack-name','zeal-operator'], {encoding:'utf8'}))
const outputs = Object.fromEntries(stack.Stacks[0].Outputs.map((x: any) => [x.OutputKey,x.OutputValue]))
const sm = new SecretsManagerClient({region:'us-east-2',profile:'oenbot-operator',maxAttempts:3})
async function get(id: string) {
  try { const r = await sm.send(new GetSecretValueCommand({SecretId:id})); return JSON.parse(r.SecretString!) }
  catch(e) { if ((e as Error).name === 'ResourceNotFoundException') return null; throw e }
}
async function main() {
  const fulfillerPass=execFileSync('security',['find-generic-password','-s','zeal-fulfiller','-w'],{encoding:'utf8'}).trimEnd()
  const keystore=JSON.parse(readFileSync(new URL('../.keys/fulfiller.json',import.meta.url),'utf8'))
  const fulfiller=await ethers.Wallet.fromEncryptedJson(JSON.stringify(keystore),fulfillerPass)
  const desk=new ethers.Contract(requireEnv('DESK_ADDRESS'),['function operator() view returns(address)'],provider)
  if ((await desk.operator()).toLowerCase()!==fulfiller.address.toLowerCase()) throw new Error('Fulfiller does not match contract operator')
  await sm.send(new PutSecretValueCommand({SecretId:outputs.FulfillerSecret,SecretString:JSON.stringify({keystore,passphrase:fulfillerPass})}))
  console.log('Fulfiller cloud credential validated and uploaded:',fulfiller.address)
  let burnerSecret=await get(outputs.BurnerSecret)
  if (!burnerSecret) {
    const burner=ethers.Wallet.createRandom();const passphrase=randomBytes(32).toString('base64')
    burnerSecret={keystore:JSON.parse(await burner.encrypt(passphrase)),passphrase}
    await sm.send(new PutSecretValueCommand({SecretId:outputs.BurnerSecret,SecretString:JSON.stringify(burnerSecret)}))
  }
  const burner=await ethers.Wallet.fromEncryptedJson(JSON.stringify(burnerSecret.keystore),burnerSecret.passphrase)
  if (!await get(outputs.FloatWalletSecret)) await sm.send(new PutSecretValueCommand({SecretId:outputs.FloatWalletSecret,SecretString:JSON.stringify({backupKey:randomBytes(32).toString('hex')})}))
  const furnace=new ethers.Contract(requireEnv('FURNACE_ADDRESS'),['function owner() view returns(address)','function igniter() view returns(address)','function pendingIgniter() view returns(address account,uint64 eta)','function proposeIgniter(address)'],provider)
  const ownerPass=execFileSync('security',['find-generic-password','-s','zeal-burner','-w'],{encoding:'utf8'}).trimEnd()
  const ownerKey=await ethers.Wallet.fromEncryptedJson(readFileSync(new URL('../.keys/deployer.json',import.meta.url),'utf8'),ownerPass)
  const owner=new ethers.Wallet(ownerKey.privateKey,provider)
  if ((await furnace.owner()).toLowerCase()!==owner.address.toLowerCase()) throw new Error('Local owner key mismatch')
  const pending=await furnace.pendingIgniter()
  if (pending.account!==ethers.ZeroAddress && pending.account.toLowerCase()!==burner.address.toLowerCase()) throw new Error('Another igniter proposal exists; preserving it')
  if ((await furnace.igniter()).toLowerCase()!==burner.address.toLowerCase() && pending.account===ethers.ZeroAddress) {
    const tx=await managedSend(owner,await furnace.proposeIgniter.populateTransaction(burner.address)); console.log('Dedicated burner proposed:',tx.hash)
  }
  const target=ethers.parseEther('0.01'),balance=await provider.getBalance(burner.address)
  if(balance<target) {const tx=await managedSend(owner,{to:burner.address,value:target-balance});console.log('Burner gas funded to 0.01 ETH:',tx.hash)}
  const p=await furnace.pendingIgniter()
  const state={burner:burner.address,fulfiller:fulfiller.address,furnace:await furnace.getAddress(),eligibleAt:Number(p.eta)?new Date(Number(p.eta)*1000).toISOString():null,outputs}
  writeFileSync(new URL('../launchd/cloud-final-migration.json',import.meta.url),JSON.stringify(state,null,2),{mode:0o600})
  console.log('Burner:',burner.address,'eligible at:',state.eligibleAt)
}
main().catch(e=>{console.error('Final key setup failed:',e?.name??'Error',e?.shortMessage??'Inspect the current migration stage; secret details are withheld.');process.exitCode=1})
