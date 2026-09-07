import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planReimbursement } from './reserve-policy.js'
const coin={txid:'12'.repeat(32),index:0,value_zats:100000000,height:1}
test('pays only burned-token reimbursement debt and preserves remaining backing',()=>{
 const p=planReimbursement(100000000n,79000000n,20000000n,[coin],0n)!
 assert.equal(p.amount,10000000n); assert.equal(p.fee,10000n)
 assert.ok(100000000n-p.amount-p.fee>=79000000n+20000000n-p.amount)
})
test('does not take an advance against still-outstanding tokens',()=>assert.equal(planReimbursement(100000000n,99000000n,0n,[coin],0n),null))
test('fee shortfall blocks transfer even when principal can be reimbursed',()=>assert.throws(()=>planReimbursement(100000000n,80000000n,20000000n,[coin],0n),/fee margin/))
test('rolling daily cap and insufficient coins block transfer',()=>{
 assert.equal(planReimbursement(100000000n,70000000n,20000000n,[coin],25000000n),null)
 assert.equal(planReimbursement(100000000n,70000000n,20000000n,[],0n),null)
})
