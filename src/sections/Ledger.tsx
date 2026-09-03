import { useEffect, useRef, useState } from 'react'
import { CHAIN, CONTRACTS, FURNACE, PONS_V2, TOKEN } from '../config'
import { MAX_UINT, SEL, nativeBalance, readBatch, units, view, type Call } from '../lib/chain'

/**
 * The ledger: both loops side by side, every lifetime counter the contracts
 * expose, read live from Robinhood Chain.
 *
 * It is alive before launch. The block number is read from chain on every
 * poll regardless of whether the contracts exist yet, so the panel ticks
 * from day one; the contract counters switch on the moment their addresses
 * land in config.ts.
 */

type Snapshot = {
  earned: number // credited to our recipient(s) in the Pons escrow, awaiting claim
  pending: number // ETH sitting in the Foundry, awaiting route()
  feesRouted: number
  toReserve: number
  zecHeld: number
  zzecSupply: number
  coverage: number | null
  zealBurned: number
  burns: number
  block: bigint
}

const ZERO: Snapshot = {
  earned: 0,
  pending: 0,
  feesRouted: 0,
  toReserve: 0,
  zecHeld: 0,
  zzecSupply: 0,
  coverage: null,
  zealBurned: 0,
  burns: 0,
  block: 0n,
}

const POLL_MS = 15_000

async function fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const calls: Call[] = []
  const idx: Partial<Record<keyof Snapshot | 'earnedTap', number>> = {}
  const push = (key: keyof Snapshot | 'earnedTap', c: Call) => {
    idx[key] = calls.length
    calls.push(c)
  }

  if (CONTRACTS.foundry) {
    // Pons V2 pays $ZEAL fees in native ETH. They are credited to the fee
    // recipient inside the escrow first; that balance is what moves on every
    // trade. Read it for the Foundry (the original recipient) and the Tap.
    push('earned', view(PONS_V2.escrow, SEL.balanceOf, CONTRACTS.foundry))
    if (PONS_V2.tap) push('earnedTap', view(PONS_V2.escrow, SEL.balanceOf, PONS_V2.tap))
    // ETH sitting in the Foundry, claimed but not yet split.
    push('pending', nativeBalance(CONTRACTS.foundry))
    push('feesRouted', view(CONTRACTS.foundry, SEL.totalRoutedNative))
    push('toReserve', view(CONTRACTS.foundry, SEL.totalToReserveNative))
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

  // Zero calls still returns the block: the chain read is what keeps the
  // panel honest and alive before there is anything to count.
  const { values, block } = await readBatch(calls, signal)
  const get = (k: keyof Snapshot | 'earnedTap') => (idx[k] === undefined ? 0n : values[idx[k]!])
  const cov = get('coverage')

  return {
    earned: units(get('earned') + get('earnedTap'), 18),
    pending: units(get('pending'), 18),
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

function useCountUp(target: number, ms = 900): number {
  const [shown, setShown] = useState(target)
  const fromRef = useRef(target)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || fromRef.current === target) {
      fromRef.current = target
      setShown(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
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
  n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })

function Stat({
  value,
  unit,
  label,
  frac,
  hint,
}: {
  value: number
  unit: string
  label: string
  frac: number
  hint?: string
}) {
  const shown = useCountUp(value)
  return (
    <div className="lg-stat">
      <div className="lg-n">
        {fmt(shown, frac)}
        <span className="lg-u mono">{unit}</span>
      </div>
      <div className="lg-l mono">{label}</div>
      {hint && <div className="lg-h mono">{hint}</div>}
    </div>
  )
}

export function Ledger() {
  const contractsLive = Boolean(CONTRACTS.foundry || CONTRACTS.zzec || CONTRACTS.furnace)
  const [snap, setSnap] = useState<Snapshot>(ZERO)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [readAt, setReadAt] = useState<number | null>(null)
  const [ago, setAgo] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const s = await fetchSnapshot(ctrl.signal)
        setSnap(s)
        setStatus('ok')
        setReadAt(Date.now())
        setTick((t) => t + 1)
      } catch {
        if (!ctrl.signal.aborted) setStatus('error')
      }
    }
    void run()
    const timer = window.setInterval(run, POLL_MS)
    const onVis = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      ctrl.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // the clock that makes a zero-state panel visibly alive
  useEffect(() => {
    const t = window.setInterval(() => {
      if (readAt) setAgo(Math.max(0, Math.round((Date.now() - readAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(t)
  }, [readAt])

  const coverageHint =
    snap.coverage === null ? 'no supply yet' : `${(snap.coverage * 100).toFixed(2)}% covered`

  return (
    <div className="ledger" aria-live="polite">
      <div className="lg-head">
        <span className="lg-title mono">
          <span className={`dot ${status === 'error' ? 'dot-err' : ''}`} />
          {contractsLive ? 'LIVE LEDGER' : 'LIVE LEDGER · READING CHAIN'}
        </span>
        <span className="lg-meta mono">
          {status === 'ok' && (
            <>
              <span className="lg-block" key={tick}>
                block {snap.block.toLocaleString('en-US')}
              </span>
              <span className="lg-sep">·</span>
              <span>read {ago}s ago</span>
            </>
          )}
          {status === 'error' && 'rpc unreachable · retrying'}
          {status === 'idle' && `reading chain ${CHAIN.id}…`}
        </span>
      </div>

      <div className="lg-cols">
        <div className="lg-col">
          <div className="lg-grp mono">LOOP 01 · THE FOUNDRY</div>
          <div className="lg-grid">
            <Stat value={snap.earned} unit="ETH" label="fees earned" frac={4} hint="in Pons escrow · awaiting claim" />
            <Stat
              value={snap.pending}
              unit="ETH"
              label="in the Foundry"
              frac={4}
              hint={snap.pending > 0 ? 'awaiting route()' : 'awaiting claim'}
            />
            <Stat value={snap.feesRouted} unit="ETH" label="fees routed" frac={4} />
            <Stat value={snap.toReserve} unit="ETH" label="to the reserve" frac={4} />
            <Stat value={snap.zecHeld} unit="ZEC" label="ZEC held" frac={2} hint="attested" />
            <Stat value={snap.zzecSupply} unit={TOKEN.wrapper} label={`${TOKEN.wrapper} minted`} frac={2} hint={coverageHint} />
          </div>
        </div>

        <div className="lg-col">
          <div className="lg-grp mono">LOOP 02 · THE FURNACE</div>
          <div className="lg-grid">
            <Stat value={snap.zealBurned} unit={TOKEN.symbol} label={`$${TOKEN.symbol} burned`} frac={0} hint={`→ ${FURNACE.burnShort}`} />
            <Stat value={snap.burns} unit="tx" label="burns" frac={0} hint="permissionless" />
          </div>
          <div className="lg-note mono">
            {contractsLive
              ? 'read from the contracts every 15s · nothing here is editable'
              : 'counters start at trade one · block number is live now'}
          </div>
        </div>
      </div>

      <div className="lg-flow" aria-hidden="true">
        <span className="lg-flow-line" />
        <span className="lg-flow-text mono">
          ${TOKEN.symbol} trades → fees → ZEC reserve → {TOKEN.wrapper} minted → {TOKEN.wrapper} trades → fees → ${TOKEN.symbol} burned
        </span>
      </div>
    </div>
  )
}
