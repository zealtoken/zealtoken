import { LINKS } from '../config'

// Same deterministic sample series as zealz.fun's Zebra Foundry preview.
const series = (() => {
  let value = 1, seed = 7
  return Array.from({ length: 48 }, () => {
    seed = (seed * 9301 + 49297) % 233280
    value *= 1 + ((seed / 233280) - 0.5) * 0.12 + 0.03
    return value
  })
})()
const min = Math.min(...series), max = Math.max(...series)
const points = series.map((v, i) => `${(12 + i / (series.length - 1) * 476).toFixed(2)},${(160 - (v - min) / (max - min) * 138).toFixed(2)}`).join(' ')

/** A lightweight product illustration. The only action opens the actual sample page. */
export function LaunchpadPreview() {
  return (
    <a className="launchpad-preview" href={`${LINKS.zealz}/#/t/0x1111111111111111111111111111111111111111`} target="_blank" rel="noreferrer" aria-label="Explore Zebra Foundry, a sample token page on zealz.fun (opens in a new tab)">
      <div className="lp-preview-browser"><span className="lp-window-dots" aria-hidden="true"><i /><i /><i /></span><span className="mono">zealz.fun / token</span><span aria-hidden="true">↗</span></div>
      <div className="lp-preview-screen">
        <div className="lp-preview-brand"><b>zealz<span>.fun</span></b><span className="mono">SAMPLE · NOT LIVE</span></div>
        <div className="lp-preview-token">
          <span className="lp-preview-mark" aria-hidden="true">Z</span>
          <div><h3>Zebra Foundry</h3><span className="mono">$ZBRA / zZEC</span></div>
          <span className="lp-preview-lock mono">↗ token page</span>
        </div>
        <div className="lp-preview-price"><strong>0.0187</strong><span className="mono">zZEC / 1M ZBRA</span></div>
        <div className="lp-preview-chart">
          <div className="lp-preview-chart-head mono"><span>PRICE HISTORY</span><span>Sample chart · 24h</span></div>
          <svg viewBox="0 0 500 180" role="img" aria-label="Illustrative price chart from the Zebra Foundry sample; not live performance">
            <defs><linearGradient id="lp-preview-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f3f3f0" stopOpacity=".2" /><stop offset="100%" stopColor="#f3f3f0" stopOpacity="0" /></linearGradient></defs>
            {[25, 70, 115, 160].map(y => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="#ffffff" strokeOpacity=".07" />)}
            <polygon points={`12,180 ${points} 488,180`} fill="url(#lp-preview-fill)" />
            <polyline points={points} fill="none" stroke="#f3f3f0" strokeWidth="7" strokeOpacity=".1" strokeLinejoin="round" />
            <polyline points={points} fill="none" stroke="#f3f3f0" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="488" cy={160 - (series[series.length - 1] - min) / (max - min) * 138} r="4" fill="#f3f3f0" />
          </svg>
        </div>
        <div className="lp-preview-stats">
          <div><span className="mono">LIQUIDITY LOCKED</span><b>4.12 <small>zZEC</small></b><em>Sample locked position</em></div>
          <div><span className="mono">ZEAL BURNED</span><b>14,210 <small>ZEAL</small></b><em>Sample trading activity</em></div>
        </div>
        <div className="lp-preview-route mono"><span>ETH or zZEC</span><span aria-hidden="true">→</span><span>Your next discovery</span></div>
      </div>
      <div className="lp-preview-caption"><div><b>Meet your next token page.</b><span>Explore the interactive sample on zealz.fun</span></div><span className="lp-preview-arrow" aria-hidden="true">↗</span></div>
    </a>
  )
}
