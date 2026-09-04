import { ethers } from 'ethers'
import { existsSync, readFileSync } from 'node:fs'
import { zzec, roleSigner } from './chain.js'
import { fmtZec, reserveBalanceZats } from './zcash.js'
import { RESERVE } from './config.js'

/**
 * Mint zZEC up to the attested reserve. Usage:
 *   MINT_TO=0x... MINT_ZEC=12.5 npm run mint
 * MINT_ALL=1 instead of MINT_ZEC mints all remaining headroom.
 * The amount is also capped by the LIVE confirmed Zcash balance minus supply,
 * minus any redemption payouts the watcher has started but not confirmed.
 */
/** Zats of redemptions the watcher has started but not yet recorded as confirmed. */
function pendingPayoutsZats(): bigint {
  const file = process.env.REDEEM_LEDGER ?? './redemptions.json'
  if (!existsSync(file)) return 0n
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const entries: Record<string, { txid: string; amountZats?: string }> = raw.entries ?? raw
  return Object.values(entries).filter((e) => e.txid === 'PENDING').reduce((s, e) => s + BigInt(e.amountZats ?? '0'), 0n)
}

async function main() {
  const to = process.env.MINT_TO
  if (!to || !ethers.isAddress(to)) throw new Error('MINT_TO must be an address')
  const c = zzec(await roleSigner('minter'))
  const [reserve, supply, fresh, paused] = (await Promise.all([c.reserveZats(), c.totalSupply(), c.attestationIsFresh(), c.mintingPaused()])) as [bigint, bigint, boolean, boolean]
  const headroom = reserve - supply
  console.log(`reserve ${fmtZec(reserve)}  supply ${fmtZec(supply)}  headroom ${fmtZec(headroom)}`)
  if (!fresh) throw new Error('attestation is stale; run attest first')
  if (paused) throw new Error('minting is paused')
  const raw = process.env.MINT_ZEC
  if (raw !== undefined && !/^\d+(\.\d+)?$/.test(raw)) throw new Error('MINT_ZEC must be a positive decimal, e.g. 2.14')
  if (raw === undefined && process.env.MINT_ALL !== '1') throw new Error('set MINT_ZEC=<amount> or MINT_ALL=1')
  const want: bigint = raw !== undefined ? BigInt(Math.round(parseFloat(raw) * 1e8)) : headroom
  const live = await reserveBalanceZats(RESERVE.zcashTAddress)
  const inflight = pendingPayoutsZats()
  const liveHeadroom = live > supply + inflight ? live - supply - inflight : 0n
  if (inflight > 0n) console.log(`in-flight redemption payouts ${fmtZec(inflight)} (subtracted)`)
  console.log(`live ZEC ${fmtZec(live)}  -> live headroom ${fmtZec(liveHeadroom)}`)
  if (want <= 0n) throw new Error('nothing to mint')
  if (want > headroom) throw new Error(`requested ${fmtZec(want)} exceeds attested headroom ${fmtZec(headroom)}`)
  if (want > liveHeadroom) throw new Error(`requested ${fmtZec(want)} exceeds LIVE headroom ${fmtZec(liveHeadroom)}; re-attest or wait for confirmations`)
  const tx = await c.mint(to, want)
  console.log(`mint ${fmtZec(want)} -> ${to}  ${tx.hash}`)
  await tx.wait()
  console.log('done')
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
