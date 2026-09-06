import { useEffect, useRef, useState } from 'react'
import { CONTRACTS, ZZEC_MARKET } from '../../config'
import { Frame } from './Frame'
import { T, blockTime, call, css, getLogs, num, w } from './rpc'

const ZZEC = CONTRACTS.zzec!, FURNACE = CONTRACTS.furnace!
const fmt = (n: number, d = 4) => n.toLocaleString('en-US', { maximumFractionDigits: d })

/** Coverage gauge: attested reserve vs supply, attestation age, live. */
export function CoverageGauge() {
  const [d, setD] = useState<{ reserve: number; supply: number; at: number; maxAge: number } | null>(null)
  useEffect(() => { let on = true; const run = async () => { try { const [r, s, a, m] = await Promise.all([call(ZZEC, '0xb63374ee'), call(ZZEC, '0x18160ddd'), call(ZZEC, '0x8e353f4c'), call(ZZEC, '0x8a21aa44')]); if (on) setD({ reserve: num(w(r, 0), 8), supply: num(w(s, 0), 8), at: Number(w(a, 0)), maxAge: Number(w(m, 0)) }) } catch { /* retry next tick */ } }; void run(); const t = setInterval(run, 30_000); return () => { on = false; clearInterval(t) } }, [])
  const cov = d && d.supply > 0 ? d.reserve / d.supply : d ? Infinity : 0
  const pct = Math.min(1, Number.isFinite(cov) ? cov : 1)
  const ageH = d ? (Date.now() / 1000 - d.at) / 3600 : 0
  const R = 88, C = Math.PI * R
  return (
    <Frame title="Coverage, live" note="attested reserve ÷ zZEC supply · read from the wrapper every 30s">
      <div className="gauge">
        <svg viewBox="0 0 220 130" className="gauge-svg">
          <path d="M22 118 A 88 88 0 0 1 198 118" className="gauge-track" />
          <path d="M22 118 A 88 88 0 0 1 198 118" className="gauge-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }} />
          <text x="110" y="100" className="gauge-n">{d ? (Number.isFinite(cov) ? cov.toFixed(4) : '∞') : '…'}</text>
          <text x="110" y="122" className="gauge-l">coverage</text>
        </svg>
        <div className="gauge-side mono">
          <div><span>attested reserve</span><b>{d ? fmt(d.reserve, 8) : '…'} ZEC</b></div>
          <div><span>zZEC supply</span><b>{d ? fmt(d.supply, 8) : '…'}</b></div>
          <div><span>attestation age</span><b>{d ? `${ageH.toFixed(1)} h` : '…'}</b><i>{d ? `mints stop at ${d.maxAge / 3600} h` : ''}</i></div>
          <div><span>state</span><b className={d && ageH < d.maxAge / 3600 && cov >= 1 ? 'ok' : 'warn'}>{d ? (cov >= 1 ? 'fully covered' : 'BREACH') + (ageH < d.maxAge / 3600 ? ' · fresh' : ' · STALE') : '…'}</b></div>
        </div>
      </div>
    </Frame>
  )
}

/** Attestation history: every Attested event, reserve and supply over time. */
export function AttestChart() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [pts, setPts] = useState<{ t: number; r: number; s: number }[] | null>(null)
  useEffect(() => { getLogs(ZZEC, T.attested).then((ls) => setPts(ls.map((l) => ({ r: num(w(l.data, 0), 8), s: num(w(l.data, 1), 8), t: Number(w(l.data, 3)) })))).catch(() => setPts([])) }, [])
  useEffect(() => {
    const c = ref.current; if (!c || !pts || pts.length < 2) return
    const dpr = Math.min(devicePixelRatio, 2), W = c.clientWidth, H = 240; c.width = W * dpr; c.height = H * dpr; const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const green = css('--green-bright', '#00c805'), fg = css('--fg', '#08090a'), faint = css('--fg-faint', 'rgba(0,0,0,.5)')
    const t0 = pts[0].t, t1 = Date.now() / 1000, max = Math.max(...pts.map((p) => Math.max(p.r, p.s))) * 1.15 || 1
    const X = (t: number) => 44 + ((t - t0) / (t1 - t0 || 1)) * (W - 60), Y = (v: number) => H - 30 - (v / max) * (H - 50)
    ctx.clearRect(0, 0, W, H); ctx.strokeStyle = faint; ctx.globalAlpha = 0.25; ctx.lineWidth = 1
    for (let g = 0; g <= 4; g++) { const y = Y((max / 4) * g); ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(W - 16, y); ctx.stroke() }
    ctx.globalAlpha = 1; ctx.fillStyle = faint; ctx.font = '10px ui-monospace, monospace'
    for (let g = 0; g <= 4; g++) ctx.fillText(((max / 4) * g).toFixed(2), 4, Y((max / 4) * g) + 3)
    // step lines: an attestation holds until the next one
    const step = (key: 'r' | 's', color: string, width: number, dash: number[]) => { ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); pts.forEach((p, i) => { const x = X(p.t), y = Y(p[key]); if (i === 0) ctx.moveTo(x, y); else { ctx.lineTo(x, Y(pts[i - 1][key])); ctx.lineTo(x, y) } }); ctx.lineTo(X(t1), Y(pts[pts.length - 1][key])); ctx.stroke(); ctx.setLineDash([]) }
    step('r', green, 2.5, []); step('s', fg, 1.5, [4, 4])
    ctx.fillStyle = green; for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.t), Y(p.r), 3, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = faint; ctx.fillText(new Date(t0 * 1000).toISOString().slice(5, 16).replace('T', ' '), 44, H - 12); const end = 'now'; ctx.fillText(end, W - 16 - ctx.measureText(end).width, H - 12)
  }, [pts])
  return (
    <Frame title="Every attestation so far" note={pts ? `${pts.length} attestations · solid: attested ZEC · dashed: zZEC supply at that moment · read from Attested events` : 'reading events…'}>
      <canvas ref={ref} className="viz-canvas" style={{ height: 240 }} />
    </Frame>
  )
}

/** Burn history from Ignited + Burned events. */
export function BurnChart() {
  const [rows, setRows] = useState<{ t: number; zeal: number; eth: number; zzec: number; tx: string }[] | null>(null)
  useEffect(() => { (async () => { try { const ls = await getLogs(FURNACE, T.ignited); const out = []; for (const l of ls) out.push({ t: await blockTime(l.blockNumber), zzec: num(w(l.data, 0), 8), eth: num(w(l.data, 1), 18), zeal: num(w(l.data, 2), 18), tx: l.transactionHash }); setRows(out) } catch { setRows([]) } })() }, [])
  const max = rows ? Math.max(...rows.map((r) => r.zeal), 1) : 1
  const total = rows ? rows.reduce((s, r) => s + r.zeal, 0) : 0
  return (
    <Frame title="Every ignition so far" note={rows ? `${rows.length} ignitions · ${fmt(total, 0)} $ZEAL bought and burned · from Ignited events on the Furnace` : 'reading events…'}>
      <div className="bars">
        {rows?.map((r) => (
          <a className="bar" key={r.tx} href={`${CONTRACTS.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer" title={`${fmt(r.zeal, 0)} ZEAL`}>
            <div className="bar-fill" style={{ height: `${Math.max(4, (r.zeal / max) * 100)}%` }} />
            <div className="bar-l mono"><b>{fmt(r.zeal, 0)}</b><span>{new Date(r.t * 1000).toISOString().slice(5, 10)}</span><i>{r.eth > 0 ? `${fmt(r.eth, 4)} ETH` : ''}{r.zzec > 0 ? ` ${fmt(r.zzec, 4)} zZEC` : ''}</i></div>
          </a>
        ))}
        {rows && rows.length === 0 && <div className="mono viz-empty">no ignitions read</div>}
      </div>
    </Frame>
  )
}

/** Hook takes: what every zZEC trade has handed to the burn, cumulative. */
export function HookChart() {
  const [rows, setRows] = useState<{ eth: number; zzec: number; n: number } | null>(null)
  useEffect(() => { getLogs(ZZEC_MARKET.hook, T.hookTaken).then((ls) => { let eth = 0, zzec = 0; for (const l of ls) { const cur = '0x' + l.topics[1].slice(26); const amt = w(l.data, 0); if (cur === '0x0000000000000000000000000000000000000000') eth += num(amt, 18); else zzec += num(amt, 8) } setRows({ eth, zzec, n: ls.length }) }).catch(() => setRows({ eth: 0, zzec: 0, n: 0 })) }, [])
  const volEth = rows ? rows.eth / (ZZEC_MARKET.hookFeePct / 100) : 0, volZ = rows ? rows.zzec / (ZZEC_MARKET.hookFeePct / 100) : 0
  return (
    <Frame title="What the hook has taken" note="BurnShareTaken events · 0.7% of every swap's output, by currency · implies the volume that produced it">
      <div className="kv mono">
        <div><span>swaps taxed</span><b>{rows ? rows.n : '…'}</b></div>
        <div><span>ETH to the Furnace</span><b>{rows ? fmt(rows.eth, 6) : '…'}</b><i>from {rows ? fmt(volEth, 4) : '…'} ETH of zZEC buys</i></div>
        <div><span>zZEC to the Furnace</span><b>{rows ? fmt(rows.zzec, 6) : '…'}</b><i>from {rows ? fmt(volZ, 4) : '…'} zZEC of sells</i></div>
        <div><span>LPs earned meanwhile</span><b>{rows ? `${fmt(volEth * 0.003, 6)} ETH + ${fmt(volZ * 0.003, 6)} zZEC` : '…'}</b><i>0.3% of the same volume</i></div>
      </div>
    </Frame>
  )
}

/** The pool right now: price vs Coinbase, depth, keeper band. */
export function PoolNow() {
  const [d, setD] = useState<{ price: number; fair: number | null; eth: number; zzec: number } | null>(null)
  useEffect(() => { let on = true; const run = async () => { try { const id = ZZEC_MARKET.poolId.slice(2); const [s0, lq] = await Promise.all([call('0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', '0xc815641c' + id), call('0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', '0xfa6793d5' + id)]); const sq = Number(w(s0, 0)) / 2 ** 96, L = Number(w(lq, 0)); const eth = L / sq / 1e18, zzec = (L * sq) / 1e8; let fair: number | null = null; try { const sp = async (p: string) => Number(((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()) as { data: { amount: string } }).data.amount); const [z, e] = await Promise.all([sp('ZEC-USD'), sp('ETH-USD')]); fair = z / e } catch { /* optional */ } if (on) setD({ price: eth / zzec, fair, eth, zzec }) } catch { /* retry */ } }; void run(); const t = setInterval(run, 20_000); return () => { on = false; clearInterval(t) } }, [])
  const gap = d && d.fair ? (d.price / d.fair - 1) * 100 : null
  const pos = gap === null ? 50 : Math.max(2, Math.min(98, 50 + gap * 10))
  return (
    <Frame title="The pool right now" note="price against Coinbase ZEC/ETH · the keeper trades when the marker leaves the ±1% band">
      <div className="band-viz">
        <div className="band-track"><div className="band-ok" style={{ left: '40%', width: '20%' }} /><div className="band-mark" style={{ left: `${pos}%` }} /><span className="mono l">-5%</span><span className="mono r">+5%</span></div>
        <div className="kv mono">
          <div><span>1 zZEC</span><b>{d ? d.price.toFixed(5) : '…'} ETH</b></div>
          <div><span>vs ZEC</span><b className={gap !== null && Math.abs(gap) <= 1 ? 'ok' : ''}>{gap === null ? '…' : `${gap >= 0 ? '+' : ''}${gap.toFixed(2)}%`}</b></div>
          <div><span>depth</span><b>{d ? `${fmt(d.eth, 4)} ETH + ${fmt(d.zzec, 4)} zZEC` : '…'}</b></div>
          <div><span>a 0.02 ETH buy moves price</span><b>{d ? `~${((0.02 / d.eth) * 100).toFixed(1)}%` : '…'}</b><i>why depth is the peg</i></div>
        </div>
      </div>
    </Frame>
  )
}
