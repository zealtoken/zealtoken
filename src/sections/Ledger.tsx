import { useEffect, useRef, useState } from 'react'
import { CHAIN, CONTRACTS, FURNACE, PONS_V2, TOKEN } from '../config'
import { MAX_UINT, SEL, nativeBalance, readBatch, units, view, type Call } from '../lib/chain'
import { FeeRoute } from './FeeRoute'

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
  generated: number // every creator fee $ZEAL has produced: stranded credit + Tap credit + pending in the hook
  earned: number // credited to the Tap in the Pons escrow: claimable by anyone via pull()
  pending: number // ETH sitting in the Foundry, awaiting route()
  feesRouted: number
  toReserve: number
  zecHeld: number
  zzecSupply: number
  coverage: number | null
  zealBurned: number
  burns: number
  ethSpent: number // ETH the Furnace swapped into $ZEAL, lifetime
  zzecSpent: number // zZEC the Furnace swapped on the way, lifetime
  block: bigint
}

const ZERO: Snapshot = {
  generated: 0,
  earned: 0,
  pending: 0,
  feesRouted: 0,
  toReserve: 0,
  zecHeld: 0,
  zzecSupply: 0,
  coverage: null,
  zealBurned: 0,
  burns: 0,
  ethSpent: 0,
  zzecSpent: 0,
  block: 0n,
}

const POLL_MS = 15_000

/** The reserve's actual on-chain ZEC, via /api/reserve (lightwalletd). Null until the first read. */
function useLiveReserve(): { zec: number; height: number } | null {
  const [v, setV] = useState<{ zec: number; height: number } | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const r = await fetch('/api/reserve', { signal: ctrl.signal, cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { zec: number; height: number }
        setV({ zec: j.zec, height: j.height })
      } catch {
        /* keep the last read */
      }
    }
    void run()
    const t = window.setInterval(run, 60_000)
    return () => {
      ctrl.abort()
      window.clearInterval(t)
    }
  }, [])
  return v
}

async function fetchSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const calls: Call[] = []
  type Key = keyof Snapshot | 'stranded' | 'hookPending'
  const idx: Partial<Record<Key, number>> = {}
  const push = (key: Key, c: Call) => {
    idx[key] = calls.length
    calls.push(c)
  }

  if (CONTRACTS.foundry) {
    // Pons V2 credits creator fees to the recipient inside its escrow. Only a
    // credit under the Tap is claimable; the credit under the old Foundry
    // recipient is unclaimable by anyone and is shown, labelled, in the fee
    // route panel instead of here.
    if (PONS_V2.tap) push('earned', view(PONS_V2.escrow, SEL.balanceOf, PONS_V2.tap))
    // Everything $ZEAL has generated so far, wherever it sits: the credit
    // stranded under the old recipient, the Tap's credit, and what is still
    // pending in the hook. Honest traction, separate from what is claimable.
    push('stranded', view(PONS_V2.escrow, SEL.balanceOf, CONTRACTS.foundry))
    push('hookPending', { to: PONS_V2.hook, data: SEL.pendingFees + PONS_V2.poolId.slice(2) + '0'.repeat(64) })
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
    push('ethSpent', view(CONTRACTS.furnace, SEL.totalEthConsumed))
    push('zzecSpent', view(CONTRACTS.furnace, SEL.totalZzecConsumed))
  }

  // Zero calls still returns the block: the chain read is what keeps the
  // panel honest and alive before there is anything to count.
  const { values, block } = await readBatch(calls, signal)
  const get = (k: Key) => (idx[k] === undefined ? 0n : values[idx[k]!])
  const cov = get('coverage')

  return {
    generated: units(get('stranded') + get('earned') + get('hookPending'), 18),
    earned: units(get('earned'), 18),
    pending: units(get('pending'), 18),
    feesRouted: units(get('feesRouted'), 18),
    toReserve: units(get('toReserve'), 18),
    zecHeld: units(get('zecHeld'), 8),
    zzecSupply: units(get('zzecSupply'), 8),
    coverage: CONTRACTS.zzec ? (cov === MAX_UINT ? null : Number(cov) / 10_000) : null,
    zealBurned: units(get('zealBurned'), 18),
    burns: Number(get('burns')),
    ethSpent: units(get('ethSpent'), 18),
    zzecSpent: units(get('zzecSpent'), 8),
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
    const from = shown
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
  small = false,
}: {
  value: number
  unit: string
  label: string
  frac: number
  hint?: string
  small?: boolean
}) {
  const shown = useCountUp(value)
  return (
    <div className="lg-stat">
      <div className={`lg-n ${small ? 'lg-n-sm' : ''}`}>
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

  const live = useLiveReserve()
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
            <Stat value={snap.generated} unit="ETH" label="fees generated" frac={5} hint="all creator fees so far · see fee route below" />
            <Stat value={snap.earned} unit="ETH" label="claimable fees" frac={5} hint="credited to the Tap · anyone can pull()" />
            <Stat
              value={snap.pending}
              unit="ETH"
              label="in the Foundry"
              frac={5}
              hint={snap.pending > 0 ? 'awaiting route()' : 'nothing routed yet'}
            />
            <Stat value={snap.feesRouted} unit="ETH" label="fees routed" frac={5} />
            <Stat value={snap.toReserve} unit="ETH" label="to the reserve" frac={5} />
            <Stat value={snap.zecHeld} unit="ZEC" label="ZEC attested" frac={4} hint="last attestation on-chain" />
            <Stat
              value={live?.zec ?? 0}
              unit="ZEC"
              label="ZEC in reserve"
              frac={4}
              hint={live ? `live · Zcash block ${live.height.toLocaleString('en-US')}` : 'reading Zcash…'}
            />
            <Stat value={snap.zzecSupply} unit={TOKEN.wrapper} label={`${TOKEN.wrapper} minted`} frac={2} hint={coverageHint} />
          </div>
        </div>

        <div className="lg-col">
          <div className="lg-grp mono">LOOP 02 · THE FURNACE</div>
          <div className="lg-grid">
            <Stat value={snap.zealBurned} unit={TOKEN.symbol} label={`$${TOKEN.symbol} burned`} frac={0} hint={`→ ${FURNACE.burnShort}`} />
            <Stat value={snap.burns} unit="tx" label="burns" frac={0} hint="permissionless" />
            <Stat value={snap.ethSpent} unit="ETH" label="spent buying back" frac={6} hint="fees swapped into $ZEAL" small />
            <Stat value={snap.zzecSpent} unit={TOKEN.wrapper} label={`${TOKEN.wrapper} fees converted`} frac={6} hint="sold for ETH on the way" small />
          </div>
          <div className="lg-note mono">
            {contractsLive
              ? 'read from the contracts every 15s · nothing here is editable'
              : 'counters start at trade one · block number is live now'}
          </div>
        </div>
      </div>

      <FeeRoute />

      <div className="lg-flow" aria-hidden="true">
        <span className="lg-flow-line" />
        <span className="lg-flow-text mono">
          ${TOKEN.symbol} trades → fees → ZEC reserve → {TOKEN.wrapper} minted → {TOKEN.wrapper} trades → fees → ${TOKEN.symbol} burned
        </span>
      </div>
    </div>
  )
}
