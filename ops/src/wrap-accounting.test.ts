import { test } from 'node:test'
import assert from 'node:assert/strict'
import { depositHolds, type WrapRequest } from './wrap-accounting.js'
const txid='0x'+'ab'.repeat(32), other='0x'+'cd'.repeat(32)
const request:WrapRequest={id:0,status:1,deposit:100001n,txid:'0x'+'00'.repeat(32)}
const output={txid,index:0,valueZat:100001n,height:100}
test('unfunded requests do not consume reserve capacity',()=>assert.deepEqual(depositHolds([request],[],[]),[]))
test('open, cancelled, rejected and unconfirmed payments stay protected',()=>{
 for(const status of [1,3,4]) for(const height of [0,100]) assert.equal(depositHolds([{...request,status}],[{...output,height}],[])[0].value,'100001')
})
test('duplicate exact payments are both protected',()=>assert.equal(depositHolds([request],[output,{...output,txid:other}],[]).length,2))
test('fulfilment releases only its actual payment; duplicate stays reserved',()=>{
 const holds=depositHolds([request],[output,{...output,txid:other}],[])
 const remaining=depositHolds([{...request,status:2,txid}],[output,{...output,txid:other}],holds)
 assert.equal(remaining.length,1);assert.equal(remaining[0].outpoint,other+':0')
})
test('spent unresolved deposits fail closed instead of becoming spare capacity',()=>{
 const holds=depositHolds([request],[output],[])
 assert.throws(()=>depositHolds([request],[],holds),/disappeared/)
 assert.deepEqual(depositHolds([{...request,status:2,txid}],[],holds),[])
})

test('keeper cannot mint a customer deposit; that deposit can fund only its own wrap',async()=>{
 const {mintCapacity}=await import('./redemption-accounting.js')
 const holds=depositHolds([request],[output],[])
 const reserved=holds.reduce((n,h)=>n+BigInt(h.value),0n)
 const supply=1000000n, live=supply+output.valueZat
 assert.equal(mintCapacity(live,supply,0n,reserved),0n)
 assert.equal(mintCapacity(live,supply,0n,reserved-100000n),100000n)
 assert.equal(mintCapacity(live,supply,50000n,reserved-100000n),50000n)
})
test('reimbursement fees cannot use pending customer backing',async()=>{
 const {planReimbursement}=await import('./reserve-policy.js')
 const coin={txid:other.slice(2),index:0,value_zats:2000000,height:100}
 // Bare supply passes, but encumbered supply exposes the missing fee margin.
 assert.ok(planReimbursement(2200000n,1000000n,1000000n,[coin],0n))
 assert.throws(()=>planReimbursement(2200000n,1100001n,1000000n,[coin],0n),/margin/)
})

test('known consolidation output cannot be mistaken for a legacy amount-tag payment',()=>{
 const txid='0x'+'cd'.repeat(32)
 const requests=[{id:0,status:1,deposit:100001n,txid:'0x'+'00'.repeat(32)}]
 const outputs=[{txid,index:0,valueZat:100001n,height:100}]
 assert.equal(depositHolds(requests,outputs,[]).length,1)
 assert.deepEqual(depositHolds(requests,outputs,[],new Set([`${txid}:0`])),[])
})
