import { CHAIN, LINKS, PONS, TOKEN } from '../config'
import { stagger } from '../useReveal'
import { ContractAddress } from './ContractAddress'
import { Ledger } from './Ledger'
import { HeroBackdrop } from '../art/HeroBackdrop'


export function Hero() {
  return (
    <section className="band hero" id="top">
      <HeroBackdrop />
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
            Robinhood Chain has stocks and stablecoins. It has no privacy asset.{' '}
            <strong>${TOKEN.symbol}</strong> is bringing the first one: {TOKEN.wrapper}, real
            Zcash held in a public reserve and minted 1:1. Every ${TOKEN.symbol} trade grows the
            reserve. Every {TOKEN.wrapper} trade burns ${TOKEN.symbol}.
          </p>

          <div className="hero-btns" data-reveal style={stagger(3)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href="#foundry">
              See how the Foundry works
            </a>
          </div>

          <div data-reveal style={stagger(4)}>
            <ContractAddress />
          </div>
          <p className="hero-note mono" data-reveal style={stagger(5)}>
            No presale. No team allocation. Two contracts with no reverse gear.
          </p>
        </div>

      </div>

      <div className="wrap hero-ledger" data-reveal="scale" style={stagger(3)}>
        <Ledger />
      </div>
    </section>
  )
}
