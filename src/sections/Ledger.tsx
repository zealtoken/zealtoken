import { useEffect, useRef, useState } from 'react'
import { CHAIN, CONTRACTS, PONS, TOKEN } from '../config'
import { MAX_UINT, SEL, readBatch, units, view, type Call } from '../lib/chain'

/**
 * The ledger: every lifetime counter the three contracts expose, read live
 * from chain and shown in the hero. Before the contracts deploy it renders
 * the same rows at zero with a pre-launch tag, and switches itself on the
 * moment addresses land in config.ts.
 */

type Snapshot = {
  feesRouted: number // WETH through the Foundry, in ETH
  toReserve: number // WETH sent to the reserve sink, in ETH
  zecHeld: number // attested native ZEC
  zzecSupply: number
  coverage: number | null // ratio; null when no supply
  zealBurned: number
  burns: number
  block: bigint
}

const ZERO: Snapshot = {
  feesRouted: 0,
  toReserve: 0,
  zecHeld: 0,
  zzecSupply: 0,
  coverage: null,
  zealBurned: 0,
  burns: 0,
  block: 0n,
}

const POLL_MS = 30_000

async function fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const calls: Call[] = []
  const idx: Partial<Record<keyof Snapshot, number>> = {}
  const push = (key: keyof Snapshot, c: Call) => {
    idx[key] = calls.length
    calls.push(c)
  }

  if (CONTRACTS.foundry) {
    push('feesRouted', view(CONTRACTS.foundry, SEL.totalRouted, PONS.weth))
    push('toReserve', view(CONTRACTS.foundry, SEL.totalToReserve, PONS.weth))
  }
  if (CONTRACTS.zzec) {
    push('zecHeld', view(CONTRACTS.zzec, SEL.reserveZats))
    push('zzecSupply', view(CONTRACTS.zzec, SEL.totalSupply))
    push('coverage', view(CONTRACTS.zzec, SEL.coverageBps))
  }
  if (CONTRACTS.furnace) {
    push('zealBurned', view(CONTRACTS.furnace, SEL.totalZealBurned))
    push('burns', view(CONTRACTS.furnace, SEL.burnCount))
  }
  if (calls.length === 0) return ZERO

  const { values, block } = await readBatch(calls, signal)
  const get = (k: keyof Snapshot) => (idx[k] === undefined ? 0n : values[idx[k]!])

  const cov = get('coverage')
  return {
    feesRouted: units(get('feesRouted'), 18),
    toReserve: units(get('toReserve'), 18),
    zecHeld: units(get('zecHeld'), 8),
    zzecSupply: units(get('zzecSupply'), 8),
    coverage: CONTRACTS.zzec ? (cov === MAX_UINT ? null : Number(cov) / 10_000) : null,
    zealBurned: units(get('zealBurned'), 18),
    burns: Number(get('burns')),
    block,
  }
}

/** Eases a displayed number toward its target so updates read as motion, not jumps. */
function useCountUp(target: number, ms = 900): number {
  const [shown, setShown] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || fromRef.current === target) {
      fromRef.current = target
      setShown(target)
      return
    }
    const from = fromRef.current
    startRef.current = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / ms)
      const e = 1 - Math.pow(1 - t, 3)
      setShown(from + (target - from) * e)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return shown
}

const fmt = (n: number, maxFrac: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 })

function Row({
  label,
  value,
  unit,
  frac,
  hint,
}: {
  label: string
  value: number
  unit: string
  frac: number
  hint?: string
}) {
  const shown = useCountUp(value)
  return (
    <div className="ledger-row">
      <span className="ledger-l mono">{label}</span>
      <span className="ledger-v">
        <span className="ledger-n">{fmt(shown, frac)}</span>
        <span className="ledger-u mono">{unit}</span>
      </span>
      {hint && <span className="ledger-h mono">{hint}</span>}
    </div>
  )
}

export function Ledger() {
  const live = Boolean(CONTRACTS.foundry || CONTRACTS.zzec || CONTRACTS.furnace)
  const [snap, setSnap] = useState<Snapshot>(ZERO)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!live) return
    const ctrl = new AbortController()
    let timer = 0

    const run = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const s = await fetchSnapshot(ctrl.signal)
        setSnap(s)
        setStatus('ok')
        setTick((t) => t + 1)
      } catch {
        if (!ctrl.signal.aborted) setStatus('error')
      }
    }

    void run()
    timer = window.setInterval(run, POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      ctrl.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [live])

  const coverageText =
    snap.coverage === null ? 'no supply yet' : `${(snap.coverage * 100).toFixed(2)}% covered`

  return (
    <div className="ledger" aria-live="polite" data-tick={tick}>
      <div className="ledger-head">
        <span className="ledger-title mono">
          {live ? <span className="dot" /> : <span className="dot dot-idle" />}
          {live ? 'LIVE LEDGER' : 'LEDGER · PRE-LAUNCH'}
        </span>
        <span className="ledger-block mono">
          {live && status === 'ok'
            ? `block ${snap.block.toLocaleString('en-US')}`
            : live && status === 'error'
              ? 'rpc unreachable'
              : `chain ${CHAIN.id}`}
        </span>
      </div>

      <div className="ledger-grp mono">LOOP 01 · THE FOUNDRY</div>
      <Row label="fees routed" value={snap.feesRouted} unit="ETH" frac={4} />
      <Row label="to the reserve" value={snap.toReserve} unit="ETH" frac={4} />
      <Row label="ZEC held" value={snap.zecHeld} unit="ZEC" frac={2} hint="attested" />
      <Row label={`${TOKEN.wrapper} minted`} value={snap.zzecSupply} unit={TOKEN.wrapper} frac={2} hint={coverageText} />

      <div className="ledger-grp mono">LOOP 02 · THE FURNACE</div>
      <Row label={`$${TOKEN.symbol} burned`} value={snap.zealBurned} unit={TOKEN.symbol} frac={0} />
      <Row label="burns" value={snap.burns} unit="tx" frac={0} hint="→ 0x…dEaD" />

      <div className="ledger-foot mono">
        {live
          ? 'read from the contracts every 30s · nothing here is editable'
          : 'counters begin at the first trade · every number reads from chain'}
      </div>
    </div>
  )
}
