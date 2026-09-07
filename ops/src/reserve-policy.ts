export const FLOAT_ADDRESS = 't1cS6wHSvxJat1zuayeFYSU8QmzQYutvuUK'
export type ReserveCoin = { txid: string; index: number; value_zats: number; height: number }
export function planReimbursement(live: bigint, supply: bigint, due: bigint, coins: ReserveCoin[], paid24: bigint) {
  if ([live, supply, due, paid24].some(x => x < 0n)) throw new Error('Invalid reserve balances')
  const budget = 25_000_000n - paid24
  const amount = [due, 10_000_000n, budget].reduce((a, b) => a < b ? a : b)
  if (amount < 100_000n) return null
  const inputs: ReserveCoin[] = []
  let selected = 0n
  for (const coin of [...coins].sort((a,b) => a.value_zats - b.value_zats)) {
    if (!Number.isSafeInteger(coin.value_zats) || coin.value_zats <= 0 || !Number.isInteger(coin.index) || coin.index < 0 || !/^(0x)?[0-9a-f]{64}$/i.test(coin.txid)) throw new Error('Invalid reserve UTXO')
    inputs.push(coin); selected += BigInt(coin.value_zats)
    const fee = BigInt(Math.max(2, inputs.length)) * 5000n
    if (inputs.length > 10) return null
    if (selected < amount + fee + 1000n) continue
    // Reimbursement consumes an existing debt, while fees consume real excess.
    // Require additional 0.001 ZEC unencumbered margin after the fee.
    if (live < supply + due + fee + 100_000n) throw new Error('Reserve fee margin insufficient; do not spend holder backing for fees')
    return { amount, fee, inputs, change: selected - amount - fee }
  }
  return null
}
