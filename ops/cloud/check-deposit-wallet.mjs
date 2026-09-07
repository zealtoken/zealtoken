// Read a systemd credential, decrypt only in this process, and report public checks.
import {readFileSync} from 'node:fs'
import {ethers} from 'ethers'
const fingerprint='0xbee3026767898339ecb5f6ac016ff1116772baee23ddac9639b9c08257619e6d'
async function main(){
 if(!process.env.CREDENTIALS_DIRECTORY)throw Error('Credential transport missing')
 const {record,passphrase}=JSON.parse(readFileSync(process.env.CREDENTIALS_DIRECTORY+'/deposit','utf8'))
 if(record.version!==2||record.network!=='zcash-mainnet'||record.fingerprint!==fingerprint||ethers.id(record.xpub)!==fingerprint)throw Error('Invalid metadata')
 const wallet=await ethers.Wallet.fromEncryptedJson(JSON.stringify(record.encryptedKey),passphrase)
 if(!(wallet instanceof ethers.HDNodeWallet)||wallet.neuter().extendedKey!==record.xpub)throw Error('Restore mismatch')
 const p=new ethers.JsonRpcProvider('https://rpc.mainnet.chain.robinhood.com')
 try{
  if((await p.getNetwork()).chainId!==4663n)throw Error('Wrong chain')
  const d=new ethers.Contract('0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379',['function depositKeyFingerprint() view returns(bytes32)'],p)
  if(await d.depositKeyFingerprint()!==fingerprint)throw Error('Contract mismatch')
 }finally{p.destroy()}
 console.log('Cloud deposit-wallet decrypt/restore and deployed fingerprint checks passed. No signing, broadcast or activation performed.')
}
main().catch(()=>{console.error('Cloud deposit wallet check failed; secret details withheld.');process.exitCode=1})
