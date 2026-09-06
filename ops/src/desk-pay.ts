/**
 * Automatic redemption payer. Runs every 5 minutes from launchd.
 *
 * For every OPEN request on the Redemption Desk that is not yet in the payout
 * ledger, and is within the automatic limits, it pays native ZEC from a small
 * HOT FLOAT wallet (zingo-cli, its own seed, never the reserve key), records the
 * Zcash txid, and calls desk.fulfill(id, txid) with the fulfiller key, which
 * burns the escrow. Anything outside the limits is left for a human and the
 * watchdog keeps alerting on it.
 *
 * Safety:
 *  - Ledger-first: PENDING is written before the wallet is asked to send; a
 *    crash between broadcast and record leaves PENDING, which is never retried
 *    automatically (paying twice is the one failure this refuses to have).
 *  - Per-request cap DESK_AUTO_MAX_ZEC (default 0.05) and rolling 24h cap
 *    DESK_AUTO_DAILY_ZEC (default 0.25). Above either: manual.
 *  - Never pays inside the last 12h of the reclaim window.
 *  - Refuses if the float cannot cover amount + fee reserve.
 */
import { ethers } from 'ethers'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CHAIN, RESERVE, requireEnv } from './config.js'
import { roleSigner } from './chain.js'
import { sendZec } from './zcash.js'

const run = promisify(execFile)
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const LEDGER = process.env.DESK_LEDGER ?? new URL('../desk-ledger.json', import.meta.url).pathname
const MAX = BigInt(Math.round(Number(process.env.DESK_AUTO_MAX_ZEC ?? '0.05') * 1e8))
const DAILY = BigInt(Math.round(Number(process.env.DESK_AUTO_DAILY_ZEC ?? '0.25') * 1e8))
const FEE_RESERVE = 20_000n // zats kept back for the network fee
const WINDOW = 7 * 86400, LATE = 12 * 3600
const ABI = ['function requestCount() view returns (uint256)', 'function getRequest(uint256) view returns (tuple(address holder,uint256 amount,string zcashAddress,uint64 requestedAt,uint8 status,bytes32 zcashTxid,uint256 zzecRedemptionId))', 'function fulfill(uint256,bytes32)', 'function operator() view returns (address)']
type Entry = { txid: string; at: string; amountZats: string; to: string; fulfilTx?: string }
type Ledger = Record<string, Entry>
const load = (): Ledger => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {})
const save = (l: Ledger) => writeFileSync(LEDGER, JSON.stringify(l, null, 2))
const fmt = (z: bigint) => (Number(z) / 1e8).toFixed(8)

/** Confirmed transparent+shielded balance of the float wallet, in zats, via zingo-cli. */
async function floatBalanceZats(): Promise<bigint> {
  const bin = process.env.ZINGO_CLI ?? 'zingo-cli'
  const args = ['--server', RESERVE.lightwalletd]
  if (process.env.ZINGO_DATA) args.push('--data-dir', process.env.ZINGO_DATA)
  // zingo-cli prints a bracketed key: value list, not JSON. Read the confirmed lines.
  const { stdout } = await run(bin, [...args, '--waitsync', 'balance'], { maxBuffer: 4 << 20 })
  // zingo groups digits with underscores (10_007_000); strip them before parsing
  const pick = (k: string) => { const m = stdout.match(new RegExp(k + '"?\\s*:\\s*([\\d_]+)')); return m ? BigInt(m[1].replace(/_/g, '')) : 0n }
  // Transparent funds (a top-up sent to the t-address) cannot be spent until shielded. Shield them and let them confirm; only shielded funds count as spendable.
  const t = pick('confirmed_transparent_balance')
  if (t > 50_000n) { try { const { stdout: sh } = await run(bin, [...args, '--waitsync', 'quickshield'], { maxBuffer: 4 << 20 }); console.log(`float: shielding ${fmt(t)} ZEC of transparent top-up: ${(sh.match(/[0-9a-f]{64}/) ?? ['?'])[0]}`) } catch (e) { console.error('float: shield failed', (e as Error).message.slice(0, 160)) } }
  return pick('confirmed_sapling_balance') + pick('confirmed_orchard_balance')
}

async function main() {
  const desk = new ethers.Contract(requireEnv('DESK_ADDRESS'), ABI, provider)
  const ledger = load()
  const stuck = Object.entries(ledger).filter(([, e]) => e.txid === 'PENDING')
  for (const [id, e] of stuck) console.error(`!! #${id} is PENDING from an earlier run (${e.amountZats} zat -> ${e.to} at ${e.at}); check the float wallet's history, then set txid or delete the entry. Not retried.`)
  const n = Number(await desk.requestCount())
  const now = Math.floor(Date.now() / 1000)
  const paid24 = Object.values(ledger).filter((e) => e.txid !== 'PENDING' && Date.parse(e.at) > Date.now() - 86400e3).reduce((s, e) => s + BigInt(e.amountZats), 0n)
  let budget = DAILY > paid24 ? DAILY - paid24 : 0n
  const todo: { id: number; amount: bigint; to: string; at: number }[] = []
  for (let i = Math.max(0, n - 300); i < n; i++) {
    const r = await desk.getRequest(i)
    if (Number(r.status) !== 1) continue
    const key = String(i), amount = BigInt(r.amount), at = Number(r.requestedAt)
    if (ledger[key]) { if (ledger[key].txid !== 'PENDING' && !ledger[key].fulfilTx) todo.push({ id: i, amount, to: r.zcashAddress, at }); continue } // paid, fulfil still owed
    const left = at + WINDOW - now
    if (left < LATE) { console.log(`#${i} skipped: reclaimable in ${(left / 3600).toFixed(1)}h, too late to pay safely`); continue }
    if (amount > MAX) { console.log(`#${i} ${fmt(amount)} ZEC is above the automatic cap ${fmt(MAX)}: manual`); continue }
    if (amount > budget) { console.log(`#${i} ${fmt(amount)} ZEC exceeds the remaining 24h budget ${fmt(budget)}: manual or wait`); continue }
    budget -= amount
    todo.push({ id: i, amount, to: r.zcashAddress, at })
  }
  if (!todo.length) { console.log(`${new Date().toISOString()} nothing to pay (${n} requests)`); return }
  const signer = await roleSigner('fulfiller')
  if ((await desk.operator()).toLowerCase() !== signer.address.toLowerCase()) throw new Error('fulfiller key is not the desk operator')
  const d = desk.connect(signer) as ethers.Contract
  for (const t of todo) {
    const key = String(t.id)
    let txid = ledger[key]?.txid
    if (!txid) {
      const bal = await floatBalanceZats()
      if (bal < t.amount + FEE_RESERVE) { console.error(`#${t.id} float has ${fmt(bal)} ZEC, needs ${fmt(t.amount + FEE_RESERVE)}: TOP UP THE FLOAT`); process.exitCode = 2; continue }
      ledger[key] = { txid: 'PENDING', at: new Date().toISOString(), amountZats: t.amount.toString(), to: t.to }; save(ledger)
      try { txid = await sendZec(t.to, t.amount) } catch (e) { console.error(`#${t.id} send returned no txid; left PENDING`, (e as Error).message); process.exitCode = 2; continue }
      ledger[key].txid = txid; save(ledger)
      console.log(`#${t.id} paid ${fmt(t.amount)} ZEC -> ${t.to}  zcash ${txid}`)
    }
    try {
      const tx = await d.fulfill(t.id, '0x' + txid.replace(/^0x/, ''))
      await tx.wait(); ledger[key].fulfilTx = tx.hash; save(ledger)
      console.log(`#${t.id} fulfilled on chain ${tx.hash}: escrow burned, txid recorded`)
    } catch (e) { console.error(`#${t.id} paid but fulfil failed (${(e as Error).message}); will retry next run`); process.exitCode = 2 }
  }
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
