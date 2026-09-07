import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmedWrapOutput, requiredWrapConfirmations } from './wrap-policy.js'
const txid = '0x' + 'a'.repeat(64)
const output = { txid, index: 0, valueZat: 100001n, height: 100 }
const times = new Map([[100, 2000]])
const match = (outputs = [output], time = times, used = new Set<string>(), tip = 102) => confirmedWrapOutput(100001n, 1900, tip, 3, outputs, time, used)
test('wrap accepts one exact post-request output only after three confirmations', () => {
  assert.deepEqual(match(), output)
  assert.equal(match([output], times, new Set(), 101), null)
  assert.equal(match([{ ...output, valueZat: 100000n }]), null)
})
test('wrap rejects ambiguous outputs, old payments and consumed transaction evidence', () => {
  assert.equal(match([output, {...output, index: 1}]), null)
  assert.equal(match([output], new Map([[100, 1899]])), null)
  assert.equal(match([output], times, new Set([txid])), null)
})
test('wrap rejects unconfirmed, future, missing-time and malformed evidence', () => {
  assert.equal(match([{...output,height:0}]), null)
  assert.equal(match([{...output,height:103}]), null)
  assert.equal(match([output],new Map()), null)
  assert.equal(match([{...output,txid:'0x123'}]), null)
})
test('confirmation configuration cannot disable maturity checks', () => {
  for (const raw of ['0','1','2','NaN','Infinity','3.5','101']) assert.throws(()=>requiredWrapConfirmations(raw))
  assert.equal(requiredWrapConfirmations(),3)
})
