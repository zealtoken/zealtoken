import { useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, PONS, PONS_V2, RESERVE_TAKE_PCT, SPLIT, TOKEN } from '../config'

// One $100 trade, walked to the cent. Everything derives from config.
const FEE_PER_100 = PONS.poolFeePct
const FOUNDRY_PER_100 = (FEE_PER_100 * PONS.creatorSharePct) / 100
const PONS_KEEP_PER_100 = FEE_PER_100 - FOUNDRY_PER_100
const SPLIT_PER_100 = SPLIT.map((x) => (FOUNDRY_PER_100 * x.pct) / 100)
const SPLIT_TAKE_PCT = SPLIT.map((x) => (PONS.poolFeePct * PONS.creatorSharePct * x.pct) / 10_000)
const PONS_TAKE_PCT = (PONS.poolFeePct * (100 - PONS.creatorSharePct)) / 100
// two decimals minimum, a third only when the number needs it ($0.175, 0.105%)
const trim = (n: number) => (Math.round(n * 1000) % 10 === 0 ? n.toFixed(2) : n.toFixed(3))
const money = (n: number) => `$${trim(n)}`
const pct = (n: number) => `${trim(n)}%`
import { stagger } from '../useReveal'
import { ContractAddress } from './ContractAddress'

const PHASES = [
  {
    p: 'Phase 00',
    t: 'Launch',
    s: 'live',
    d: `$${TOKEN.symbol} launched on ${PONS.launchpad} on Sep 3 and graduated in under an hour. The Foundry and the Tap are deployed with verified source. Fee routing to the Tap waits on Pons proposing the recipient change, then a 3-day timelock.`,
  },
  {
    p: 'Phase 01',
    t: 'Reserve opens',
    s: 'live',
    d: 'First ZEC lands at the published reserve address. The live tile and the attestation agree on a non-zero number for the first time, and the first mint follows.',
  },
  {
    p: 'Phase 02',
    t: `${TOKEN.wrapper} mints`,
    s: 'live',
    d: `${TOKEN.wrapper} and the Furnace deploy together. Liquidity is seeded and its fees pointed at the Furnace, so the first ${TOKEN.wrapper} trade is the first $${TOKEN.symbol} burn.`,
  },
  {
    p: 'Phase 03',
    t: 'Redemption',
    s: 'live',
    d: `Burn ${TOKEN.wrapper}, receive native ZEC. Escrow first, paid from the reserve, Zcash transaction recorded on chain, or reclaim your ${TOKEN.wrapper} yourself after 7 days.`,
  },
  {
    p: 'Phase 04',
    t: 'Hand off custody',
    s: 'the goal',
    d: 'Backing moves from operator custody to red·bridge or an equivalent trust-minimized design. The endgame is a reserve we cannot touch either.',
  },
]

const src = (addr: string) => `${CONTRACTS.explorer}/address/${addr}?tab=contract`

/** Dated, linkable, and only things that already happened. */
const LOG: { d: string; t: string; href?: string; label?: string }[] = [
  { d: 'Sep 03', t: `$${TOKEN.symbol} live on ${PONS.launchpad}. Graduated in under an hour.`, href: LINKS.pons, label: 'Pons' },
  { d: 'Sep 03', t: 'ZealFoundry deployed. 60/25/15 split, no owner, no admin. Source verified.', href: CONTRACTS.foundry ? src(CONTRACTS.foundry) : undefined, label: 'source' },
  { d: 'Sep 03', t: 'ZealTap deployed and verified. Pons V2 pays only a caller, so the Tap claims and hands everything to the Foundry.', href: src(PONS_V2.tapV1), label: 'source' },
  { d: 'Sep 03', t: 'ZealTapV2 deployed and verified. It can sweep its own pool and migrate itself, so fee routing never depends on anyone else again. Still one exit: the Foundry.', href: PONS_V2.tap ? src(PONS_V2.tap) : undefined, label: 'source' },
  { d: 'Sep 03', t: `${TOKEN.wrapper} contract written and tested, CI on every push.`, href: LINKS.repo ? `${LINKS.repo}/blob/main/contracts/contracts/ZZEC.sol` : undefined, label: 'ZZEC.sol' },
  { d: 'Sep 03', t: 'Reserve operator built: attest, mint, redemption watcher, ETH → ZEC sweep over Relay and NEAR Intents.', href: LINKS.repo ? `${LINKS.repo}/tree/main/ops` : undefined, label: 'ops/' },
  { d: 'Sep 03', t: 'Everything public: contracts, tests, operator, site.', href: LINKS.repo ?? undefined, label: 'github' },
  { d: 'Sep 03', t: 'Reserve address published. A transparent Zcash address anyone can watch, balance zero until the first conversion lands.', href: TOKEN.reserveAddress ? LINKS.zcashExplorer + TOKEN.reserveAddress : undefined, label: 'zcash' },
  { d: 'Sep 03', t: `${TOKEN.wrapper} deployed and verified. Supply zero. It cannot mint until the reserve is attested, and it can never stop redemptions.`, href: CONTRACTS.zzec ? src(CONTRACTS.zzec) : undefined, label: 'source' },
  { d: 'Sep 04', t: 'Live ZEC balance on the ledger, read from a Zcash node next to the attested number. Check either against the explorer.' },
  { d: 'Sep 04', t: 'The Furnace rebuilt for Uniswap v4: zZEC fees → ETH → $ZEAL → burn, LP fees collectable by anyone, liquidity itself untouchable. 9 new tests, 83 total.', href: LINKS.repo ? `${LINKS.repo}/blob/main/contracts/contracts/ZealFurnaceV4.sol` : undefined, label: 'source' },
  { d: 'Sep 04', t: 'First attestation posted by the attestor key, on a 6-hour schedule from here. Reserve 0, supply 0, coverage honest.', href: `${CONTRACTS.explorer}/tx/0x563e3ee4ac540c447ed0e8b61fc8e037233737f30508923058fcd92950b79786`, label: 'tx' },
  { d: 'Sep 04', t: 'Adversarial review pass over every contract, the operator, and the site. One real hole in the unreleased Furnace, plus operator and copy fixes. All closed. 84 tests.' },
  { d: 'Sep 04', t: 'First ZEC in the reserve, bought with ETH over NEAR Intents and attested on-chain a minute later. Both tiles agree.', href: `${CONTRACTS.explorer}/tx/0x8e2708905bf4b41809462165660b96bda0634d95f46683cea20373b93a6f1380`, label: 'tx' },
  { d: 'Sep 04', t: 'First mint: 0.11833344 zZEC against 0.11833344 ZEC. Coverage exactly 1.00.', href: `${CONTRACTS.explorer}/tx/0x5c6c2f230b8990e2501d44196955cd16f7f1cb5917a896d12aca995864b6b530`, label: 'tx' },
  { d: 'Sep 04', t: 'The zZEC/ETH market opens on Uniswap v4, initialized and seeded in one transaction. The first wrapped Zcash on Robinhood Chain is tradable.', href: `${CONTRACTS.explorer}/tx/0xa1251a34de6b4182ff9c04eabad724f520c7d28af925d1de38f64e97f29bf5de`, label: 'tx' },
  { d: 'Sep 04', t: 'The Furnace deploys, verified, with an instant pause, owner-set hook data, and timelocked pool rotation added from an outside reader\u2019s review the same day. Loop two is on chain.', href: CONTRACTS.furnace ? src(CONTRACTS.furnace) : undefined, label: 'source' },
  { d: 'Sep 04', t: 'First burn. zZEC trading fees collected, swapped to $ZEAL through the Furnace, and sent to the burn address. 571.8 $ZEAL gone. Loop two turns.', href: `${CONTRACTS.explorer}/tx/0x51a42aec6c299e78a187c3f8e62266b7a9872718dfd04e87b2160b16f1dd17a2`, label: 'tx' },
  { d: 'Sep 04', t: 'Reserve grows to 0.4263 ZEC, attested and minted the same evening. Second liquidity position: pool depth 3.6x, coverage still exactly 1.00.', href: `${CONTRACTS.explorer}/tx/0x5c13174ff89dc85e038cbb4f2ef195694753ba9ed871d4e995f8fe930b42524c`, label: 'tx' },
  { d: 'Sep 05', t: 'Peg keeper live. A dedicated wallet with zZEC and ETH inventory checks the pool every minute and trades it back to the ZEC price outside a 1.5% band. First automated trade: a 5.7% premium closed to 0.6%.', href: `${CONTRACTS.explorer}/tx/0xe2002317546ad5bd6fdb4d090b1caf26e8c0c55c4b5f0b9f9bfbbc4f8a8c11d6`, label: 'tx' },
  { d: 'Sep 05', t: 'The burn hook. A Uniswap v4 hook on the zZEC market takes 0.7% of every swap and hands it to the Furnace, whoever provides the liquidity. Proven on a fork of the live chain, then deployed.', href: `${CONTRACTS.explorer}/address/0x16642362837e2FDC02fF1ECF71f5629c094B0044`, label: 'hook' },
  { d: 'Sep 05', t: 'The zZEC market moves to the hooked pool: 0.3% to liquidity providers, 0.7% to the burn. Same 1% for traders, every trade now burns $ZEAL.', href: `${CONTRACTS.explorer}/tx/0x135a097770c63e6cf7b9d1a680e93d5ae13bbebcadca902e869548c2eb5eb538`, label: 'tx' },
  { d: 'Sep 05', t: 'Redemption desk deployed. Escrow zZEC with a transparent Zcash address; the operator pays native ZEC and records the Zcash transaction on chain before anything burns. Unpaid after 7 days, you reclaim it yourself. Nobody can stop that.', href: CONTRACTS.desk ? `${CONTRACTS.explorer}/address/${CONTRACTS.desk}` : undefined, label: 'desk' },
  { d: 'Sep 05', t: 'Redeem form on this page. Connect a wallet, approve, request, watch your own queue. Phase 03 is open.', href: '#redeem', label: 'redeem' },
  { d: 'next', t: 'Pons routes $ZEAL fees to the Tap, and loop one turns too.' },
]

const FAQ = [
  {
    q: `Where does the money to buy ZEC come from, and where does the rest go?`,
    a: `From $${TOKEN.symbol} trading fees, and every cent is accounted for. Take a $100 trade. Pons charges a ${money(FEE_PER_100)} pool fee. Pons keeps ${money(PONS_KEEP_PER_100)} of that for running the launchpad. The other ${money(FOUNDRY_PER_100)} goes to the Foundry, which splits it three ways: ${money(SPLIT_PER_100[0])} buys Zcash for the reserve, ${money(SPLIT_PER_100[1])} seeds ${TOKEN.wrapper} liquidity (whose fees feed the Furnace), and ${money(SPLIT_PER_100[2])} covers audits, attestation and infrastructure. So of every dollar traded: ${pct(RESERVE_TAKE_PCT)} becomes Zcash, ${pct(SPLIT_TAKE_PCT[1])} becomes ${TOKEN.wrapper} liquidity, ${pct(SPLIT_TAKE_PCT[2])} runs the operation, and ${pct(PONS_TAKE_PCT)} is Pons’s fee. Nothing goes to a founder wallet.`,
  },
  {
    q: `Is this a tax token?`,
    a: `No. The ${PONS.poolFeePct.toFixed(2)}% is the standard Pons pool fee every token on the launchpad pays. The difference is where the creator share goes: a contract that splits it to three published wallets, and the largest share buys Zcash.`,
  },
  {
    q: `Why not build a real bridge?`,
    a: `Zcash is not an EVM chain. A real bridge means verifying Zcash headers and shielded-pool proofs inside an EVM contract, a multi-year cryptography project that red·bridge (Zcash Community Grants and the Avalanche Foundation) is building now. The ZEC networks that exist today, NEAR Intents, Maya, THORChain, are swap vaults, not bridges. So the options were a reserve with public attestation, or nothing. We built the reserve, and Phase 04 adopts the bridge the day it ships. By then the reserve is already full.`,
  },
  {
    q: `Does holding $${TOKEN.symbol} give me a claim on the ZEC?`,
    a: `No. $${TOKEN.symbol} funds the reserve; ${TOKEN.wrapper} is the exposure. What $${TOKEN.symbol} holders get is a supply that shrinks every time the wrapper is used.`,
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <ul className="faq">
      {FAQ.map((f, i) => (
        <li key={f.q} data-open={open === i} data-reveal style={stagger(i, 60)}>
          <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span>{f.q}</span>
            <i aria-hidden="true" />
          </button>
          <div className="faq-a">
            <p>{f.a}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Close() {
  return (
    <>
      {/* ---------------- roadmap ---------------- */}
      <section className="band band-tint" id="phases">
        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              Roadmap
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              Five phases.
              <br />
              Each one checkable.
            </h2>
          </div>
          <div className="phases">
            {PHASES.map((p, i) => (
              <article className="phase" key={p.p} data-reveal="left" style={stagger(i, 90)}>
                <div className="phase-rail">
                  <span className="phase-dot" />
                </div>
                <div className="phase-body">
                  <div className="phase-head">
                    <span className="mono">{p.p}</span>
                    <span className={`tag ${p.s === 'live' ? 'tag-live' : 'tag-wait'}`}>
                      <span className="dot" />
                      {p.s}
                    </span>
                  </div>
                  <h3 className="h3">{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="log" data-reveal>
            <div className="log-head">
              <p className="eyebrow">Build log</p>
              <p className="log-note mono">dated · linked · nothing here is a promise</p>
            </div>
            {LOG.map((l, i) => (
              <div className={`log-row ${l.d === 'next' ? 'log-next' : ''}`} key={i} data-reveal style={stagger(i, 60)}>
                <span className="log-date mono">{l.d}</span>
                <span className="log-text">{l.t}</span>
                {l.href ? (
                  <a className="log-link mono" href={l.href} target="_blank" rel="noreferrer">
                    {l.label} ↗
                  </a>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- faq ---------------- */}
      <section className="band" id="faq">
        <div className="wrap split faq-split">
          <div>
            <p className="eyebrow" data-reveal>
              Questions
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              Ask the
              <br />
              hard ones.
            </h2>
          </div>
          <Faq />
        </div>
      </section>

      {/* ---------------- cta ---------------- */}
      <section className="band band-ink band-cta">
        <div className="wrap-narrow cta-in">
          <img className="cta-mark" src="/img/zeal-mark.png" alt="" width={96} height={96} />
          <h2 className="display" data-reveal>
            Put Zcash
            <br />
            on the chain.
          </h2>
          <p className="lede" data-reveal style={stagger(1)}>
            Trades grow the reserve. Redemptions draw on it. Burns shrink the supply.
          </p>
          <div className="hero-btns" data-reveal style={stagger(2)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">
              Follow @ZealTheMascot
            </a>
            <a className="btn btn-ghost" href={LINKS.telegram} target="_blank" rel="noreferrer">
              Join the Telegram
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="foot">
        <div className="wrap">
          <div className="foot-top">
            <a className="brand" href="#top">
              <img src="/img/zeal-mark.png" alt="" width={38} height={38} />
              <span>ZEAL</span>
            </a>
            <nav className="foot-links">
              <a href="#foundry">The Foundry</a>
              <a href="#furnace">The Furnace</a>
              <a href="#proof">Proof</a>
              <a href="#phases">Roadmap</a>
              <a href="#lore">Lore</a>
              <a href={LINKS.x} target="_blank" rel="noreferrer">X</a>
              <a href={LINKS.telegram} target="_blank" rel="noreferrer">Telegram</a>
              <a href={PONS.docsUrl} target="_blank" rel="noreferrer">Pons docs</a>
              <a href={LINKS.zcash} target="_blank" rel="noreferrer">Zcash</a>
            </nav>
          </div>
          <hr className="rule" />
          <div className="foot-meta">
            <p className="mono">
              {CHAIN.name} · chain id {CHAIN.id}
            </p>
            <ContractAddress compact />
            <p className="foot-legal">
              ${TOKEN.symbol} is a community token with no intrinsic value and no expectation of
              financial return. Nothing here is investment advice, an offer, or a solicitation.
              {' '}{TOKEN.wrapper} is reserve-backed and carries custody and smart-contract risk.
              Zeal is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.,
              the Electric Coin Company, or the Zcash Foundation. Do your own research and never
              risk what you cannot lose.
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}
