/**
 * Desk watchdog: the humans pay redemptions and confirm wraps, so something has
 * to tell them. Every run lists open redemption requests (with their pay-by
 * deadline), wrap requests that are funded and confirmed, and any role wallet
 * running out of gas. Exit 2 = something needs a human; the launchd wrapper turns
 * that into a notification. Run every 5 minutes.
 */
import { ethers } from 'ethers'
import { CHAIN, CONTRACTS, RESERVE } from './config.js'
import { addressUtxos, chainTip } from './zcash-light.js'
import { existsSync, readFileSync } from 'node:fs'

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const ROLES: Record<string, string> = { attestor: '0xD395C10CF6328dC703d69dFFE7BB7c34D13E67Db', minter: '0xc678772403C67045fa0B2d882f04e24214f1F513', keeper: '0x19cece80126b79F76D8b8297B876310a56349738', fulfiller: '0xb652b03500440dF569a231F82f87E735930a5dE6', deployer: '0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03' }
const MIN_GAS = ethers.parseEther(process.env.MIN_ROLE_ETH ?? '0.004')
const fmt = (z: bigint) => (Number(z) / 1e8).toFixed(8)

async function main() {
  const alerts: string[] = []
  const notes: string[] = []
  // gas
  for (const [role, addr] of Object.entries(ROLES)) { const b = await provider.getBalance(addr); if (b < MIN_GAS) alerts.push(`${role} wallet ${addr} has ${ethers.formatEther(b)} ETH: top up`) }
  // redemption desk
  if (process.env.DESK_ADDRESS) {
    const desk = new ethers.Contract(process.env.DESK_ADDRESS, ['function requestCount() view returns (uint256)', 'function summary(uint256) view returns (address,uint256,uint64,uint8,bytes32)', 'function zcashAddressOf(uint256) view returns (string)'], provider)
    const n = Number(await desk.requestCount())
    for (let i = Math.max(0, n - 200); i < n; i++) {
      const s = await desk.summary(i)
      if (Number(s[3]) !== 1) continue
      const left = Number(s[2]) + 7 * 86400 - Math.floor(Date.now() / 1000)
      const to = await desk.zcashAddressOf(i)
      alerts.push(`REDEEM #${i}: pay ${fmt(BigInt(s[1]))} ZEC to ${to} then fulfil; reclaimable in ${(left / 3600).toFixed(1)}h${left < 24 * 3600 ? ' (LATE: do not pay inside the last 12h)' : ''}`)
    }
  }
  // wrap desk
  if (process.env.WRAP_DESK_ADDRESS) {
    const wd = new ethers.Contract(process.env.WRAP_DESK_ADDRESS, ['function requestCount() view returns (uint256)', 'function summary(uint256) view returns (address,uint256,uint64,uint8,bytes32,uint256)'], provider)
    const n = Number(await wd.requestCount())
    const open: { id: number; deposit: bigint; at: number; amount: bigint }[] = []
    for (let i = Math.max(0, n - 200); i < n; i++) { const s = await wd.summary(i); if (Number(s[3]) === 1) open.push({ id: i, deposit: BigInt(s[5]), at: Number(s[2]), amount: BigInt(s[1]) }) }
    if (open.length && RESERVE.zcashTAddress) {
      const [tip, utxos] = await Promise.all([chainTip(), addressUtxos(RESERVE.zcashTAddress)])
      const nowS = Math.floor(Date.now() / 1000)
      for (const o of open) {
        const minHeight = tip.height - Math.ceil((nowS - o.at) / 75) - 30
        const u = utxos.find((x) => x.valueZat === o.deposit && (x.height === 0 || x.height >= minHeight))
        if (!u) { notes.push(`wrap #${o.id} open, not funded (${fmt(o.deposit)} ZEC expected)`); continue }
        const conf = u.height ? tip.height - u.height + 1 : 0
        if (conf >= 3) alerts.push(`WRAP #${o.id}: funded ${fmt(o.deposit)} ZEC (${conf} conf) -> run WRAP_FULFILL=1 npm run wrap to mint ${fmt(o.amount)} zZEC`)
        else notes.push(`wrap #${o.id} funded, ${conf}/3 confirmations`)
      }
    }
  }
  // Burn-first redemptions made directly on ZZEC (not through the desk) have no escrow and no on-chain record of payment.
  // Anyone can call requestRedeem from the explorer; if nobody pays, a holder is out of pocket. Alert until the ledger records a txid.
  {
    const c = new ethers.Contract(CONTRACTS.zzec, ['event RedemptionRequested(uint256 indexed id, address indexed from, uint256 amount, string zcashAddress)'], provider)
    const ledgerPath = process.env.REDEEM_LEDGER ?? './redemptions.json'
    const raw = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {}
    const entries: Record<string, { txid: string }> = raw.entries ?? raw
    const head = await provider.getBlockNumber()
    const desk = (process.env.DESK_ADDRESS ?? '').toLowerCase()
    const evs = await c.queryFilter(c.filters.RedemptionRequested(), Math.max(0, head - 2_000_000))
    for (const ev of evs) {
      const [id, from, amount, zaddr] = (ev as unknown as { args: [bigint, string, bigint, string] }).args
      if (from.toLowerCase() === desk) continue
      const e = entries[id.toString()]
      if (e && e.txid && e.txid !== 'PENDING') continue
      alerts.push(`DIRECT REDEEM #${id}: ${from} burned ${fmt(amount)} zZEC -> ${zaddr}; pay it, then record the txid in ${ledgerPath}`)
    }
  }
  // zZEC attestation freshness (the attest job has its own alert; this catches a dead scheduler)
  const zz = new ethers.Contract(CONTRACTS.zzec, ['function lastAttestationAt() view returns (uint64)'], provider)
  const ageH = (Date.now() / 1000 - Number(await zz.lastAttestationAt())) / 3600
  if (ageH > 9) alerts.push(`last attestation is ${ageH.toFixed(1)}h old (job runs every 6h): check launchd/attest.err`)
  const stamp = new Date().toISOString()
  for (const n of notes) console.log(`${stamp} note ${n}`)
  if (alerts.length) { for (const a of alerts) console.log(`${stamp} ALERT ${a}`); process.exitCode = 2 }
  else console.log(`${stamp} ok · no open desk work · gas fine · attestation ${ageH.toFixed(1)}h old`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
