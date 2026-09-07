import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ethers} from 'ethers'
test('domain record is committed before broadcast, including when broadcast response is lost',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zeal-send-'));process.env.OPS_STATE_DIR=dir
 const {managedSend}=await import('./managed-send.js')
 const order:string[]=[]
 const provider={getNetwork:async()=>({chainId:4663n}),getTransactionCount:async()=>0,getTransactionReceipt:async()=>null,broadcastTransaction:async()=>{order.push('broadcast');throw Error('response lost')}}
 const wallet={provider,address:'0x'+'12'.repeat(20),populateTransaction:async(x:unknown)=>x,signTransaction:async()=>'0x1234'} as unknown as ethers.Wallet
 let recorded=''
 await assert.rejects(()=>managedSend(wallet,{},hash=>{recorded=hash;order.push('record')}),/response lost/)
 assert.deepEqual(order,['record','broadcast'])
 assert.equal(JSON.parse(readFileSync(join(dir,`wallet-4663-${wallet.address}-pending.json`),'utf8')).hash,recorded)
 await assert.rejects(()=>managedSend(wallet,{}),/unresolved transaction/)
 assert.deepEqual(order,['record','broadcast'])
 // Separate wallet: failed domain persistence must not submit anything.
 const other={...wallet,address:'0x'+'34'.repeat(20)} as unknown as ethers.Wallet
 await assert.rejects(()=>managedSend(other,{},()=>{throw Error('journal disk failure')}),/journal disk failure/)
 assert.deepEqual(order,['record','broadcast'])
 rmSync(dir,{recursive:true,force:true})
})
