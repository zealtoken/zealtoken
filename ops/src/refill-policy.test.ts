import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { refillAmount, assertMintBudget, assertResumable } from './refill-policy.js'
const now = 1_000_000_000
const calc = (inventory = 0.2, eth = 2, fair = 0.5, pool = 0.55, spent = 0, last = 0) => refillAmount(inventory, eth, fair, pool, spent, last, now)
test('refill triggers before empty, but not at healthy inventory or below parity', () => {
  assert(calc() > 0)
  assert.equal(calc(0.35), 0)
  assert.equal(calc(0.2, 2, 0.5, 0.49), 0)
})
test('per-job, daily budget, retained ETH and cooldown all bind', () => {
  assert.equal(calc(0), 0.5)
  assert.equal(calc(0, 2, 0.5, 0.55, 0.9), 0.099999)
  assert.equal(calc(0, 1.1), 0.095)
  assert.equal(calc(0, 1), 0)
  assert.equal(calc(0, 2, 0.5, 0.55, 1), 0)
  assert.equal(calc(0, 2, 0.5, 0.55, 0, now - 1000), 0)
})
test('mint limits bound actual issuance and reject reused uncertain stages', () => {
  assertMintBudget(100_000_000n, 150_000_000n)
  assert.throws(() => assertMintBudget(150_000_001n, 0n))
  assert.throws(() => assertMintBudget(100_000_000n, 250_000_000n))
  assert.throws(() => assertMintBudget(0n, 0n))
  for (const phase of ['converting', 'attesting', 'minting', 'attention']) assert.throws(() => assertResumable(phase))
  assertResumable('confirming')
})
test('invalid feeds fail closed and tiny conversions are skipped', () => {
  assert.throws(() => calc(0, 2, NaN))
  assert.throws(() => calc(-1))
  assert.equal(calc(0, 1.02), 0)
})
