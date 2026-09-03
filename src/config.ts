/**
 * Single source of truth for every number, address and link on the site.
 * Change it here and it changes everywhere, including the derived math.
 */

export const CHAIN = {
  name: 'Robinhood Chain',
  id: 4663,
  settles: 'Ethereum',
  /**
   * Public endpoint. Robinhood's docs call it rate-limited and not for
   * production workloads; the ledger makes one batched call every 30 seconds
   * per open tab, which is well inside that. Swap for a dedicated endpoint if
   * traffic ever makes it a problem.
   */
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
} as const

/** Pons launchpad economics. Fixed by the protocol, not by us. */
export const PONS = {
  poolFeePct: 1.0, // 1% fee on every trade
  creatorSharePct: 70, // creator keeps 70% of that fee
  launchpad: 'pons.family',
  launchpadUrl: 'https://www.ponsfamily.com',
  docsUrl: 'https://docs.ponsfamily.com',
  lockerContract: '0x736D76699C26D0d966744cAe304C000d471f7F35',
  factoryContract: '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB',
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
} as const

/**
 * How the creator share is split once it reaches the Foundry contract.
 *
 * WARNING: these three numbers are ALSO baked into the artwork.
 * public/video/line-*.mp4 shows "ZEC Reserve 60% / zZEC Liquidity 25% /
 * Operations 15%" as engraved text, and they are constructor arguments to
 * ZealFoundry, which is immutable once deployed. Changing them here silently
 * puts the site, the plate and the contract out of sync. Re-render the video
 * and redeploy the contract, or don't change them.
 */
export const SPLIT = [
  {
    key: 'reserve',
    pct: 60,
    label: 'ZEC Reserve',
    note: 'Becomes native ZEC in the reserve.',
  },
  {
    key: 'liquidity',
    pct: 25,
    label: 'zZEC Liquidity',
    note: 'Seeds the zZEC market. Its fees feed the Furnace.',
  },
  {
    key: 'ops',
    pct: 15,
    label: 'Operations',
    note: 'Audits, attestation, infrastructure. Published.',
  },
] as const

/** Of every $1 traded, this much ends up as ZEC in the vault. */
export const RESERVE_TAKE_PCT =
  (PONS.poolFeePct * PONS.creatorSharePct * SPLIT[0].pct) / 10_000

/** Of every $1 traded, this much reaches the Foundry at all. */
export const FOUNDRY_TAKE_PCT = (PONS.poolFeePct * PONS.creatorSharePct) / 100

export const TOKEN = {
  symbol: 'ZEAL',
  wrapper: 'zZEC',
  /** TODO: paste the real address once the Pons launch is live. */
  address: null as string | null,
  /** TODO: paste the multisig-held Zcash transparent address once funded. */
  reserveAddress: null as string | null,
}

/**
 * Deployed contract addresses on Robinhood Chain.
 * Filled in from contracts/deployments/rhMainnet.json after deploying.
 */
export const CONTRACTS = {
  /** Immutable fee splitter. No owner, no admin, no upgrade path. */
  foundry: null as string | null,
  /** The wrapper. Supply is capped by the attested reserve. */
  zzec: null as string | null,
  /** zZEC fees in, burned $ZEAL out. No other exit. */
  furnace: null as string | null,
  explorer: 'https://robinhoodchain.blockscout.com',
}

/**
 * Assumptions for the Furnace calculator. Modelled on the Pons pool structure
 * $ZEAL itself uses, on the basis that zZEC launches the same way and its
 * creator fees are redirected to the Furnace. Both are editable on the page.
 */
export const ZZEC_MARKET = {
  poolFeePct: 1.0,
  furnaceSharePct: 70,
} as const

/** The burn. */
export const FURNACE = {
  burnAddress: '0x000000000000000000000000000000000000dEaD',
  burnShort: '0x000…dEaD',
  roleTimelockHours: 48,
} as const

export const LINKS = {
  x: 'https://x.com/ZealTheMascot',
  telegram: '#',
  pons: 'https://www.ponsfamily.com',
  zcash: 'https://z.cash',
  nearIntents: 'https://near-intents.org',
  robinhoodChain: 'https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet/',
}

export const RESERVE_PLACEHOLDER = {
  live: false,
  zecHeld: 0,
  zzecSupply: 0,
  coverage: 1,
}
