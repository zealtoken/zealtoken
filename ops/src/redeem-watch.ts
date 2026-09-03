import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { zzec, provider } from './chain.js'
import { sendZec, fmtZec } from './zcash.js'

/**
 * Honour redemptions. Watches RedemptionRequested and pays native ZEC to the
 * requested transparent address from the reserve. Idempotent: every handled
 * id is recorded so a restart never pays twice.
 */
const LEDGER = process.env.REDEEM_LEDGER ?? './redemptions.json'
type Rec = Record<string, { txid: string; at: string }>
const load = (): Rec => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {})
const save = (r: Rec) => writeFileSync(LEDGER, JSON.stringify(r, null, 2))

async function main() {
  const c = zzec()
  const done = load()
  const fromBlock = Number(process.env.FROM_BLOCK ?? (await provider.getBlockNumber()) - 50_000)
  console.log(`watching ${await c.getAddress()} from block ${fromBlock}; ${Object.keys(done).length} already paid`)

  const handle = async (id: bigint, from: string, amount: bigint, zaddr: string) => {
    const key = id.toString()
    if (done[key]) return
    console.log(`#${key} ${from} burned ${fmtZec(amount)} -> ${zaddr}`)
    const txid = await sendZec(zaddr, amount, `zZEC redemption #${key}`)
    done[key] = { txid, at: new Date().toISOString() }
    save(done)
    console.log(`#${key} paid  zcash txid ${txid}`)
  }

  const past = await c.queryFilter(c.filters.RedemptionRequested(), fromBlock)
  for (const ev of past) {
    const [id, from, amount, zaddr] = (ev as any).args
    await handle(id, from, amount, zaddr)
  }
  c.on(c.filters.RedemptionRequested(), (id, from, amount, zaddr) => {
    handle(id, from, amount, zaddr).catch((e) => console.error(`#${id} FAILED`, e))
  })
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
