export type RefillPolicy = { low: number; target: number; maxEth: number; dailyEth: number; keepEth: number; cooldownMs: number }
export const defaultPolicy: RefillPolicy = { low: 0.35, target: 1.2, maxEth: 0.5, dailyEth: 1, keepEth: 1, cooldownMs: 15 * 60_000 }
export function refillAmount(inventory: number, eth: number, fair: number, pool: number, spent24h: number, lastStarted: number, now: number, policy = defaultPolicy) {
  if (![inventory, eth, fair, pool, spent24h, lastStarted, now].every(Number.isFinite) || inventory < 0 || eth < 0 || fair <= 0 || pool <= 0 || spent24h < 0) throw new Error('invalid refill inputs')
  if (inventory >= policy.low || pool < fair * 0.99 || now - lastStarted < policy.cooldownMs) return 0
  const amount = Math.min((policy.target - inventory) * fair / 0.97, policy.maxEth, policy.dailyEth - spent24h, eth - policy.keepEth - 0.005)
  // Avoid tiny bridge transactions; never round above a budget.
  return amount >= 0.025 ? Math.floor(amount * 1e6) / 1e6 : 0
}

export function assertMintBudget(amount: bigint, alreadyMinted24h: bigint) {
  if (amount <= 0n || amount > 150_000_000n || alreadyMinted24h + amount > 300_000_000n) throw new Error('refill mint budget exceeded (1.5 zZEC per job, 3 zZEC per 24 hours)')
}
export function assertResumable(phase: string) {
  if (['converting', 'attesting', 'minting', 'attention'].includes(phase)) throw new Error(`interrupted or uncertain ${phase}; reconciliation required`)
}
