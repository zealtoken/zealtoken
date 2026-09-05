import { useId, useState } from 'react'
import { PONS, SPLIT, TOKEN, ZZEC_MARKET } from '../config'

/**
 * Two live calculators, one per loop. Every number derives from config.ts, so
 * the calculators can never disagree with the copy or the contracts.
 */

const usd = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits })

const num = (n: number, digits = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })

/** Parse "1,000,000", "$1m", "2.5M", "100k" into a number. */
function parseAmount(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!s) return 0
  const m = s.match(/^(\d*\.?\d+)([kmb])?$/)
  if (!m) return NaN
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2] as 'k' | 'm' | 'b'] ?? 1
  return parseFloat(m[1]) * mult
}

const PRESETS: [string, number][] = [
  ['100K', 1e5],
  ['1M', 1e6],
  ['10M', 1e7],
  ['100M', 1e8],
]

function VolumeInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  const id = useId()
  const [text, setText] = useState(num(value, 0))
  const [bad, setBad] = useState(false)

  const commit = (raw: string) => {
    setText(raw)
    const n = parseAmount(raw)
    if (Number.isNaN(n)) {
      setBad(true)
      return
    }
    setBad(false)
    onChange(n)
  }
  const pick = (n: number) => {
    setText(num(n, 0))
    setBad(false)
    onChange(n)
  }

  return (
    <div className="calc-in">
      <label htmlFor={id} className="mono">
        {label}
      </label>
      <div className={`calc-field ${bad ? 'is-bad' : ''}`}>
        <span className="calc-cur">$</span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => !bad && setText(num(value, 0))}
          aria-invalid={bad}
        />
      </div>
      <div className="calc-chips" role="group" aria-label="Presets">
        {PRESETS.map(([l, n]) => (
          <button
            key={l}
            type="button"
            className={value === n ? 'is-on' : ''}
            onClick={() => pick(n)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

function SmallInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 'any',
}: {
  label: string
  value: string
  onChange: (s: string) => void
  prefix?: string
  suffix?: string
  step?: string
}) {
  const id = useId()
  return (
    <div className="calc-small">
      <label htmlFor={id} className="mono">
        {label}
      </label>
      <div className="calc-field calc-field-sm">
        {prefix && <span className="calc-cur">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="calc-cur">{suffix}</span>}
      </div>
    </div>
  )
}

const toNum = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

// ---------------------------------------------------------------- loop 01

export function FoundryCalc() {
  const [vol, setVol] = useState(100_000)
  const [zecPrice, setZecPrice] = useState('')

  const fee = (vol * PONS.poolFeePct) / 100
  const creator = (fee * PONS.creatorSharePct) / 100
  const rows = SPLIT.map((s) => ({ ...s, usd: (creator * s.pct) / 100 }))
  const reserveUsd = rows[0].usd
  const zp = toNum(zecPrice)

  return (
    <div className="calc" data-reveal>
      <div className="money-head">
        <span className="mono">LOOP 01 · CALCULATOR</span>
        <h3 className="h3">
          For every <span className="green">{usd(vol)}</span> of ${TOKEN.symbol} traded
        </h3>
      </div>

      <VolumeInput label={`$${TOKEN.symbol} volume`} value={vol} onChange={setVol} />

      <div className="money-rows" aria-live="polite">
        <div className="money-row money-row-top">
          <span>Pool fee at {PONS.poolFeePct.toFixed(2)}%</span>
          <span className="mono">{usd(fee)}</span>
        </div>
        <div className="money-row money-row-top">
          <span>Creator share ({PONS.creatorSharePct}%) → the Foundry</span>
          <span className="mono">{usd(creator)}</span>
        </div>
        {rows.map((r) => (
          <div className="money-row" key={r.key}>
            <span>
              <em className="green">{r.pct}%</em> {r.label}
              <small>{r.note}</small>
            </span>
            <span className="mono">{usd(r.usd)}</span>
          </div>
        ))}
      </div>

      <div className="calc-out">
        <div className="calc-out-main">
          <span className="stat-n green">{usd(reserveUsd)}</span>
          <span className="stat-l">of Zcash bought into the reserve, before conversion costs</span>
        </div>
        <div className="calc-out-side">
          <SmallInput label="ZEC price (optional)" value={zecPrice} onChange={setZecPrice} prefix="$" />
          <div className="calc-out-coins">
            {zp > 0 ? (
              <>
                <span className="stat-n">{num(reserveUsd / zp, 2)}</span>
                <span className="stat-l">ZEC into the reserve</span>
              </>
            ) : (
              <span className="stat-l">add a ZEC price to see coins</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- loop 02

export function FurnaceCalc() {
  const [vol, setVol] = useState(100_000)
  const [feePct, setFeePct] = useState(String(ZZEC_MARKET.poolFeePct.toFixed(2)))
  const [sharePct, setSharePct] = useState(String(ZZEC_MARKET.furnaceSharePct))
  const [zealPrice, setZealPrice] = useState('')

  const fee = (vol * toNum(feePct)) / 100
  const toFurnace = (fee * toNum(sharePct)) / 100
  const zpr = toNum(zealPrice)

  return (
    <div className="calc" data-reveal>
      <div className="money-head">
        <span className="mono">LOOP 02 · CALCULATOR</span>
        <h3 className="h3">
          For every <span className="green">{usd(vol)}</span> of {TOKEN.wrapper} traded
        </h3>
      </div>

      <VolumeInput label={`${TOKEN.wrapper} volume`} value={vol} onChange={setVol} />

      <div className="calc-assume">
        <SmallInput label="pool fee" value={feePct} onChange={setFeePct} suffix="%" />
        <SmallInput label="share to Furnace" value={sharePct} onChange={setSharePct} suffix="%" />
        <p className="calc-note">
          The {TOKEN.wrapper} market charges {ZZEC_MARKET.poolFeePct.toFixed(2)}% per trade: {ZZEC_MARKET.lpFeePct}% to
          liquidity providers and {ZZEC_MARKET.hookFeePct}% taken by a hook contract straight to the Furnace, whoever
          provides the liquidity. Volume a small pool can carry is limited by its depth.
        </p>
      </div>

      <div className="money-rows" aria-live="polite">
        <div className="money-row money-row-top">
          <span>Pool fee at {num(toNum(feePct), 2)}%</span>
          <span className="mono">{usd(fee)}</span>
        </div>
        <div className="money-row">
          <span>
            <em className="green">{num(toNum(sharePct), 0)}%</em> to the Furnace
            <small>Collected, swapped for ${TOKEN.symbol}, sent to the burn address. No other exit.</small>
          </span>
          <span className="mono">{usd(toFurnace)}</span>
        </div>
      </div>

      <div className="calc-out">
        <div className="calc-out-main">
          <span className="stat-n green">{usd(toFurnace)}</span>
          <span className="stat-l">of ${TOKEN.symbol} bought and burned</span>
        </div>
        <div className="calc-out-side">
          <SmallInput
            label={`$${TOKEN.symbol} price (optional)`}
            value={zealPrice}
            onChange={setZealPrice}
            prefix="$"
          />
          <div className="calc-out-coins">
            {zpr > 0 ? (
              <>
                <span className="stat-n">{num(toFurnace / zpr, 0)}</span>
                <span className="stat-l">${TOKEN.symbol} sent to 0x…dEaD</span>
              </>
            ) : (
              <span className="stat-l">add a ${TOKEN.symbol} price to see tokens</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
