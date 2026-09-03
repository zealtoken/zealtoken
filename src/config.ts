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
 * public/video/foundry-line-*.mp4 shows "ZEC Reserve 60% / zZEC Liquidity 25% /
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
  /** $ZEAL on Robinhood Chain, launched via Pons. */
  address: '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC' as string | null,
  /** TODO: paste the multisig-held Zcash transparent address once funded. */
  reserveAddress: null as string | null,
}

/**
 * Deployed contract addresses on Robinhood Chain.
 * Filled in from contracts/deployments/rhMainnet.json after deploying.
 */
export const CONTRACTS = {
  /** Immutable fee splitter. No owner, no admin, no upgrade path. Live since 2026-09-03. */
  foundry: '0xa1C1Fb281cCC47C587565a01700bF61a03D885a6' as string | null,
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

/**
 * Pons V2 plumbing for $ZEAL. Creator fees are credited to the recipient
 * inside the escrow and only paid out on claim(); the Tap is the recipient
 * that can claim and forward into the Foundry.
 */
export const PONS_V2 = {
  factory: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
  escrow: '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e',
  curve: '0x3C9D54Ed43Fa8558BD468975243eA10effFBe1fc',
  /** ZealTapV2: sweeps its own pool, migrates itself. Until Pons points the recipient here, fees credit to the Foundry key. */
  tap: '0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47' as string | null,
  /** First edition, superseded before it was ever the recipient. Kept for the record. */
  tapV1: '0xA0dAE8fe24BDfb2331A1D581dC47bE61c565E655',
} as const

/** The burn. */
export const FURNACE = {
  burnAddress: '0x000000000000000000000000000000000000dEaD',
  burnShort: '0x000…dEaD',
  roleTimelockHours: 48,
} as const

export const LINKS = {
  /** Public mirror under an anonymous org; null until it exists. Never link a personal account. */
  repo: null as string | null,
  x: 'https://x.com/ZealTheMascot',
  telegram: 'https://t.me/ZcashMascot',
  pons: 'https://www.ponsfamily.com/0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC',
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

/** Where the name comes from: the Zcash Foundation's own mascot post at Zcon1. */
export const LORE = {
  tweetUrl: 'https://x.com/ZcashFoundation/status/1142379905809883136',
  author: 'Zcash Foundation',
  handle: '@ZcashFoundation',
  date: 'June 22, 2019',
  event: 'Zcon1',
  text: "The Foundation's mascot is a zeal, a group of zebras. In the future, when many people are running Zebra nodes, that will be a zeal!",
  credit: 'Pun courtesy of @kaplannie',
  image: '/img/lore-zcon1.jpg',
} as const

/** The five stations under each plate. Rendered by StationStrip so both plates read identically. */
export const STATIONS = {
  foundry: [
    { n: '01', t: 'Intake', s: 'every trade pays in' },
    { n: '02', t: 'Split', s: 'fixed allocation' },
    { n: '03', t: 'Smelt', s: 'fees become real ZEC' },
    { n: '04', t: 'Reserve', s: 'public, auditable' },
    { n: '05', t: 'Mint', s: '1:1, backed' },
  ],
  furnace: [
    { n: '01', t: 'Trade', s: 'the wrapper gets used' },
    { n: '02', t: 'Collect', s: 'fees in WETH + zZEC' },
    { n: '03', t: 'Ignite', s: 'swap → $ZEAL' },
    { n: '04', t: 'Burn', s: '→ 0x…dEaD' },
    { n: '05', t: 'Supply', s: 'less $ZEAL exists' },
  ],
} as const
