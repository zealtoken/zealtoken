import { useReveal } from './useReveal'
import { Nav } from './sections/Nav'
import { Hero } from './sections/Hero'
import { Mechanism } from './sections/Mechanism'
import { Furnace } from './sections/Furnace'
import { More, ZcashDesk, LoopCalculators } from './sections/HomeLayout'
import { Proof } from './sections/Proof'
import { Market } from './sections/Market'
import { LiquidityDesk } from './sections/LiquidityDesk'
import { Lore } from './sections/Lore'
import { Launchpad } from './sections/Launchpad'
import { Participate } from './sections/Participate'
import { Ledger } from './sections/Ledger'
import { Close } from './sections/Close'

export default function App() {
  useReveal()
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Participate />
        <LiquidityDesk />
        <div className="wrap"><More title="Market prices and trading routes"><Market /></More></div>
        <ZcashDesk />
        <Launchpad />
        <section className="band" id="loops"><div className="wrap">
          <p className="eyebrow">How ZEAL works</p><h2 className="h2">Two loops. One ecosystem.</h2>
          <div className="home-loop-grid">
            <article><span className="tag tag-wait">Awaiting Pons activation</span><h3>The Foundry</h3><p>The intended ZEAL creator-fee route splits funding between the ZEC reserve, zZEC liquidity and operations.</p><a href="/docs/#/fee-route">Fee route and current status →</a></article>
            <article><span className="tag tag-live">zZEC market live</span><h3>The Furnace</h3><p>A separate hook charge on zZEC trades funds ZEAL buybacks and burns. LP trading fees go to liquidity providers.</p><a href="/docs/#/furnace-and-hook">How the Furnace works →</a></article>
          </div>
          <More title="Explore the fee calculators"><LoopCalculators /></More>
          <More title="Follow the Foundry and Furnace diagrams"><Mechanism /><Furnace /></More>
        </div></section>
        <section className="band band-tint" id="accounting"><div className="wrap">
          <p className="eyebrow">Verify the system</p><h2 className="h2">Public backing. Visible activity.</h2>
          <p className="lede">Check the reserve, supply, fee routing and burns. zZEC uses operator custody; ZEAL is a community token and has no claim on the reserve.</p>
          <More title="Live reserve, supply and fee accounting"><section id="ledger"><Ledger /></section></More>
          <More title="Contracts, verification and trust assumptions"><Proof /></More>
          <More title="The story behind ZEAL"><Lore /></More>
        </div></section>
        <Close />
      </main>
    </>
  )
}
