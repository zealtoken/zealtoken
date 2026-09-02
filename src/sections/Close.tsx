import { useState } from 'react'
import { CHAIN, LINKS, PONS, RESERVE_TAKE_PCT, TOKEN } from '../config'
import { stagger } from '../useReveal'

const PHASES = [
  {
    p: 'Phase 00',
    t: 'Launch',
    s: 'now',
    d: `$${TOKEN.symbol} launches on ${PONS.launchpad}. The creator fee recipient is set to the Foundry contract at creation, so the mechanism is live from the first trade rather than bolted on later.`,
  },
  {
    p: 'Phase 01',
    t: 'Reserve opens',
    s: 'next',
    d: 'Multisig signers and threshold published. First WETH → ZEC swap executed through NEAR Intents. Reserve address goes public with its first balance.',
  },
  {
    p: 'Phase 02',
    t: `${TOKEN.wrapper} mints`,
    s: 'planned',
    d: `The wrapper contract deploys on ${CHAIN.name} with supply capped at the attested reserve. Initial ${TOKEN.wrapper} liquidity is seeded from the liquidity slice.`,
  },
  {
    p: 'Phase 03',
    t: 'Redemption',
    s: 'planned',
    d: `Burn-to-redeem opens. ${TOKEN.wrapper} holders can exit to native ZEC at any time, which is what makes the peg mean anything.`,
  },
  {
    p: 'Phase 04',
    t: 'Hand off custody',
    s: 'the goal',
    d: 'Move backing from a multisig to trust-minimized custody as the tooling lands: red·bridge (Zcash Community Grants + Avalanche Foundation) or an equivalent MPC design. The endgame is a reserve we cannot touch either.',
  },
]

const FAQ = [
  {
    q: `Where does the money to buy ZEC actually come from?`,
    a: `Trading fees on $${TOKEN.symbol} itself. Pons charges ${PONS.poolFeePct.toFixed(2)}% on every trade and sends ${PONS.creatorSharePct}% of that to the token’s designated fee recipient. Ours is a contract, not a person. ${RESERVE_TAKE_PCT.toFixed(2)}% of all volume ends up as Zcash in the reserve.`,
  },
  {
    q: `Is this a tax token? Am I paying extra?`,
    a: `No extra tax on top. The ${PONS.poolFeePct.toFixed(2)}% is the standard Pons pool fee that every token on the launchpad pays. The difference is where the creator half goes: most projects route it to a founder’s wallet, and we route it to a machine that buys Zcash.`,
  },
  {
    q: `Why not just bridge ZEC directly?`,
    a: `Because a bridge needs liquidity on both sides before it is useful, and nobody was going to supply it for a chain with zero ZEC presence. The Foundry bootstraps that reserve from trading activity instead of asking for it. Once the reserve is deep enough, better custody designs become available to us.`,
  },
  {
    q: `What stops you from running off with the reserve?`,
    a: `In v1: a published multisig, a transparent address anyone can watch, and the fact that the whole point of the project evaporates the moment the balance moves wrong. That is a real trust assumption and we name it plainly in "What this is, and what it isn’t". Phase 04 exists to remove it.`,
  },
  {
    q: `Does holding $${TOKEN.symbol} give me a claim on the ZEC?`,
    a: `No. $${TOKEN.symbol} funds the reserve; it does not own it. If you want ZEC exposure, that is what ${TOKEN.wrapper} is for once it mints. Keeping those two things separate is deliberate.`,
  },
  {
    q: `Is ${TOKEN.wrapper} private?`,
    a: `Not on ${CHAIN.name}. It is a transparent ERC-20 there, like everything else on an EVM chain. It gives you ZEC price exposure and onchain utility. Actual shielding happens on Zcash, after you redeem.`,
  },
  {
    q: `What happened to the Solana $${TOKEN.symbol}?`,
    a: `That chapter is closed. This is a fresh launch on ${CHAIN.name} with a mechanism behind it instead of a mascot alone.`,
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <ul className="faq">
      {FAQ.map((f, i) => (
        <li key={f.q} className={open === i ? 'is-open' : ''} data-reveal style={stagger(i, 60)}>
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
            Every trade lays another brick. The crew is already on the floor.
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
              <a href="#proof">Proof</a>
              <a href="#limits">Disclosures</a>
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
