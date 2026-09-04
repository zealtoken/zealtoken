/**
 * Everything the operator needs to know, in one place. Addresses are public
 * facts; secrets come from the environment and are never written here.
 */
// Load ops/.env when present so every script works from a plain `npm run`.
try { process.loadEnvFile(new URL('../.env', import.meta.url).pathname) } catch { /* no .env: rely on the environment */ }

export const CHAIN = {
  name: 'Robinhood Chain',
  id: 4663,
  rpc: process.env.RH_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
} as const

export const CONTRACTS = {
  foundry: '0xa1C1Fb281cCC47C587565a01700bF61a03D885a6',
  tap: '0xA0dAE8fe24BDfb2331A1D581dC47bE61c565E655',
  /** Filled in at Phase 02 deploy. */
  zzec: process.env.ZZEC_ADDRESS ?? '',
} as const

export const RESERVE = {
  /** Foundry's 60% sink on Robinhood Chain: where routed ETH lands. */
  sinkEvm: '0x6812378cd609A771a02d3aC03cF0DA0299a5eA58',
  /** The published Zcash transparent address holding native ZEC. */
  zcashTAddress: process.env.ZEC_RESERVE_ADDRESS ?? '',
  /** lightwalletd endpoint used for balance reads and sends. */
  lightwalletd: process.env.LIGHTWALLETD ?? 'https://zec.rocks:443',
} as const

/** Attestations older than this are rejected by mint(); keep well inside it. */
export const ATTEST_EVERY_SECONDS = 6 * 3600

export const ZATS_PER_ZEC = 100_000_000n

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}
