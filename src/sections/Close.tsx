import { useState } from 'react'
import { CHAIN, LINKS, PONS, RESERVE_TAKE_PCT, TOKEN } from '../config'
import { stagger } from '../useReveal'

const PHASES = [
  {
    p: 'Phase 00',
    t: 'Launch',
    s: 'now',
    d: `$${TOKEN.symbol} launches on ${PONS.launchpad} with the fee redirect already pointed at the Foundry. The mechanism is live from trade one.`,
  },
  {
    p: 'Phase 01',
    t: 'Reserve opens',
    s: 'next',
    d: 'Multisig published. First WETH → ZEC swap over NEAR Intents. Reserve address goes public with its first balance.',
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

const FAQ = [
  {
    q: `Where does the money to buy ZEC come from?`,
    a: `$${TOKEN.symbol} trading fees. Pons takes ${PONS.poolFeePct.toFixed(2)}% per trade and sends ${PONS.creatorSharePct}% of it to the Foundry. ${RESERVE_TAKE_PCT.toFixed(2)}% of all volume becomes Zcash in the reserve.`,
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
                    <span className={`tag ${i === 0 ? 'tag-live' : ''}`}>
                      {i === 0 && <span className="dot" />}
                      {p.s}
                    </span>
                  </div>
                  <h3 className="h3">{p.t}</h3>
                  <p>{p.d}</p>
                </div>
              </article>
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
            The reserve only grows. The supply only shrinks. Trade one starts both.
          </p>
          <div className="hero-btns" data-reveal style={stagger(2)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">
              Follow @ZealTheMascot
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
              <a href={LINKS.x} target="_blank" rel="noreferrer">X</a>
              <a href={PONS.docsUrl} target="_blank" rel="noreferrer">Pons docs</a>
              <a href={LINKS.zcash} target="_blank" rel="noreferrer">Zcash</a>
            </nav>
          </div>
          <hr className="rule" />
          <div className="foot-meta">
            <p className="mono">
              {CHAIN.name} · chain id {CHAIN.id} · settles to {CHAIN.settles}
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
