import {ethers} from 'hardhat'
import {readFileSync,existsSync,writeFileSync} from 'node:fs'
import {unlock} from './lib/secure'
const TOKEN='0x0b151Ff7a7c5250130EC16C275790961d558E402'
async function main(){
 const file=process.env.WRAP_V2_PUBLIC_CONFIG
 if(!file)throw Error('Set WRAP_V2_PUBLIC_CONFIG to the public config from wrapv2:prepare. Never pass a key file.')
 const config=JSON.parse(readFileSync(file,'utf8'))
 if(config.encryptedKey||config.version!==2||config.network!=='zcash-mainnet'||config.fingerprint!==ethers.id(config.xpub))throw Error('Expected public-only v2 deposit config')
 const pub=ethers.HDNodeWallet.fromExtendedKey(config.xpub)
 if(!(pub instanceof ethers.HDNodeVoidWallet))throw Error('Public extended key required')
 if((await ethers.provider.getNetwork()).chainId!==4663n)throw Error('Expected Robinhood mainnet')
 console.log(`Deposit key fingerprint: ${config.fingerprint}. New contract starts paused; no minter change or funding occurs here.`)
 if(process.env.ACTION!=='deploy'){console.log('Public config validated. ACTION=deploy enables the owner-signed deployment only.');return}
 if(existsSync('.wrap-v2-deployment.json'))throw Error('Deployment record exists; reconcile before deploying another desk')
 const signer=await unlock(ethers.provider),z=await ethers.getContractAt('ZZEC',TOKEN)
 if((await z.owner()).toLowerCase()!==signer.address.toLowerCase())throw Error('Expected existing token owner')
 const operator='0xc678772403C67045fa0B2d882f04e24214f1F513'
 const factory=await ethers.getContractFactory('WrapDeskV2',signer)
 const request=await factory.getDeployTransaction(TOKEN,signer.address,operator,config.fingerprint)
 const [latest,pending]=await Promise.all([ethers.provider.getTransactionCount(signer.address,'latest'),ethers.provider.getTransactionCount(signer.address,'pending')]);if(latest!==pending)throw Error('Owner transaction pending')
 const raw=await signer.signTransaction(await signer.populateTransaction({...request,nonce:pending}))
 const hash=ethers.keccak256(raw),address=ethers.getCreateAddress({from:signer.address,nonce:pending})
 writeFileSync('.wrap-v2-deployment.json',JSON.stringify({address,hash,fingerprint:config.fingerprint,operator},null,2),{flag:'wx',mode:0o600})
 const tx=await ethers.provider.broadcastTransaction(raw);await tx.wait(1,60000)
 console.log(`Paused WrapDeskV2: ${address}\nDeployment transaction: ${hash}\nReturn to Codex for verification. No role proposal or activation performed.`)
}
main().catch(e=>{console.error(e?.shortMessage??e?.message??e);process.exitCode=1})
