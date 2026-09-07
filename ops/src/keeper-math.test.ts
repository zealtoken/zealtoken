import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { planTrade, quote, type Market } from './keeper-math.js'

const Q96 = 1n << 96n
const eth = (n: number) => BigInt(Math.round(n * 1e18))
const zec = (n: number) => BigInt(Math.round(n * 1e8))
const limits = { band: 0.01, target: 0.002, maxEth: eth(0.1) }
const market = (price: number, depth = 1): Market => {
  const sqrt = BigInt(Math.floor(Math.sqrt(1 / (price * 1e10)) * Number(Q96)))
  return { sqrt, liquidity: eth(depth) * sqrt / Q96, lpFee: 3000, hookBps: 70 }
}
const priceAfter = (sqrt: bigint) => (Number(Q96) / Number(sqrt)) ** 2 / 1e10

test('21x premium: gross ETH cap binds to one zatoshi, unlike old linear scaling', () => {
  const m = market(10, 1.8658)
  const p = planTrade(m, 0.476, zec(2), eth(2), limits)!
  assert.equal(p.side, 'sell')
  assert(quote(m, 'sell', p.amountIn).gross <= limits.maxEth)
  assert(quote(m, 'sell', p.amountIn + 1n).gross > limits.maxEth)
  assert(p.expectOut <= eth(0.0993) + 1n)
  // Independent continuous constant-product solution, rounded within 2 zats.
  const expected = (1.8658 / 10) * 0.1 / (1.8658 - 0.1) / 0.997
  assert(Math.abs(Number(p.amountIn) / 1e8 - expected) < 2e-8)
  const full = (Math.sqrt(1.8658 * (1.8658 / 10) / (0.476 * 1.002)) - 1.8658 / 10) / 0.99
  const oldOut = 1.8658 - 1.8658 * (1.8658 / 10) / (1.8658 / 10 + full * 0.99)
  const oldAmount = zec(full * 0.1 / oldOut)
  assert(quote(m, 'sell', oldAmount).gross > limits.maxEth)
})

test('LP fee changes pool price; hook fee is deducted only from output', () => {
  for (const side of ['sell', 'buy'] as const) {
    const m = market(1)
    const amount = side === 'sell' ? zec(0.1) : eth(0.1)
    const q = quote(m, side, amount)
    const noHook = quote({ ...m, hookBps: 0 }, side, amount)
    assert.equal(q.sqrtAfter, noHook.sqrtAfter)
    assert.equal(q.out, q.gross - q.gross * 70n / 10_000n)
    const feeFree = quote({ ...m, lpFee: 0, hookBps: 0 }, side, amount)
    assert(q.gross < feeFree.gross)
  }
})

test('uncapped sells stop at the target, without crossing parity', () => {
  const m = market(0.6)
  const p = planTrade(m, 0.48, zec(10), eth(1), { ...limits, maxEth: eth(10) })!
  const after = priceAfter(p.sqrtAfter)
  assert(after >= 0.48 * 1.002 - 1e-14)
  assert(after < 0.48 * 1.002 + 1e-7)
})

test('buy input is limited by cap, balance and target', () => {
  const m = market(0.2)
  const p = planTrade(m, 0.48, 0n, eth(1), limits)!
  assert.equal(p.side, 'buy')
  assert.equal(p.amountIn, limits.maxEth)
  const small = planTrade(m, 0.48, 0n, eth(0.025), limits)!
  assert.equal(small.amountIn, eth(0.025))
  const target = planTrade(m, 0.48, 0n, eth(10), { ...limits, maxEth: eth(10) })!
  assert(priceAfter(target.sqrtAfter) <= 0.48 * 0.998 + 1e-14)
  assert(priceAfter(target.sqrtAfter) > 0.48 * 0.998 - 1e-7)
})

test('empty inventory, no liquidity, in-band price and dust do not trade', () => {
  assert.equal(planTrade(market(2), 0.48, 0n, eth(1), limits), null)
  assert.equal(planTrade(market(0.2), 0.48, zec(1), 0n, limits), null)
  assert.equal(planTrade(market(0.48), 0.48, zec(1), eth(1), limits), null)
  assert.equal(planTrade({ ...market(2), liquidity: 0n }, 0.48, zec(1), eth(1), limits), null)
  assert.equal(planTrade(market(0.2), 0.48, 0n, 1n, limits), null)
  const p = planTrade(market(2), 0.48, zec(0.001), eth(1), limits)!
  assert.equal(p.amountIn, zec(0.001))
})

test('reject invalid configuration and trades whose net quote misses output floor', () => {
  assert.throws(() => planTrade(market(2), NaN, zec(1), eth(1), limits))
  assert.throws(() => planTrade(market(2), 0.48, zec(1), eth(1), { ...limits, target: 0.02 }))
  assert.throws(() => quote({ ...market(2), lpFee: 1_000_000 }, 'sell', zec(1)))
  assert.equal(planTrade({ ...market(0.49), hookBps: 2000 }, 0.48, zec(1), eth(1), limits), null)
})

test('cap and target invariants over premiums, discounts and pool depths', () => {
  for (const multiple of [0.1, 0.5, 0.98, 1.02, 2, 10, 21, 100]) {
    for (const depth of [0.01, 0.1, 1, 10, 100]) {
      const m = market(0.48 * multiple, depth)
      const p = planTrade(m, 0.48, zec(100), eth(100), limits)
      if (!p) continue
      const q = quote(m, p.side, p.amountIn)
      assert(q.out >= p.minOut)
      assert(p.side === 'sell' ? q.gross <= limits.maxEth : p.amountIn <= limits.maxEth)
      assert(p.side === 'sell' ? priceAfter(q.sqrtAfter) >= 0.48 : priceAfter(q.sqrtAfter) <= 0.48)
    }
  }
})
