import type { TaddrUtxo } from './zcash-light.js'

export function requiredWrapConfirmations(raw = '3'): number {
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 3 || n > 100) throw new Error('Wrap confirmations must be an integer from 3 to 100')
  return n
}

/** Ambiguous, historical, unconfirmed and previously consumed evidence cannot authorize a mint. */
export function confirmedWrapOutput(
  deposit: bigint, requestedAt: number, tip: number, confirmations: number,
  outputs: TaddrUtxo[], blockTimes: Map<number, number>, usedTxids: Set<string>,
): TaddrUtxo | null {
  requiredWrapConfirmations(String(confirmations))
  if (deposit <= 0n || !Number.isSafeInteger(requestedAt) || requestedAt <= 0 || !Number.isSafeInteger(tip) || tip <= 0) return null
  const exact = outputs.filter(o => o.valueZat === deposit)
  if (exact.length !== 1) return null
  const o = exact[0], time = blockTimes.get(o.height)
  if (!/^0x[0-9a-f]{64}$/i.test(o.txid) || !Number.isSafeInteger(o.index) || o.index < 0 || usedTxids.has(o.txid.toLowerCase())) return null
  if (!Number.isSafeInteger(o.height) || o.height <= 0 || o.height > tip || tip - o.height + 1 < confirmations) return null
  if (!Number.isSafeInteger(time) || time! < requestedAt) return null
  return o
}
