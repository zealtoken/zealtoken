import { useEffect, useState } from 'react'
import { CONTRACTS, PONS_V2, TOKEN } from '../config'
import { SEL, encAddress, hexToBig, readBatchRaw, units, word, wordAddress } from '../lib/chain'

/**
 * The fee route, read live from Pons's own contracts. Where creator fees go
 * today, whether a change to the Tap has been proposed, and when it executes.
 * Nothing here is ours to edit: it is the factory and hook state, verbatim.
 */
type Route = {
  recipient: string
  proposed: string | null
  effectiveAt: number
  expiresAt: number
  pendingEth: number
  strandedEth: number
}

const POLL_MS = 30_000
const ZERO_WORD = '0x' + '0'.repeat(64)
const same = (a: string, b: string | null) => !!b && a.toLowerCase() === b.toLowerCase()
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

async function fetchRoute(signal: AbortSignal): Promise<Route> {
  const pool = PONS_V2.poolId.slice(2)
  const [launch, pending, pendingFees, stranded] = await readBatchRaw(
    [
      { to: PONS_V2.hook, data: SEL.launches + pool },
      { to: PONS_V2.factory, data: SEL.pendingCreatorFeeRecipient + encAddress(TOKEN.address ?? PONS_V2.factory) },
      { to: PONS_V2.hook, data: SEL.pendingFees + pool + '0'.repeat(64) },
      { to: PONS_V2.escrow, data: SEL.balanceOf + encAddress(CONTRACTS.foundry ?? PONS_V2.factory) },
    ],
    signal,
  )
  const proposedWord = word(pending, 0)
  return {
    recipient: wordAddress(launch, 4),
    proposed: proposedWord === ZERO_WORD ? null : '0x' + proposedWord.slice(-40),
    effectiveAt: Number(hexToBig(word(pending, 1))),
    expiresAt: Number(hexToBig(word(pending, 2))),
    pendingEth: units(hexToBig(pendingFees), 18),
    strandedEth: units(hexToBig(stranded), 18),
  }
}

function countdown(to: number, now: number): string {
  const s = Math.max(0, to - now)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** Flip to false to hide the whole panel without touching anything else. */
const VISIBLE = true

export function FeeRoute() {
  const [r, setR] = useState<Route | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        setR(await fetchRoute(ctrl.signal))
      } catch {
        /* keep the last good read */
      }
    }
    void run()
    const t = window.setInterval(run, POLL_MS)
    const clock = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => {
      ctrl.abort()
      window.clearInterval(t)
      window.clearInterval(clock)
    }
  }, [])

  if (!VISIBLE || !r || !PONS_V2.tap || !CONTRACTS.foundry) return null

  const routingLive = same(r.recipient, PONS_V2.tap)
  const deadLetter = same(r.recipient, CONTRACTS.foundry)
  const proposedTap = same(r.proposed ?? '', PONS_V2.tap)

  let stage: 'live' | 'ready' | 'counting' | 'waiting' | 'expired'
  if (routingLive) stage = 'live'
  else if (!r.proposed) stage = 'waiting'
  else if (now >= r.expiresAt) stage = 'expired'
  else if (now >= r.effectiveAt) stage = 'ready'
  else stage = 'counting'

  const headline = {
    live: 'Fees route through the Tap. The machine is running.',
    ready: 'Timelock elapsed. Execution is permissionless and imminent.',
    counting: `Tap change proposed at Pons. Executes in ${countdown(r.effectiveAt, now)}.`,
    waiting: 'Waiting on Pons to propose the recipient change. 3-day timelock starts then.',
    expired: 'Proposal window expired. Needs a fresh proposal from Pons.',
  }[stage]

  return (
    <div className={`route route-${stage}`}>
      <div className="route-head">
        <span className="route-title mono">
          <span className={`dot ${stage === 'live' ? '' : 'dot-wait'}`} /> FEE ROUTE · READ FROM PONS
        </span>
        <span className="route-note mono">factory + hook state, polled every 30s</span>
      </div>
      <p className="route-headline">{headline}</p>
      <div className="route-grid">
        <div className="route-cell">
          <div className="route-l mono">recipient today</div>
          <div className="route-v mono">
            {deadLetter ? 'Foundry key (cannot claim)' : routingLive ? 'Tap v2' : short(r.recipient)}
          </div>
        </div>
        <div className="route-cell">
          <div className="route-l mono">proposed</div>
          <div className="route-v mono">{r.proposed ? (proposedTap ? 'Tap v2' : short(r.proposed)) : 'none yet'}</div>
        </div>
        <div className="route-cell">
          <div className="route-l mono">pending in the hook</div>
          <div className="route-v mono">{r.pendingEth.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH</div>
          <div className="route-h mono">safe · follows the recipient at sweep</div>
        </div>
        <div className="route-cell">
          <div className="route-l mono">credited to the old recipient</div>
          <div className="route-v mono">{r.strandedEth.toLocaleString('en-US', { maximumFractionDigits: 4 })} ETH</div>
          <div className="route-h mono">in Pons escrow</div>
        </div>
      </div>
    </div>
  )
}
