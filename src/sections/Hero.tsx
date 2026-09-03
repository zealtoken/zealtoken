import { CHAIN, LINKS, PONS, RESERVE_TAKE_PCT, TOKEN } from '../config'
import { stagger } from '../useReveal'
import { Ledger } from './Ledger'

const FACTS = [
  { n: `${RESERVE_TAKE_PCT.toFixed(2)}%`, l: 'of every trade becomes ZEC' },
  { n: '1:1', l: `${TOKEN.wrapper} backed by native ZEC` },
  { n: '100%', l: 'of the reserve address is public' },
  { n: '0', l: 'ways to withdraw from the Furnace' },
]

export function Hero() {
  return (
    <section className="band hero" id="top">
      <div className="wrap hero-in">
        <div className="hero-copy">
          <p className="eyebrow" data-reveal>
            {CHAIN.name} · launched on {PONS.launchpad}
          </p>

          <h1 className="display" data-reveal style={stagger(1)}>
            The first wrapped
            <br />
            Zcash on
            <br />
            <span className="green">Robinhood Chain.</span>
          </h1>

          <p className="lede hero-lede" data-reveal style={stagger(2)}>
            Robinhood Chain has tokenized equities. It has stablecoins. It does not have
            privacy. <strong>${TOKEN.symbol}</strong> is building {TOKEN.wrapper}: real Zcash,
            bought on the open market, held in a public reserve, minted 1:1. Every{' '}
            ${TOKEN.symbol} trade funds the reserve. Every {TOKEN.wrapper} trade buys{' '}
            ${TOKEN.symbol} and burns it.
          </p>

          <div className="hero-btns" data-reveal style={stagger(3)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href="#foundry">
              See how the Foundry works
            </a>
          </div>

          <p className="hero-note mono" data-reveal style={stagger(4)}>
            No presale. No team allocation. The fee stream does the work.
          </p>
        </div>

        <div className="hero-art" data-reveal="scale" style={stagger(2)}>
          <Ledger />
        </div>
      </div>

      <div className="wrap hero-facts">
        {FACTS.map((f, i) => (
          <div key={f.l} data-reveal style={stagger(i, 110)}>
            <div className="stat-n">{f.n}</div>
            <div className="stat-l">{f.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
