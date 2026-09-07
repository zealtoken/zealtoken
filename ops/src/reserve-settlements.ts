import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { ethers } from 'ethers'
import { stateDir, readJson } from './ops-lock.js'
import { RESERVE_NODES, reserveRpc } from './reserve-rpc.js'
import { RESERVE_ADDRESS } from './reserve-key.js'
import { FLOAT_ADDRESS, type ReserveCoin } from './reserve-policy.js'
export const TRANSFERS = stateDir + 'reserve-transfers.json'
export type Transfer = { txid: string; raw: string; branch_id: number; target_height: number; expiry_height: number; amount_zats: number; fee_zats: number; change_zats: number; inputs: ReserveCoin[]; at: string; status: 'signed' | 'submitted' | 'confirmed'; confirmedAt?: string }
export function transferLedger(): Transfer[] {
  if (existsSync('/etc/zeal/RESERVE_ACTIVE') && !existsSync(TRANSFERS)) throw new Error('Reserve settlement journal missing; reconcile before signing or minting')
  const value = readJson<unknown>(TRANSFERS, [])
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid reserve transfer ledger')
  const seen = new Set<string>()
  for (const t of value) {
    if (!t || !['signed', 'submitted', 'confirmed'].includes(t.status) || !/^[0-9a-f]{64}$/.test(t.txid) || seen.has(t.txid) || !Number.isSafeInteger(t.amount_zats) || t.amount_zats <= 0 || !Number.isFinite(Date.parse(t.at))) throw new Error('Invalid or duplicate reserve transfer')
    seen.add(t.txid)
  }
  return value as Transfer[]
}
export function reserveSigner() { return process.env.RESERVE_SIGNER ?? new URL('../reserve-signer/target/release/zeal-reserve-signer', import.meta.url).pathname }
export function inspectTransaction(raw: string, branch_id: number): any {
  try { return JSON.parse(execFileSync(reserveSigner(), ['inspect'], { input: JSON.stringify({ raw, branch_id }), encoding: 'utf8', maxBuffer: 4 << 20, stdio: ['pipe', 'pipe', 'pipe'] })) }
  catch { throw new Error('Reserve transaction decoding failed') }
}
const script = (a: string) => '76a914' + ethers.toBeHex(ethers.decodeBase58(a), 26).slice(6, 46) + '88ac'
export async function confirmedTransfer(t: Transfer): Promise<boolean> {
  const decoded = inspectTransaction(t.raw, t.branch_id)
  if (decoded.txid !== t.txid || !decoded.transparent_only || decoded.outputs.length !== 2 || decoded.outputs[0].script !== script(FLOAT_ADDRESS) || decoded.outputs[1].script !== script(RESERVE_ADDRESS) || decoded.outputs[0].value_zats !== t.amount_zats || decoded.outputs[1].value_zats !== t.change_zats) throw new Error('Reserve settlement output mismatch')
  if (!Array.isArray(t.inputs) || !t.inputs.length || decoded.inputs.length !== t.inputs.length) throw new Error('Reserve settlement inputs missing')
  let total = 0
  for (let i=0; i<t.inputs.length; i++) {
    const coin=t.inputs[i]
    if (decoded.inputs[i].txid !== coin.txid.replace(/^0x/,'') || decoded.inputs[i].index !== coin.index) throw new Error('Reserve input reference mismatch')
    total += coin.value_zats
  }
  if (!Number.isSafeInteger(total) || total - t.amount_zats - t.change_zats !== t.fee_zats || t.fee_zats !== 5000*Math.max(2,t.inputs.length) || t.fee_zats>50000 || t.amount_zats>10000000) throw new Error('Reserve settlement amount or fee mismatch')
  const results = await Promise.all(RESERVE_NODES.map(async host => {
    const [tip, tx] = await Promise.all([reserveRpc(host,'GetLatestBlock',{}), reserveRpc(host,'GetTransaction',{hash:Buffer.from(t.txid,'hex').reverse()})])
    if (Buffer.from(tx.data).toString('hex') !== t.raw) throw new Error('Reserve settlement chain bytes mismatch')
    const height = BigInt(tx.height), head=BigInt(tip.height)
    if (height <= 0n || height > head || head-height+1n<3n) return false
    for (const coin of t.inputs) {
      const prior=await reserveRpc(host,'GetTransaction',{hash:Buffer.from(coin.txid.replace(/^0x/,''),'hex').reverse()})
      const p=inspectTransaction(Buffer.from(prior.data).toString('hex'),t.branch_id)
      const out=p.outputs[coin.index]
      if(p.txid!==coin.txid.replace(/^0x/,'') || !out || out.script!==script(RESERVE_ADDRESS) || out.value_zats!==coin.value_zats) throw new Error('Settlement input did not belong to reserve')
    }
    return true
  }))
  return results.every(Boolean)
}
export async function reimbursementCredits(): Promise<bigint> {
  const all = transferLedger()
  if (all.some(t => t.status !== 'confirmed')) throw new Error('Reserve transfer pending or uncertain; minting waits for reconciliation')
  let paid = 0n
  for (const t of all) {
    if (!await confirmedTransfer(t)) throw new Error('Reserve transfer lost confirmations; minting stopped')
    paid += BigInt(t.amount_zats)
  }
  return paid
}
