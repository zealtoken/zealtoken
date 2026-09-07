import { LaunchpadPreview } from './LaunchpadPreview'
import { LINKS, TOKEN } from '../config'

export function Launchpad() {
  return (
    <section className="band band-tint launchpad-overview" id="launchpad" aria-labelledby="launchpad-title">
      <div className="wrap">
        <div className="launchpad-intro">
        <div className="launchpad-intro-copy">
        <div className="launchpad-heading">
          <div>
            <p className="eyebrow">zealz.fun · the ecosystem’s launchpad</p>
            <h2 className="h2" id="launchpad-title">The next chapter.<br /><span className="green">zealz.fun.</span></h2>
          </div>
          <span className="tag tag-wait">In development · preview available</span>
        </div>
        <p className="lede launchpad-lede">A launchpad built around zZEC. New tokens bring new markets, and their trading fees are designed to support ZEAL buybacks and burns. Deeper zZEC liquidity helps make that possible.</p>

        </div>
        <LaunchpadPreview />
        </div>

        <ol className="launchpad-flow" aria-label="How the planned launchpad connects the ecosystem">
          <li><span className="mono">01 · CREATE</span><h3>Creators launch tokens</h3><p>Each launch opens a market paired with {TOKEN.wrapper}.</p></li>
          <li><span className="mono">02 · TRADE</span><h3>More uses for {TOKEN.wrapper}</h3><p>Buyers trade in {TOKEN.wrapper}, with an ETH route through the ETH/{TOKEN.wrapper} pool.</p></li>
          <li><span className="mono">03 · SUPPORT</span><h3>Fees feed the Furnace</h3><p>A share of trading fees goes toward ${TOKEN.symbol} buybacks and burns.</p></li>
        </ol>
        <details className="home-more"><summary>Benefits, fee design and launch mechanics</summary><p className="launchpad-connection">This is why {TOKEN.wrapper} liquidity matters to the launchpad: deeper ETH/{TOKEN.wrapper} liquidity can reduce price impact on its planned ETH-buying route. More activity may generate more LP fees; volume and returns are not guaranteed.</p>

        <div className="launchpad-benefits">
          <article>
            <p className="eyebrow">For ${TOKEN.symbol}</p>
            <h3 className="h3">More markets feeding the burn.</h3>
            <p>The launchpad’s fee design sends at least 0.5% of each trade’s {TOKEN.wrapper} leg to the Furnace for ${TOKEN.symbol} buybacks and burns. Activity across launched tokens can support the ecosystem; burns do not guarantee a higher price.</p>
          </article>
          <article>
            <p className="eyebrow">For {TOKEN.wrapper}</p>
            <h3 className="h3">Zcash at the heart of every pair.</h3>
            <p>Launches trade against {TOKEN.wrapper}. The planned ETH-buy flow routes through the ETH/{TOKEN.wrapper} market first, giving the wrapper more utility and its liquidity providers another potential source of trading volume.</p>
          </article>
        </div>

        <div className="launchpad-features" aria-label="Launchpad design benefits">
          <article><h3>Launch without a token allocation</h3><p>The creator receives no initial token allocation and can earn a disclosed fee share instead. Creators can still buy tokens on the market.</p></article>
          <article><h3>Locked launch liquidity</h3><p>The launch position is designed to stay locked, with LP fees reinvested into it. This lock applies to launchpad pools, not your regular {TOKEN.wrapper}/ETH position.</p></article>
          <article><h3>Buy with ETH or {TOKEN.wrapper}</h3><p>An ETH route and optional batch openings are built and tested on a chain fork. Batch bids settle at a shared price within the opening.</p></article>
          <article><h3>Rewards paid in {TOKEN.wrapper}</h3><p>Creators can allocate part of trading fees to their token’s holders. Eligibility and the split depend on each launch; this is not income for every ${TOKEN.symbol} holder.</p></article>
        </div>

        </details><div className="launchpad-actions">
          <a className="btn btn-primary" href={LINKS.zealz} target="_blank" rel="noreferrer">Explore zealz.fun preview ↗</a>
          <a className="btn btn-ghost" href="#liquidity">Help deepen {TOKEN.wrapper} liquidity</a>
          <a href="/docs/#/launchpad">Read the launchpad design →</a>
        </div>
        <p className="launchpad-status">The preview contains sample launches. Contracts and the interface are built; public deployment and readiness checks remain. Locked liquidity does not prevent token losses. Launchpad pools inherit {TOKEN.wrapper}’s reserve custody and contract risks.</p>
      </div>
    </section>
  )
}
