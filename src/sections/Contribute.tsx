import { useEffect, useState } from 'react'
import { CONTRACTS, LINKS, TOKEN, ZZEC_MARKET } from '../config'
import { SEL, hexToBig, readBatchRaw, word } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * Put ZEC to work: the case for wrapping into the reserve and for providing
 * zZEC liquidity, with live numbers and two honest calculators. Every figure
 * either comes from chain or is an assumption the reader controls.
 */
const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const SEL_SLOT0 = '0xc815641c', SEL_LIQ = '0xfa6793d5', SEL_TAKEN0 = '0x32bd4c0b', SEL_TAKEN1 = '0x3f739f57'
const HOOK_SINCE = Date.UTC(2026, 8, 5, 3, 0, 0) // hooked pool went live

type Live = { reserve: number; supply: number; ethDepth: number; zzecDepth: number; priceEth: number; zecUsd: number | null; ethUsd: number | null; volZec: number; lpFeesZec: number; days: number }

async function read(signal: AbortSignal): Promise<Live> {
  const id = ZZEC_MARKET.poolId.slice(2)
  const [slot0, liq, res, sup, t0, t1] = await readBatchRaw([
    { to: STATE_VIEW, data: SEL_SLOT0 + id }, { to: STATE_VIEW, data: SEL_LIQ + id },
    { to: CONTRACTS.zzec!, data: SEL.reserveZats }, { to: CONTRACTS.zzec!, data: SEL.totalSupply },
    { to: ZZEC_MARKET.hook, data: SEL_TAKEN0 }, { to: ZZEC_MARKET.hook, data: SEL_TAKEN1 },
  ], signal)
  const sqrt = Number(hexToBig(word(slot0, 0))) / 2 ** 96, L = Number(hexToBig(liq))
  const ethDepth = L / sqrt / 1e18, zzecDepth = (L * sqrt) / 1e8, priceEth = zzecDepth > 0 ? ethDepth / zzecDepth : 0
  let zecUsd: number | null = null, ethUsd: number | null = null
  try { const spot = async (p: string) => Number(((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`, { signal })).json()) as { data: { amount: string } }).data.amount); [zecUsd, ethUsd] = await Promise.all([spot('ZEC-USD'), spot('ETH-USD')]) } catch { /* optional */ }
  // The hook takes 0.7% of every swap's output. Lifetime takes therefore imply lifetime volume, and LPs earned 0.3% of it.
  const takenEth = Number(hexToBig(t0)) / 1e18, takenZzec = Number(hexToBig(t1)) / 1e8
  const volZec = (takenEth / (priceEth || 1) + takenZzec) / (ZZEC_MARKET.hookFeePct / 100)
  return { reserve: Number(hexToBig(res)) / 1e8, supply: Number(hexToBig(sup)) / 1e8, ethDepth, zzecDepth, priceEth, zecUsd, ethUsd, volZec, lpFeesZec: volZec * (ZZEC_MARKET.lpFeePct / 100), days: Math.max(1, (Date.now() - HOOK_SINCE) / 86400e3) }
}

const z = (n: number, d = 4) => n.toLocaleString('en-US', { maximumFractionDigits: d })
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function Contribute() {
  const [live, setLive] = useState<Live | null>(null)
  const [wrapZec, setWrapZec] = useState(0.5)
  const [lpEth, setLpEth] = useState(0.1)
  const [volDay, setVolDay] = useState<number | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => { if (document.visibilityState === 'hidden') return; try { const l = await read(ctrl.signal); setLive(l); setVolDay((v) => v ?? Math.max(0.5, Math.round((l.volZec / l.days) * 10) / 10)) } catch { /* keep last */ } }
    void run(); const t = window.setInterval(run, 30_000); return () => { ctrl.abort(); window.clearInterval(t) }
  }, [])

  const toUsd = (zec: number) => (live?.zecUsd ? ` · ${usd(zec * live.zecUsd)}` : '')
  // wrap widget
  const reserveAfter = (live?.reserve ?? 0) + wrapZec
  const shareOfReserve = reserveAfter > 0 ? (wrapZec / reserveAfter) * 100 : 0
  // lp widget: pair ETH with zZEC at the pool price, compute share and fee estimate at the chosen volume assumption
  const lpZzec = live && live.priceEth > 0 ? lpEth / live.priceEth : 0
  const poolValueZec = live ? live.zzecDepth * 2 : 0
  const addValueZec = lpZzec * 2
  const share = poolValueZec + addValueZec > 0 ? (addValueZec / (poolValueZec + addValueZec)) * 100 : 0
  const vol = volDay ?? 0
  const feesYearZec = vol * 365 * (ZZEC_MARKET.lpFeePct / 100) * (share / 100)
  const feePct = addValueZec > 0 ? (feesYearZec / addValueZec) * 100 : 0
  const burnYearZec = vol * 365 * (ZZEC_MARKET.hookFeePct / 100)

  return (
    <section className="band band-tint" id="contribute">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Put ZEC to work</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Add ZEC. Add depth.
            <br />
            <span className="green">Both make the peg stronger.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            {TOKEN.wrapper} only exists against ZEC in the reserve, so adding liquidity and adding reserves are the same act
            seen from two sides. Here is what each one does for you, and for the machine, with live numbers.
          </p>
        </div>

        <div className="ctb-strip mono" data-reveal style={stagger(3)}>
          <div><span>ZEC in reserve</span><b>{live ? z(live.reserve) : '…'}</b></div>
          <div><span>{TOKEN.wrapper} minted</span><b>{live ? z(live.supply) : '…'}</b></div>
          <div><span>pool depth</span><b>{live ? `${z(live.ethDepth, 3)} ETH + ${z(live.zzecDepth, 3)} ${TOKEN.wrapper}` : '…'}</b></div>
          <div><span>traded since Sep 5</span><b>{live ? `${z(live.volZec, 2)} ZEC` : '…'}</b><i>{live ? `${z(live.lpFeesZec, 4)} ZEC to LPs · ${z(live.volZec * ZZEC_MARKET.hookFeePct / 100, 4)} to the burn` : ''}</i></div>
        </div>

        <div className="ctb-grid">
          {/* ---------------- wrap ---------------- */}
          <article className="ctb-card" data-reveal style={stagger(4)}>
            <div className="ctb-n mono">01</div>
            <h3 className="h3">Wrap ZEC into the reserve</h3>
            <p className="ctb-lede">Send ZEC, get {TOKEN.wrapper} one for one. Your Zcash exposure stays exactly what it was; it just becomes usable on Robinhood Chain.</p>
            <ul className="ctb-list">
              <li><b>1:1, no fee.</b> The only cost is the Zcash network fee on your deposit.</li>
              <li><b>You can always leave.</b> Redeem through the desk: escrow, get paid native ZEC automatically, usually within minutes. If a payout ever failed, the contract lets you take your {TOKEN.wrapper} back yourself. Nobody can pause that.</li>
              <li><b>Public within the hour.</b> Your deposit shows on the reserve address immediately and in the on-chain attestation at the next 6-hour mark.</li>
              <li><b>More reserve, tighter peg.</b> A bigger reserve means more {TOKEN.wrapper} in circulation, more inventory for the keeper and for arbitrage, and a smaller price impact per trade.</li>
              <li><b>It unlocks the other side.</b> {TOKEN.wrapper} is what you need to provide liquidity, or to buy anything on zealz.fun.</li>
            </ul>
            <div className="ctb-widget">
              <div className="ctb-w-h mono">if you wrap <b>{z(wrapZec, 3)} ZEC</b>{toUsd(wrapZec)}</div>
              <input className="ctb-range" type="range" min={0.01} max={10} step={0.01} value={wrapZec} onChange={(e) => setWrapZec(Number(e.target.value))} aria-label="ZEC to wrap" />
              <div className="ctb-out mono">
                <div><span>you receive</span><b>{z(wrapZec, 8)} {TOKEN.wrapper}</b></div>
                <div><span>reserve after</span><b>{live ? z(reserveAfter, 4) : '…'} ZEC</b></div>
                <div><span>your share of the reserve</span><b>{live ? z(shareOfReserve, 1) : '…'}%</b></div>
                <div><span>coverage after</span><b>1.00</b></div>
              </div>
            </div>
            <div className="ctb-actions">
              {CONTRACTS.wrapDesk ? <a className="btn btn-primary" href="#wrap">Wrap ZEC</a> : <a className="btn btn-primary" href="#wrap">Wrap desk opens Sep 7</a>}
              <a className="btn btn-ghost" href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">Or buy {TOKEN.wrapper} on Uniswap</a>
            </div>
            <p className="ctb-risk mono">what you accept: the reserve key is held by the operator, at a public address. Reserve-backed, not trustless. Phase 04 changes that.</p>
          </article>

          {/* ---------------- lp ---------------- */}
          <article className="ctb-card" data-reveal style={stagger(5)}>
            <div className="ctb-n mono">02</div>
            <h3 className="h3">Provide {TOKEN.wrapper} + ETH liquidity</h3>
            <p className="ctb-lede">Put {TOKEN.wrapper} and ETH into the Uniswap pool and earn the {ZZEC_MARKET.lpFeePct}% fee on every trade, pro rata, withdrawable any time.</p>
            <ul className="ctb-list">
              <li><b>{ZZEC_MARKET.lpFeePct}% of every trade is yours.</b> The burn hook's {ZZEC_MARKET.hookFeePct}% is paid by traders on top; it takes nothing from LPs.</li>
              <li><b>Depth is the peg.</b> The keeper can only hold price where there is liquidity to trade against. Every ETH you add shrinks the price move of every trade.</li>
              <li><b>Every trade you host burns ${TOKEN.symbol}.</b> Volume through your liquidity feeds the Furnace, whoever the trader is.</li>
              <li><b>Not locked.</b> Your position is an NFT in your wallet. Remove it whenever you like.</li>
            </ul>
            <div className="ctb-widget">
              <div className="ctb-w-h mono">if you add <b>{z(lpEth, 3)} ETH</b> + <b>{z(lpZzec, 4)} {TOKEN.wrapper}</b>{live?.ethUsd ? ` · ${usd(lpEth * live.ethUsd * 2)}` : ''}</div>
              <input className="ctb-range" type="range" min={0.01} max={2} step={0.01} value={lpEth} onChange={(e) => setLpEth(Number(e.target.value))} aria-label="ETH to add" />
              <div className="ctb-w-h mono ctb-assume">assume <b>{z(vol, 1)} ZEC</b> traded per day <span>(observed average since Sep 5: {live ? z(live.volZec / live.days, 2) : '…'})</span></div>
              <input className="ctb-range ctb-range-2" type="range" min={0.5} max={500} step={0.5} value={vol} onChange={(e) => setVolDay(Number(e.target.value))} aria-label="daily volume assumption" />
              <div className="ctb-out mono">
                <div><span>your share of the pool</span><b>{live ? z(share, 1) : '…'}%</b></div>
                <div><span>fees to you per year</span><b>{z(feesYearZec, 4)} ZEC{toUsd(feesYearZec)}</b></div>
                <div><span>on what you added</span><b>{z(feePct, 1)}% / yr</b></div>
                <div><span>${TOKEN.symbol} bought and burned per year</span><b>{z(burnYearZec, 3)} ZEC worth</b></div>
              </div>
            </div>
            <div className="ctb-actions">
              <a className="btn btn-primary" href={LINKS.uniswapAddLiquidity} target="_blank" rel="noreferrer">Add liquidity on Uniswap</a>
              <a className="btn btn-ghost" href="#market">See the pool</a>
            </div>
            <p className="ctb-risk mono">what you accept: impermanent loss if {TOKEN.wrapper} and ETH diverge, Uniswap v4 and hook contract risk, and the same reserve custody as above. Fee figures are your assumption times {ZZEC_MARKET.lpFeePct}%, not a promise.</p>
          </article>
        </div>

        <div className="ctb-compare" data-reveal style={stagger(6)}>
          <table className="mono">
            <thead><tr><th></th><th>hold ZEC</th><th>wrap</th><th>wrap + provide</th></tr></thead>
            <tbody>
              <tr><td>exposure</td><td>ZEC</td><td>ZEC, on Robinhood Chain</td><td>half ZEC, half ETH, rebalancing</td></tr>
              <tr><td>earns</td><td>nothing</td><td>nothing yet</td><td>{ZZEC_MARKET.lpFeePct}% of every trade, pro rata</td></tr>
              <tr><td>does for the machine</td><td>nothing</td><td>grows the public reserve, adds peg inventory</td><td>deepens the market, hosts burns</td></tr>
              <tr><td>exit</td><td>n/a</td><td>redeem via the desk, paid automatically</td><td>remove liquidity any time, then redeem</td></tr>
              <tr><td>risk</td><td>ZEC price</td><td>operator custody of the reserve</td><td>plus impermanent loss and contract risk</td></tr>
            </tbody>
          </table>
        </div>

        <div className="ctb-soon mono" data-reveal style={stagger(7)}>
          <span className="tag tag-wait"><span className="dot" /> under consideration</span>
          <span>A {TOKEN.wrapper}-denominated rewards program for liquidity providers, and a launch bonus for early wraps. Neither is live and neither is promised; if either ships it will appear on this page with its budget and end date.</span>
        </div>
      </div>
    </section>
  )
}
