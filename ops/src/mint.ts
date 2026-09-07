import { managedSend } from './managed-send.js'
import { ethers } from 'ethers'
import { existsSync, readFileSync } from 'node:fs'
import { zzec, roleSigner } from './chain.js'
import { fmtZec } from './zcash.js'
import { redemptionAccounting, mintCapacity } from './redemption-accounting.js'
import { wrapAccounting } from './wrap-accounting.js'
import { withLock } from './ops-lock.js'

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
  const signer = await roleSigner('minter')
  const c = zzec(signer)
  const [reserve, supply, fresh, paused] = (await Promise.all([c.reserveZats(), c.totalSupply(), c.attestationIsFresh(), c.mintingPaused()])) as [bigint, bigint, boolean, boolean]
  const headroom = reserve - supply
  console.log(`reserve ${fmtZec(reserve)}  supply ${fmtZec(supply)}  headroom ${fmtZec(headroom)}`)
  if (!fresh) throw new Error('attestation is stale; run attest first')
  if (paused) throw new Error('minting is paused')
  const raw = process.env.MINT_ZEC
  if (raw !== undefined && !/^\d+(\.\d+)?$/.test(raw)) throw new Error('MINT_ZEC must be a positive decimal, e.g. 2.14')
  if (raw === undefined && process.env.MINT_ALL !== '1') throw new Error('set MINT_ZEC=<amount> or MINT_ALL=1')
  const wrapping = await wrapAccounting()
  const live = wrapping.live
  const inflight = pendingPayoutsZats()
  const accounting = await redemptionAccounting()
  const liveHeadroom = mintCapacity(live, accounting.supply, accounting.reimbursementZats, inflight + wrapping.reserved)
  console.log(`reserved for pending wraps ${fmtZec(wrapping.reserved)}`)
  const want = raw !== undefined ? ethers.parseUnits(raw, 8) : (headroom < liveHeadroom ? headroom : liveHeadroom)
  console.log(`reserved for payout-wallet reimbursement ${fmtZec(accounting.reimbursementZats)}`)
  if (inflight > 0n) console.log(`in-flight redemption payouts ${fmtZec(inflight)} (subtracted)`)
  console.log(`live ZEC ${fmtZec(live)}  -> live headroom ${fmtZec(liveHeadroom)}`)
  if (want <= 0n) throw new Error('nothing to mint')
  if (want > headroom) throw new Error(`requested ${fmtZec(want)} exceeds attested headroom ${fmtZec(headroom)}`)
  if (want > liveHeadroom) throw new Error(`requested ${fmtZec(want)} exceeds LIVE headroom ${fmtZec(liveHeadroom)}; re-attest or wait for confirmations`)
  const desk = process.env.WRAP_DESK_ADDRESS
  const minter = (await c.minter()) as string
  let tx
  if (desk && minter.toLowerCase() === desk.toLowerCase()) {
    const ref = ethers.id(`fee-route:${new Date().toISOString().slice(0, 10)}:${want}`)
    const d = new ethers.Contract(desk, ['function operatorMint(address,uint256,bytes32)'], signer)
    tx = await managedSend(signer, await d.operatorMint.populateTransaction(to, want, ref))
    console.log(`via WrapDesk.operatorMint ref ${ref}`)
  } else tx = await managedSend(signer, await c.mint.populateTransaction(to, want))
  console.log(`mint ${fmtZec(want)} -> ${to}  ${tx.hash}`)
  await tx.wait()
  console.log('done')
}
withLock('issuance', main).catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
