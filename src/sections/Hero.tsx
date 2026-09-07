import { CHAIN, LINKS, PONS, TOKEN } from '../config'
import { stagger } from '../useReveal'
import { ContractAddress } from './ContractAddress'
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
            All things Zcash.
            <br />
            <span className="green">On Robinhood Chain.</span>
          </h1>

          <p className="lede hero-lede" data-reveal style={stagger(2)}>
            ${TOKEN.symbol} is building a home for Zcash on Robinhood Chain. Trade {TOKEN.wrapper}, provide liquidity to earn fees, and explore zealz.fun, our upcoming token launchpad.
          </p>

          <div className="hero-btns" data-reveal style={stagger(3)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href="#liquidity">
              Provide zZEC liquidity
            </a>
            <a className="btn btn-ghost" href={LINKS.zealz} target="_blank" rel="noreferrer">
              Explore zealz.fun · preview ↗
            </a>
          </div>

          <div data-reveal style={stagger(4)}>
            <ContractAddress />
          </div>
          <p className="hero-note mono" data-reveal style={stagger(5)}>
            Launched without a presale or team allocation. $ZEAL is a community token, not a claim on the ZEC reserve.
          </p>
        </div>

      </div>


    </section>
  )
}
