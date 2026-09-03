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

const PHASES = [
  {
    p: 'Phase 00',
    t: 'Launch',
    s: 'live',
    d: `$${TOKEN.symbol} launched on ${PONS.launchpad} on Sep 3 and graduated in under an hour. The Foundry and the Tap are deployed with verified source. Fee routing to the Tap waits on a 3-day timelock at Pons.`,
  },
  {
    p: 'Phase 01',
    t: 'Reserve opens',
    s: 'next',
    d: 'Reserve address published. First ETH → ZEC conversion over NEAR Intents. The reserve goes public with its first balance and the ledger starts counting ZEC.',
  },
  {
    p: 'Phase 02',
    t: `${TOKEN.wrapper} mints`,
    s: 'planned',
    d: `${TOKEN.wrapper} and the Furnace deploy together. Liquidity is seeded and its fees pointed at the Furnace, so the first ${TOKEN.wrapper} trade is the first $${TOKEN.symbol} burn.`,
  },
  {
    p: 'Phase 03',
    t: 'Redemption',
    s: 'planned',
    d: `Burn ${TOKEN.wrapper}, receive native ZEC. The peg means something the day this opens.`,
  },
  {
    p: 'Phase 04',
    t: 'Hand off custody',
    s: 'the goal',
    d: 'Backing moves from a multisig to red·bridge or an equivalent trust-minimized design. The endgame is a reserve we cannot touch either.',
  },
]

const src = (addr: string) => `${CONTRACTS.explorer}/address/${addr}?tab=contract`

/** Dated, linkable, and only things that already happened. */
const LOG: { d: string; t: string; href?: string; label?: string }[] = [
  { d: 'Sep 03', t: `$${TOKEN.symbol} live on ${PONS.launchpad}. Graduated in under an hour.`, href: LINKS.pons, label: 'Pons' },
  { d: 'Sep 03', t: 'ZealFoundry deployed. 60/25/15 split, no owner, no admin. Source verified.', href: CONTRACTS.foundry ? src(CONTRACTS.foundry) : undefined, label: 'source' },
  { d: 'Sep 03', t: 'ZealTap deployed and verified. Pons V2 pays only a caller, so the Tap claims and hands everything to the Foundry.', href: PONS_V2.tap ? src(PONS_V2.tap) : undefined, label: 'source' },
  { d: 'Sep 03', t: `${TOKEN.wrapper} contract written and tested. 65 tests across the system, CI on every push.`, href: LINKS.repo ? `${LINKS.repo}/blob/main/contracts/contracts/ZZEC.sol` : undefined, label: 'ZZEC.sol' },
  { d: 'Sep 03', t: 'Reserve operator built: attest, mint, redemption watcher, ETH → ZEC sweep over Relay and NEAR Intents.', href: LINKS.repo ? `${LINKS.repo}/tree/main/ops` : undefined, label: 'ops/' },
  { d: 'Sep 03', t: 'Source publishing under a project org, not a person.', href: LINKS.repo ?? undefined, label: 'github' },
  { d: 'next', t: `Reserve address published. ${TOKEN.wrapper} deploys and verifies at supply zero. First attestation.` },
]

const FAQ = [
  {
    q: `Where does the money to buy ZEC come from, and where does the rest go?`,
    a: `From $${TOKEN.symbol} trading fees, and every cent is accounted for. Take a $100 trade. Pons charges a ${money(FEE_PER_100)} pool fee. Pons keeps ${money(PONS_KEEP_PER_100)} of that for running the launchpad. The other ${money(FOUNDRY_PER_100)} goes to the Foundry, which splits it three ways: ${money(SPLIT_PER_100[0])} buys Zcash for the reserve, ${money(SPLIT_PER_100[1])} seeds ${TOKEN.wrapper} liquidity (whose fees feed the Furnace), and ${money(SPLIT_PER_100[2])} covers audits, attestation and infrastructure. So of every dollar traded: ${pct(RESERVE_TAKE_PCT)} becomes Zcash, ${pct(SPLIT_TAKE_PCT[1])} becomes ${TOKEN.wrapper} liquidity, ${pct(SPLIT_TAKE_PCT[2])} runs the operation, and ${pct(PONS_TAKE_PCT)} is Pons’s fee. Nothing goes to a founder wallet.`,
  },
  {
    q: `Is this a tax token?`,
    a: `No. The ${PONS.poolFeePct.toFixed(2)}% is the standard Pons pool fee every token on the launchpad pays. The difference is where the creator share goes: a contract that buys Zcash, not a founder’s wallet.`,
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
                    <span className={`tag ${i === 0 ? 'tag-live' : 'tag-wait'}`}>
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
            The reserve only grows. The supply only shrinks. Every trade does both.
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
