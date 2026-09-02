/**
 * Single source of truth for every number, address and link on the site.
 * Change it here and it changes everywhere, including the derived math.
 */

export const CHAIN = {
  name: 'Robinhood Chain',
  id: 4663,
  settles: 'Ethereum',
  stack: 'Arbitrum Orbit',
} as const

/** Pons launchpad economics — fixed by the protocol, not by us. */
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

/** How the creator share is split once it reaches the Foundry contract. */
export const SPLIT = [
  {
    key: 'reserve',
    pct: 60,
    label: 'ZEC Reserve',
    note: 'Swapped to native ZEC and moved into the reserve address. Backs zZEC 1:1.',
  },
  {
    key: 'liquidity',
    pct: 25,
    label: 'zZEC Liquidity',
    note: 'Paired into the zZEC market on Robinhood Chain so the wrapper is actually tradeable.',
  },
  {
    key: 'ops',
    pct: 15,
    label: 'Operations',
    note: 'Audits, reserve attestation, bridge infrastructure, listings. Spending is published.',
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

export const LINKS = {
  x: 'https://x.com/ZealTheMascot',
  telegram: '#',
  pons: 'https://www.ponsfamily.com',
  zcash: 'https://z.cash',
  nearIntents: 'https://near-intents.org',
  robinhoodChain: 'https://blog.arbitrum.io/robinhood-chain-mainnet/',
}

export const RESERVE_PLACEHOLDER = {
  live: false,
  zecHeld: 0,
  zzecSupply: 0,
  coverage: 1,
}
