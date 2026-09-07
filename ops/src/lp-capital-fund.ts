import {ethers} from 'ethers'
import {readFileSync,existsSync} from 'node:fs'
import {roleSigner} from './chain.js'
import {managedSend} from './managed-send.js'
import {atomicJson,withLock,stateDir} from './ops-lock.js'
async function main(){
 if(process.platform!=='linux'||!existsSync('/etc/zeal/ACTIVE'))throw Error('Cloud-only funding')
 const q=JSON.parse(readFileSync(new URL('../cloud/lp-capital-plan.json',import.meta.url),'utf8'))
 const c=JSON.parse(readFileSync(new URL('../cloud/lp-reinvest.json',import.meta.url),'utf8'))
 if(q.owner!==c.owner||q.keeper!==c.operator||q.tokenId!==c.tokenId)throw Error('Funding destination mismatch')
 if(Date.now()-Date.parse(q.createdAt)>3600_000)throw Error('Funding plan expired')
 const w=await roleSigner('keeper'),p=w.provider!
 if(w.address.toLowerCase()!==q.keeper.toLowerCase())throw Error('Wrong keeper')
 const file=stateDir+q.id+'-funding.json'
 if(existsSync(file))throw Error('Funding previously attempted; reconcile before repeating')
 const z=new ethers.Contract('0x0b151Ff7a7c5250130EC16C275790961d558E402',['function transfer(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)'],p)
 const e=BigInt(q.funding0),b=BigInt(q.funding1)
 if(await p.getBalance(w.address)<ethers.parseEther('1.25')+e+ethers.parseEther('0.001')||await z.balanceOf(w.address)<120_000_000n+b)throw Error('Funding would breach keeper operating floors')
 const state:any={phase:'pending',owner:q.owner,eth:String(e),zzec:String(b),at:new Date().toISOString()};atomicJson(file,state)
 const ztx=await managedSend(w,await z.transfer.populateTransaction(q.owner,b));state.zzecTx=ztx.hash;atomicJson(file,state)
 const etx=await managedSend(w,{to:q.owner,value:e});state.ethTx=etx.hash;state.phase='complete';atomicJson(file,state)
 console.log(JSON.stringify(state))
 if(await p.getBalance(w.address)<ethers.parseEther('1.25')||await z.balanceOf(w.address)<120_000_000n)throw Error('Post-funding floor check failed')
}
withLock('keeper-tick',()=>withLock('lp-capital-funding',main)).catch(e=>{console.error(e?.shortMessage??e?.message);process.exitCode=1})
