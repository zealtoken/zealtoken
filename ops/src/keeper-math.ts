/** Single-liquidity-range v4 exact-input sizing. ETH is currency0, zZEC currency1.
 * The ETH cap bounds quoted gross pool output on sells (before the hook),
 * and input on buys. It is not an on-chain ceiling on proceeds after price moves.
 */
const Q96 = 1n << 96n
const PIPS = 1_000_000n
const MAX_INPUT = (1n << 128n) - 1n
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b
const min = (a: bigint, b: bigint) => a < b ? a : b

export type Market = { sqrt: bigint; liquidity: bigint; lpFee: number; hookBps: number }
export type Plan = { side: 'sell' | 'buy'; amountIn: bigint; minOut: bigint; expectOut: bigint; sqrtAfter: bigint }
export type Limits = { band: number; target: number; maxEth: bigint }

export function quote(m: Market, side: 'sell' | 'buy', amount: bigint) {
  if (m.sqrt <= 0n || m.liquidity <= 0n || amount < 0n ||
      !Number.isInteger(m.lpFee) || m.lpFee < 0 || m.lpFee >= 1_000_000 ||
      !Number.isInteger(m.hookBps) || m.hookBps < 0 || m.hookBps > 10_000) throw new Error('invalid keeper quote inputs')
  const net = amount * (PIPS - BigInt(m.lpFee)) / PIPS
  const n = m.liquidity * Q96
  const sqrtAfter = side === 'sell'
    ? m.sqrt + net * Q96 / m.liquidity
    : ceilDiv(n * m.sqrt, n + net * m.sqrt)
  const gross = side === 'sell'
    ? n * (sqrtAfter - m.sqrt) / sqrtAfter / m.sqrt
    : m.liquidity * (m.sqrt - sqrtAfter) / Q96
  const out = gross - gross * BigInt(m.hookBps) / 10_000n
  return { sqrtAfter, gross, out }
}

export function planTrade(m: Market, fair: number, zzecInv: bigint, ethInv: bigint, limits: Limits): Plan | null {
  if (!Number.isFinite(fair) || fair <= 0 || !Number.isFinite(limits.band) ||
      !Number.isFinite(limits.target) || limits.target < 0 || limits.target >= limits.band ||
      limits.band >= 1 || limits.maxEth <= 0n || zzecInv < 0n || ethInv < 0n) throw new Error('invalid keeper sizing inputs')
  if (m.sqrt <= 0n || m.liquidity <= 0n) return null
  const pool = (Number(Q96) / Number(m.sqrt)) ** 2 / 1e10
  if (Math.abs(pool / fair - 1) <= limits.band) return null
  const side = pool > fair ? 'sell' : 'buy'
  const targetPrice = fair * (side === 'sell' ? 1 + limits.target : 1 - limits.target)
  const targetSqrt = BigInt(Math.floor(Math.sqrt(1 / (targetPrice * 1e10)) * Number(Q96)))
  let lo = 0n, hi = min(MAX_INPUT, side === 'sell' ? zzecInv : min(ethInv, limits.maxEth))
  // Integer search respects the nonlinear curve, fee rounding, inventory and
  // target simultaneously. Rounding down leaves at most one input unit unused.
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n
    const q = quote(m, side, mid)
    const fits = side === 'sell'
      ? q.gross <= limits.maxEth && q.sqrtAfter <= targetSqrt
      : q.sqrtAfter >= targetSqrt
    if (fits) lo = mid
    else hi = mid - 1n
  }
  if (lo === 0n) return null
  const q = quote(m, side, lo)
  // Preserve the existing fair-value floor with its 1% tolerance. This bounds
  // average execution value, not the final pool price after concurrent trades.
  const minOut = BigInt(Math.floor(side === 'sell'
    ? Number(lo) / 1e8 * fair * 0.99 * 1e18
    : Number(lo) / 1e18 / fair * 0.99 * 1e8))
  if (q.out === 0n || minOut === 0n || q.out < minOut) return null
  return { side, amountIn: lo, minOut, expectOut: q.out, sqrtAfter: q.sqrtAfter }
}
