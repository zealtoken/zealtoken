/** Upload only validated operational keys from this Mac directly to AWS Secrets Manager.
 * No secret values in arguments, stdout, logs, or temporary files. Does not activate trading.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { ethers } from 'ethers'
import { CHAIN, CONTRACTS, requireEnv } from './config.js'
import { keyPath } from './chain.js'
import { createCloudSecretClient, putCloudSecret, safeCloudError } from './cloud-secrets.js'

const PROFILE = 'oenbot-operator', REGION = 'us-east-2'
let stage = 'checking the local terminal'
class SetupError extends Error {}
async function main() {
  if (!process.stdin.isTTY) throw new SetupError('Run this command in your local terminal')
  stage = 'checking AWS login and the ZEAL stack'
  const out = JSON.parse(execFileSync('aws', ['cloudformation','describe-stacks','--profile',PROFILE,'--region',REGION,'--stack-name','zeal-operator','--output','json','--no-cli-pager'], { encoding:'utf8', stdio:['ignore','pipe','ignore'] }))
  const config = Object.fromEntries(out.Stacks[0].Outputs.map((x: {OutputKey:string;OutputValue:string})=>[x.OutputKey,x.OutputValue]))
  if (out.Stacks[0].StackStatus !== 'CREATE_COMPLETE' && out.Stacks[0].StackStatus !== 'UPDATE_COMPLETE') throw new SetupError('Cloud stack is not ready')
  const client=createCloudSecretClient()
  stage = 'reading the minter passphrase'
  const rl=createInterface({input:process.stdin,output:process.stdout,terminal:true})
  process.stdout.write('Minter passphrase (upload securely to ZEAL cloud): ')
  const write=process.stdout.write.bind(process.stdout)
  process.stdout.write=(()=>true) as typeof process.stdout.write
  let pass: string
  try {pass=await new Promise<string>(resolve=>rl.question('',resolve))}
  finally {process.stdout.write=write;rl.close();process.stdout.write('\n')}
  const provider=new ethers.JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true})
  const token=new ethers.Contract(CONTRACTS.zzec,['function attestor() view returns(address)','function minter() view returns(address)'],provider)
  const validated: {role:string;passphrase:string;keystore:unknown}[]=[]
  for (const role of ['keeper','attestor','minter'] as const) {
    stage = role==='minter' ? 'unlocking the minter key' : 'reading '+role+' from Keychain'
    const secret=role==='minter'?pass:execFileSync('/usr/bin/security',['find-generic-password','-s','zeal-'+role,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()
    stage = 'reading the '+role+' keystore'
    const text=readFileSync(keyPath(role),'utf8')
    let wallet: ethers.Wallet | ethers.HDNodeWallet
    try {wallet=await ethers.Wallet.fromEncryptedJson(text,secret)} catch {throw new SetupError(role+' key unlock failed; nothing uploaded')}
    stage = 'checking the '+role+' on-chain role'
    let expected=role==='keeper'?'0x19cece80126b79F76D8b8297B876310a56349738':role==='attestor'?await token.attestor():await token.minter()
    if(role==='minter' && expected.toLowerCase()!==wallet.address.toLowerCase()) {
      if(expected.toLowerCase()!==requireEnv('WRAP_DESK_ADDRESS').toLowerCase()) throw new SetupError('Unexpected minter authority; nothing uploaded')
      expected=await new ethers.Contract(expected,['function operator() view returns(address)'],provider).operator()
    }
    if(expected.toLowerCase()!==wallet.address.toLowerCase()) throw new SetupError(role+' address mismatch; nothing uploaded')
    validated.push({role,passphrase:secret,keystore:JSON.parse(text)})
  }
  for(const value of validated) {
    stage = 'uploading the '+value.role+' credential to AWS'
    await putCloudSecret(client, {
      SecretId:config[value.role[0].toUpperCase()+value.role.slice(1)+'Secret'],
      SecretString:JSON.stringify({keystore:value.keystore,passphrase:value.passphrase}),
    })
    console.log(value.role+' cloud credential uploaded and address validated')
  }
  client.destroy()
  console.log('Cloud keys are ready. Laptop services are still running; cloud signing is still disabled. Return to Codex to finish the verified handoff.')
}
main().catch(e=>{
  const reason=e instanceof SetupError ? e.message : safeCloudError(e)
  console.error(`Cloud key setup stopped while ${stage}: ${reason}. Cloud signing remains disabled.`)
  process.exitCode=1
})
