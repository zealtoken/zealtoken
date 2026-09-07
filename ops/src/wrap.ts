import { ethers } from 'ethers'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { provider, roleSigner } from './chain.js'
import { CONTRACTS, RESERVE } from './config.js'
import { redemptionAccounting, mintCapacity } from './redemption-accounting.js'
import { wrapAccounting } from './wrap-accounting.js'
import { RESERVE_NODES } from './reserve-rpc.js'
import { withLock, atomicJson, stateDir } from './ops-lock.js'
import { managedSend } from './managed-send.js'
import { confirmedWrapOutput, requiredWrapConfirmations } from './wrap-policy.js'
import { addressUtxos, chainTip, blockTime } from './zcash-light.js'

/**
 * Wrap desk operator. Lists open wrap requests, matches them to confirmed
 * outputs on the reserve address by their unique deposit amount, and (with
 * WRAP_FULFILL=1) attests if needed and fulfils each match, minting zZEC.
 *
 *   npm run wrap                       list + matches
 *   WRAP_FULFILL=1 npm run wrap        fulfil every confirmed match
 *   WRAP_ID=3 ZEC_TXID=0x... npm run wrap   manual fulfil of one request
 *   WRAP_REJECT=3 REASON="sent 0.9" npm run wrap
 */
const DESK = process.env.WRAP_DESK_ADDRESS
const CONFIRMATIONS = requiredWrapConfirmations(process.env.WRAP_CONFIRMATIONS)
const ABI = ['function requestCount() view returns (uint256)', 'function summary(uint256) view returns (address requester,uint256 amount,uint64 requestedAt,uint8 status,bytes32 zcashTxid,uint256 deposit)', 'function fulfill(uint256,bytes32)', 'function reject(uint256,string)', 'function operator() view returns (address)']
const ZABI = ['function reserveZats() view returns (uint256)', 'function totalSupply() view returns (uint256)', 'function attestationIsFresh() view returns (bool)', 'function minter() view returns (address)']
const fmt = (z: bigint) => (Number(z) / 1e8).toFixed(8)
const JOURNAL = `${stateDir}wrap.json`
const LEDGER = process.env.REDEEM_LEDGER ?? './redemptions.json'
/** ZEC already owed to burn-first redemptions that have not been paid yet (same ledger mint.ts uses). */
function pendingPayoutsZats(): bigint {
  if (!existsSync(LEDGER)) return 0n
  const raw = JSON.parse(readFileSync(LEDGER, 'utf8')); const entries = raw.entries ?? raw
  return Object.values(entries as Record<string, { txid: string; amountZats?: string }>).filter((e) => e.txid === 'PENDING').reduce((s, e) => s + BigInt(e.amountZats ?? '0'), 0n)
}

async function main() {
  if (!DESK || !ethers.isAddress(DESK)) throw new Error('WRAP_DESK_ADDRESS must be set in ops/.env')
  const desk = new ethers.Contract(DESK, ABI, provider)
  const zzec = new ethers.Contract(CONTRACTS.zzec, ZABI, provider)
  const [n, minter] = await Promise.all([desk.requestCount(), zzec.minter()]) as [bigint, string]
  console.log(`WrapDesk ${DESK}  requests ${n}  ZZEC minter ${minter === DESK ? 'is the desk' : 'is NOT the desk (' + minter + '): fulfil will revert until commitMinter'}`)
  if (n > 10000n) throw new Error('Wrap index capacity requires operator review')
  if (process.env.WRAP_FULFILL === '1' && minter.toLowerCase() !== DESK.toLowerCase()) throw new Error('WrapDesk minter activation is pending')
  const usedTxids = new Set<string>()
  const open: { id: number; requester: string; amount: bigint; deposit: bigint; at: number }[] = []
  for (let i = 0; i < Number(n); i++) {
    const s = await desk.summary(i)
    if (Number(s.status) === 2) usedTxids.add(String(s.zcashTxid).toLowerCase())
    if (Number(s.status) === 1) open.push({ id: i, requester: s.requester, amount: BigInt(s.amount), deposit: BigInt(s.deposit), at: Number(s.requestedAt) })
  }
  console.log(`open ${open.length}`)
  if (process.env.WRAP_REJECT !== undefined) throw new Error('Automatic rejection disabled; review payment and refund obligations before an owner-assisted recovery')
  if (process.env.WRAP_ID !== undefined && !/^\d+$/.test(process.env.WRAP_ID)) throw new Error('Invalid WRAP_ID')
  if (!open.length) { await wrapAccounting(); return }
  const [tip, utxos] = await Promise.all([chainTip(), addressUtxos(RESERVE.zcashTAddress)])
  const matches: { id: number; txid: string; amount: bigint; conf: number }[] = []
  if (tip.chain !== 'main') throw new Error('Expected Zcash mainnet')
  const times = new Map<number, number>()
  for (const height of new Set(utxos.filter(u => u.height > 0 && open.some(o => o.deposit === u.valueZat)).map(u => u.height))) times.set(height, await blockTime(height))
  for (const o of open) {
    if (process.env.WRAP_ID !== undefined && o.id !== Number(process.env.WRAP_ID)) continue
    const u = confirmedWrapOutput(o.deposit, o.at, tip.height, CONFIRMATIONS, utxos, times, usedTxids)
    const line = `#${o.id}  ${fmt(o.amount)} zZEC -> ${o.requester}  deposit ${fmt(o.deposit)} ZEC  opened ${new Date(o.at * 1000).toISOString().slice(0, 16)}`
    if (!u) { console.log(`${line}  | no unambiguous confirmed post-request payment`); continue }
    if (process.env.ZEC_TXID && process.env.ZEC_TXID.toLowerCase() !== u.txid.toLowerCase()) throw new Error('Requested ZEC_TXID does not match verified funding')
    const conf = tip.height - u.height + 1
    console.log(`${line}  | funded ${u.txid} (${conf} conf)`)
    matches.push({ id: o.id, txid: u.txid, amount: o.amount, conf })
  }
  if (!matches.length) { console.log('nothing confirmed to fulfil'); return }
  if (process.env.WRAP_FULFILL !== '1') { console.log(`\n${matches.length} ready. Re-run with WRAP_FULFILL=1 to mint.`); return }
  await fulfil(desk, zzec, matches)
}

async function fulfil(desk: ethers.Contract, zzec: ethers.Contract, items: { id: number; txid: string; amount: bigint }[]) {
  const need = items.reduce((s, i) => s + i.amount, 0n)
  let [reserve, supply, fresh] = await Promise.all([zzec.reserveZats(), zzec.totalSupply(), zzec.attestationIsFresh()]) as [bigint, bigint, boolean]
  const owed = pendingPayoutsZats()
  if (owed > 0n) console.log(`in-flight redemption payouts ${fmt(owed)} ZEC are counted as already spent`)
  if (!fresh || reserve < supply + need + owed) {
    console.log(`attestation ${fresh ? 'covers ' + fmt(reserve - supply) + ' headroom, need ' + fmt(need) : 'stale'}: re-attesting`)
    const r = spawnSync('npx', ['tsx', 'src/attest.ts'], { stdio: 'inherit', env: process.env, timeout: 120_000 })
    if (r.status !== 0) throw new Error('attest failed')
    ;[reserve, supply] = await Promise.all([zzec.reserveZats(), zzec.totalSupply()]) as [bigint, bigint]
    if (reserve < supply + need + owed) throw new Error(`attested reserve ${fmt(reserve)} cannot cover supply ${fmt(supply)} + ${fmt(need)} + owed ${fmt(owed)}; deposits may still be unconfirmed`)
  }
  const signer = await roleSigner('minter')
  if (signer.address.toLowerCase() !== String(await desk.operator()).toLowerCase()) throw new Error('Wrong wrap operator')
  const d = desk.connect(signer) as ethers.Contract
  const journal: Record<string, unknown>[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : []
  for (const it of items) {
    // Recheck funding after attestation and immediately before constructing a mint.
    const request = await desk.summary(it.id)
    if (Number(request.status) !== 1) throw new Error('Wrap request is no longer open')
    const wrapping = await wrapAccounting()
    const outputs = wrapping.outputs
    const times = new Map<number, number>()
    for (const height of new Set(outputs.filter(o => o.valueZat === BigInt(request.deposit) && o.height > 0).map(o => o.height))) {
      const values = await Promise.all(RESERVE_NODES.map(host => blockTime(height, host)))
      if (values[0] !== values[1]) throw new Error('Zcash block timestamp sources disagree')
      times.set(height, values[0])
    }
    const used = new Set([...journal.map(j => String(j.zcashTxid).toLowerCase()), ...wrapping.requests.filter(r=>r.status===2).map(r=>r.txid.toLowerCase())])
    const proof = confirmedWrapOutput(BigInt(request.deposit), Number(request.requestedAt), wrapping.tip, CONFIRMATIONS, outputs, times, used)
    if (!proof || proof.txid.toLowerCase() !== it.txid.toLowerCase()) throw new Error('Wrap funding evidence changed; refusing mint')
    const accounting = await redemptionAccounting()
    // Release this payment only for its own mint; retain all other holds and tag dust.
    const otherObligations = wrapping.reserved - it.amount
    if (otherObligations < 0n || it.amount <= 0n || it.amount > mintCapacity(wrapping.live, accounting.supply, accounting.reimbursementZats, owed + otherObligations)) throw new Error('Wrap exceeds backing after other deposit and redemption obligations')
    const tx = await managedSend(signer, await d.fulfill.populateTransaction(it.id, it.txid))
    console.log(`fulfil #${it.id}  ${fmt(it.amount)} zZEC  zcash ${it.txid}  ${tx.hash}`); await tx.wait()
    journal.push({ at: new Date().toISOString(), id: it.id, amountZats: it.amount.toString(), zcashTxid: it.txid, tx: tx.hash })
    atomicJson(JOURNAL, journal)
  }
  console.log('done')
}
withLock('issuance', main).catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
