import { ethers } from 'ethers'
import { spawnSync } from 'node:child_process'
import { provider, roleSigner } from './chain.js'
import { CONTRACTS, RESERVE } from './config.js'
import { addressUtxos, chainTip } from './zcash-light.js'

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
const CONFIRMATIONS = Number(process.env.WRAP_CONFIRMATIONS ?? 3)
const ABI = ['function requestCount() view returns (uint256)', 'function summary(uint256) view returns (address requester,uint256 amount,uint64 requestedAt,uint8 status,bytes32 zcashTxid,uint256 deposit)', 'function fulfill(uint256,bytes32)', 'function reject(uint256,string)', 'function operator() view returns (address)']
const ZABI = ['function reserveZats() view returns (uint256)', 'function totalSupply() view returns (uint256)', 'function attestationIsFresh() view returns (bool)', 'function minter() view returns (address)']
const fmt = (z: bigint) => (Number(z) / 1e8).toFixed(8)

async function main() {
  if (!DESK || !ethers.isAddress(DESK)) throw new Error('WRAP_DESK_ADDRESS must be set in ops/.env')
  const desk = new ethers.Contract(DESK, ABI, provider)
  const zzec = new ethers.Contract(CONTRACTS.zzec, ZABI, provider)
  const [n, minter, op] = await Promise.all([desk.requestCount(), zzec.minter(), desk.operator()]) as [bigint, string, string]
  console.log(`WrapDesk ${DESK}  requests ${n}  ZZEC minter ${minter === DESK ? 'is the desk' : 'is NOT the desk (' + minter + '): fulfil will revert until commitMinter'}`)
  const open: { id: number; requester: string; amount: bigint; deposit: bigint; at: number }[] = []
  for (let i = 0; i < Number(n); i++) {
    const s = await desk.summary(i)
    if (Number(s.status) === 1) open.push({ id: i, requester: s.requester, amount: BigInt(s.amount), deposit: BigInt(s.deposit), at: Number(s.requestedAt) })
  }
  console.log(`open ${open.length}`)
  if (process.env.WRAP_REJECT) {
    const signer = await roleSigner('minter'); if (signer.address !== op) throw new Error(`minter key ${signer.address} is not the desk operator ${op}`)
    const tx = await (desk.connect(signer) as ethers.Contract).reject(Number(process.env.WRAP_REJECT), process.env.REASON ?? 'unmatched'); console.log(`reject ${tx.hash}`); await tx.wait(); return
  }
  if (process.env.WRAP_ID) {
    const id = Number(process.env.WRAP_ID), txid = process.env.ZEC_TXID
    if (!txid || !/^0x[0-9a-f]{64}$/i.test(txid)) throw new Error('ZEC_TXID must be 0x + 64 hex')
    await fulfil(desk, zzec, [{ id, txid, amount: open.find((o) => o.id === id)?.amount ?? 0n }]); return
  }
  if (!open.length) return
  const [tip, utxos] = await Promise.all([chainTip(), addressUtxos(RESERVE.zcashTAddress)])
  const matches: { id: number; txid: string; amount: bigint; conf: number }[] = []
  for (const o of open) {
    const hits = utxos.filter((u) => u.valueZat === o.deposit)
    const line = `#${o.id}  ${fmt(o.amount)} zZEC -> ${o.requester}  deposit ${fmt(o.deposit)} ZEC  opened ${new Date(o.at * 1000).toISOString().slice(0, 16)}`
    if (!hits.length) { console.log(`${line}  | not funded yet`); continue }
    const u = hits[0]; const conf = u.height ? tip.height - u.height + 1 : 0
    console.log(`${line}  | funded ${u.txid} (${conf} conf${hits.length > 1 ? ', ' + hits.length + ' outputs match, taking the first' : ''})`)
    if (conf >= CONFIRMATIONS) matches.push({ id: o.id, txid: u.txid, amount: o.amount, conf })
  }
  if (!matches.length) { console.log('nothing confirmed to fulfil'); return }
  if (process.env.WRAP_FULFILL !== '1') { console.log(`\n${matches.length} ready. Re-run with WRAP_FULFILL=1 to mint.`); return }
  await fulfil(desk, zzec, matches)
}

async function fulfil(desk: ethers.Contract, zzec: ethers.Contract, items: { id: number; txid: string; amount: bigint }[]) {
  const need = items.reduce((s, i) => s + i.amount, 0n)
  let [reserve, supply, fresh] = await Promise.all([zzec.reserveZats(), zzec.totalSupply(), zzec.attestationIsFresh()]) as [bigint, bigint, boolean]
  if (!fresh || reserve < supply + need) {
    console.log(`attestation ${fresh ? 'covers ' + fmt(reserve - supply) + ' headroom, need ' + fmt(need) : 'stale'}: re-attesting`)
    const r = spawnSync('npx', ['tsx', 'src/attest.ts'], { stdio: 'inherit', env: process.env })
    if (r.status !== 0) throw new Error('attest failed')
    ;[reserve, supply] = await Promise.all([zzec.reserveZats(), zzec.totalSupply()]) as [bigint, bigint]
    if (reserve < supply + need) throw new Error(`attested reserve ${fmt(reserve)} cannot cover supply ${fmt(supply)} + ${fmt(need)}; deposits may still be unconfirmed`)
  }
  const signer = await roleSigner('minter')
  const d = desk.connect(signer) as ethers.Contract
  for (const it of items) {
    const tx = await d.fulfill(it.id, it.txid)
    console.log(`fulfil #${it.id}  ${fmt(it.amount)} zZEC  zcash ${it.txid}  ${tx.hash}`); await tx.wait()
  }
  console.log('done')
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
