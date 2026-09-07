/** One-time local setup. Never uploads the LP owner's key. */
import { ethers } from 'ethers'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CHAIN } from './config.js'
import { managedSend } from './managed-send.js'
import { atomicJson, withLock } from './ops-lock.js'
const run=promisify(execFile)
const root='/Users/kyle/zeal/zealtoken.com/'
const ART=root+'contracts/artifacts/contracts/ZealLpReinvest.sol/ZealLpReinvest.json'
const CONFIG=root+'ops/cloud/lp-reinvest-100.json'
const PREVIOUS='0xe6E6304FDb8bc831cAf45Cb4AF4f5371163c75c0'
const OWNER='0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03',BOT='0x19cece80126b79F76D8b8297B876310a56349738'
const PM='0x58daec3116aae6d93017baaea7749052e8a04fa7',SV='0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',P2='0x000000000022D473030F116dDEE9F6B43aC78BA3'
const POOL='0xa6d41767e205c89fe05d7ad78354af7bb98cbe9b0c3c60f8371b05e7087fdb84',ID=1909208n
const args=[PM,SV,P2,ID,OWNER,BOT,POOL]
const provider=new ethers.JsonRpcProvider(CHAIN.rpc,4663,{staticNetwork:true,cacheTimeout:-1})
async function main(){
 const execute=process.argv.includes('--execute')
 const artifact=JSON.parse(readFileSync(ART,'utf8'))
 const pm=new ethers.Contract(PM,['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function approve(address,uint256)'],provider)
 if(await pm.ownerOf(ID)!==OWNER)throw new Error('Position owner changed')
 if(Number((await provider.getNetwork()).chainId)!==4663)throw new Error('Wrong chain')
 const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode)
 const request=await factory.getDeployTransaction(...args)
 const gas=await provider.estimateGas({...request,from:OWNER}),price=await provider.getFeeData()
 console.log('Deployment gas estimate:',String(gas),'estimated ETH:',ethers.formatEther(gas*(price.maxFeePerGas??price.gasPrice!)))
 console.log('Fixed settings: position #1909208; 100% fees reinvested; owner retains NFT; keeper may call fee-only functions')
 if(!execute)return
 const pass=(await run('security',['find-generic-password','-s','zeal-burner','-w'])).stdout.trimEnd()
 const unlocked=await ethers.Wallet.fromEncryptedJson(readFileSync('/Users/kyle/zeal-ops/.keys/deployer.json','utf8'),pass)
 const wallet=new ethers.Wallet(unlocked.privateKey,provider)
 if(wallet.address!==OWNER)throw new Error('Wrong owner signer')
 if(await provider.getBalance(OWNER)<ethers.parseEther('0.01')+gas*(price.maxFeePerGas??price.gasPrice!)*2n)throw new Error('Owner needs deployment gas')
 let config:any
 if(existsSync(CONFIG)){config=JSON.parse(readFileSync(CONFIG,'utf8'));console.log('Using recorded helper',config.address)}
 else{
  const tx=await managedSend(wallet,request);const receipt=await tx.wait()
  if(!receipt?.contractAddress)throw new Error('No deployed contract address; reconcile deployment transaction '+tx.hash)
  config={address:receipt.contractAddress,owner:OWNER,operator:BOT,tokenId:String(ID),poolId:POOL,positionManager:PM,stateView:SV,permit2:P2,deployTx:tx.hash,createdAt:new Date().toISOString()}
  atomicJson(CONFIG,config);console.log('Deployed',config.address,tx.hash)
 }
 const code=await provider.getCode(config.address)
 // Compare compiler output with on-chain code, ignoring only compiler-declared immutable slots.
 const dbg=JSON.parse(readFileSync(ART.replace('.json','.dbg.json'),'utf8'))
 const build=JSON.parse(readFileSync(new URL(dbg.buildInfo,'file://'+ART),'utf8'))
 const refs=build.output.contracts['contracts/ZealLpReinvest.sol'].ZealLpReinvest.evm.deployedBytecode.immutableReferences
 const masked=Buffer.from(code.slice(2),'hex')
 for(const locations of Object.values(refs) as any[])for(const loc of locations)masked.fill(0,loc.start,loc.start+loc.length)
 if('0x'+masked.toString('hex')!==artifact.deployedBytecode)throw new Error('Deployed helper does not match compiled source')
 const c=new ethers.Contract(config.address,artifact.abi,provider)
 const values=await Promise.all([c.beneficiary(),c.operator(),c.tokenId(),c.poolId(),c.positionManager(),c.stateView(),c.permit2(),c.REINVEST_BPS()])
 if(JSON.stringify(values.map(String))!==JSON.stringify([OWNER,BOT,String(ID),POOL,ethers.getAddress(PM),ethers.getAddress(SV),ethers.getAddress(P2),'10000']))throw new Error('Deployed immutable configuration mismatch')
 config.runtimeHash=ethers.keccak256(code);atomicJson(CONFIG,config)
 const old=new ethers.Contract(PREVIOUS,['function paused() view returns(bool)','function setPaused(bool)','function budget0() view returns(uint256)','function budget1() view returns(uint256)','function token() view returns(address)'],provider)
 if(!(await old.paused())){const tx=await managedSend(wallet,await old.setPaused.populateTransaction(true));config.previousPauseTx=tx.hash;atomicJson(CONFIG,config);console.log('Previous helper paused',tx.hash)}
 const oldToken=new ethers.Contract(await old.token(),['function balanceOf(address) view returns(uint256)'],provider)
 if((await old.budget0())!==0n || (await old.budget1())!==0n || (await provider.getBalance(PREVIOUS))!==0n || (await oldToken.balanceOf(PREVIOUS))!==0n)throw new Error('Previous helper holds funds; reconcile them before migration')
 const approved=await pm.getApproved(ID)
 if(approved!==ethers.ZeroAddress && approved.toLowerCase()!==config.address.toLowerCase() && approved.toLowerCase()!==PREVIOUS.toLowerCase())throw new Error('Another approval exists; inspect before replacing')
 if(approved.toLowerCase()!==config.address.toLowerCase()){
  const tx=await managedSend(wallet,await pm.approve.populateTransaction(config.address,ID));config.approvalTx=tx.hash;atomicJson(CONFIG,config);console.log('Specific NFT approval',tx.hash)
 }
 if((await pm.getApproved(ID)).toLowerCase()!==config.address.toLowerCase() || await pm.ownerOf(ID)!==OWNER)throw new Error('Final ownership/approval verification failed')
 const fees=await c.collect.staticCall({from:BOT})
 console.log('Verified fee-only collection preview:',ethers.formatEther(fees[0]),'ETH +',Number(fees[1])/1e8,'zZEC')
 console.log('Owner retains position; cloud automation may now be staged.')
}
withLock('burn',()=>withLock('lp-reinvest-setup',main)).catch(e=>{console.error(e?.shortMessage??e?.message??'LP setup failed');process.exitCode=1})
