import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { zzec, provider } from './chain.js'
import { sendZec, fmtZec } from './zcash.js'

/**
 * Honour redemptions. Watches RedemptionRequested and pays native ZEC to the
 * requested transparent address from the reserve.
 *
 * Safety properties:
 *  - One send at a time. Events are queued and processed serially, so two
 *    redemptions in one block cannot race the wallet's note selection.
 *  - The ledger records PENDING before the wallet is asked to send. If the
 *    process dies between broadcast and record, the id is left PENDING and is
 *    never auto-retried: it is listed on startup for manual reconciliation
 *    against the wallet's transaction list. Paying twice is the failure mode
 *    this design refuses to have.
 *  - The last processed block is persisted, so a restart resumes where it
 *    stopped instead of guessing a window.
 */
const LEDGER = process.env.REDEEM_LEDGER ?? './redemptions.json'
type Entry = { txid: string; at: string; amountZats?: string; to?: string }
type Ledger = { entries: Record<string, Entry>; lastBlock?: number }
const load = (): Ledger => {
  if (!existsSync(LEDGER)) return { entries: {} }
  const raw = JSON.parse(readFileSync(LEDGER, 'utf8'))
  return raw.entries ? raw : { entries: raw } // migrate the flat v0 shape
}
const save = (l: Ledger) => writeFileSync(LEDGER, JSON.stringify(l, null, 2))

async function main() {
  const c = zzec()
  const ledger = load()
  const pending = Object.entries(ledger.entries).filter(([, e]) => e.txid === 'PENDING')
  if (pending.length) {
    console.error(`!! ${pending.length} redemption(s) are PENDING from a previous run and will NOT be retried automatically:`)
    for (const [id, e] of pending) console.error(`   #${id} ${e.amountZats} zat -> ${e.to} (started ${e.at}). Check the wallet; then set txid or delete the entry.`)
  }
  const fromBlock = Number(process.env.FROM_BLOCK ?? ledger.lastBlock ?? (await provider.getBlockNumber()) - 50_000)
  console.log(`watching ${await c.getAddress()} from block ${fromBlock}; ${Object.keys(ledger.entries).length} recorded`)

  type Job = { id: bigint; from: string; amount: bigint; zaddr: string; block: number }
  const queue: Job[] = []
  const seen = new Set<string>()
  let running = false

  // lastBlock only advances once nothing older is still queued, so a crash mid-backlog never skips a redemption.
  let highest = 0
  const done = (block: number) => {
    highest = Math.max(highest, block)
    if (queue.length === 0) ledger.lastBlock = Math.max(ledger.lastBlock ?? 0, highest)
    save(ledger)
  }
  const pump = async () => {
    if (running) return
    running = true
    try {
      while (queue.length) {
        const j = queue.shift()!
        const key = j.id.toString()
        if (ledger.entries[key]) { done(j.block); continue }
        console.log(`#${key} ${j.from} burned ${fmtZec(j.amount)} -> ${j.zaddr}`)
        ledger.entries[key] = { txid: 'PENDING', at: new Date().toISOString(), amountZats: j.amount.toString(), to: j.zaddr }
        save(ledger)
        try {
          const txid = await sendZec(j.zaddr, j.amount)
          ledger.entries[key] = { ...ledger.entries[key], txid }
          done(j.block)
          console.log(`#${key} paid  zcash txid ${txid}`)
        } catch (e) {
          // Left PENDING on purpose: the send may or may not have broadcast.
          console.error(`#${key} send did not return a txid; left PENDING for manual reconciliation`, e)
        }
      }
    } finally {
      running = false
    }
  }
  const desk = (process.env.DESK_ADDRESS ?? '').toLowerCase()
  const enqueue = (id: bigint, from: string, amount: bigint, zaddr: string, block: number) => {
    const key = id.toString()
    // Redemptions burned by the Desk were already paid (fulfil() runs after the ZEC is sent). Never pay them again.
    if (desk && from.toLowerCase() === desk) { console.log(`#${key} burned by the Redemption Desk; already paid, skipping`); return }
    if (seen.has(key)) return
    seen.add(key)
    queue.push({ id, from, amount, zaddr, block })
    void pump()
  }

  // Subscribe first, then backfill, so nothing between "tip" and "listening" is lost.
  c.on(c.filters.RedemptionRequested(), (id, from, amount, zaddr, ev) => enqueue(id, from, amount, zaddr, Number(ev?.log?.blockNumber ?? 0)))
  let past
  try {
    past = await c.queryFilter(c.filters.RedemptionRequested(), fromBlock)
  } catch (e) {
    // Running live-only would silently skip the gap and then advance lastBlock past it. Refuse.
    console.error('backfill failed; refusing to run live-only', e instanceof Error ? e.message : e)
    await c.removeAllListeners()
    process.exit(1)
  }
  for (const ev of past) {
    const [id, from, amount, zaddr] = (ev as unknown as { args: [bigint, string, bigint, string] }).args
    enqueue(id, from, amount, zaddr, ev.blockNumber)
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
