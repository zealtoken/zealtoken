import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mintCapacity, reimbursementDue } from './redemption-accounting.js'

test('float payout plus burn never creates new mint capacity', () => {
  const reserve = 100_000_000n, initialSupply = 100_000_000n, payout = 20_000_000n
  assert.equal(mintCapacity(reserve, initialSupply, 0n, 0n), 0n)
  const due = reimbursementDue([{ amount: payout, status: 2, redemptionId: 1n }], 1n)
  assert.equal(mintCapacity(reserve, initialSupply - payout, due, 0n), 0n)
  assert.equal(mintCapacity(reserve + 5_000_000n, initialSupply - payout, due, 0n), 5_000_000n)
})
test('open and reclaimed escrow do not create an extra liability', () => {
  assert.equal(reimbursementDue([{ amount: 20n, status: 1, redemptionId: 0n }, { amount: 30n, status: 3, redemptionId: 0n }], 0n), 0n)
})
test('unknown direct burns and duplicate evidence stop issuance', () => {
  assert.throws(() => reimbursementDue([], 1n), /Unreconciled/)
  assert.throws(() => reimbursementDue([{ amount: 20n, status: 2, redemptionId: 1n }, { amount: 30n, status: 2, redemptionId: 1n }], 2n), /duplicate/)
})
test('pending payouts and undercoverage cannot create negative or excess capacity', () => {
  assert.equal(mintCapacity(110n, 90n, 10n, 5n), 5n)
  assert.equal(mintCapacity(80n, 90n, 10n, 5n), 0n)
  assert.throws(() => mintCapacity(100n, 90n, -1n, 0n), /Negative/)
})
