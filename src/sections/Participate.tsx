import { TOKEN, ZZEC_MARKET } from '../config'
export function Participate() {
  return <section className="band band-tight participate" id="participate" aria-label="Understand the ecosystem"><div className="wrap home-token-grid">
    <article><p className="eyebrow">The community</p><h2>${TOKEN.symbol}</h2><p>The token behind the ecosystem. zZEC trading helps fund its buybacks and burns. No claim on ZEC reserves.</p><a href="#loops">How ZEAL works →</a></article>
    <article><p className="eyebrow">The wrapped asset</p><h2>zZEC</h2><p>Native ZEC represented on Robinhood Chain, backed by an operator-controlled Zcash reserve.</p><a href="#wrap">Wrap or redeem →</a></article>
    <article><p className="eyebrow">The liquidity providers</p><h2>The Herd</h2><p>Provide zZEC + ETH and share the {ZZEC_MARKET.lpFeePct}% LP trading fee. Returns vary; your position can lose value.</p><a href="#liquidity">Add liquidity →</a></article>
    <article><p className="eyebrow">The launchpad</p><h2>zealz.fun</h2><p>New token markets paired with zZEC, with trading fees designed to fund ZEAL buybacks and burns.</p><span className="ecosystem-status">In development · preview available</span><a href="#launchpad">Explore the launchpad →</a></article>
  </div></section>
}
