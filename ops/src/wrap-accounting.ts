import { interimAccounting } from './wrap-interim-accounting.js'
import { ethers } from 'ethers'
import { provider } from './chain.js'
import { RESERVE } from './config.js'
import { RESERVE_NODES, reserveRpc } from './reserve-rpc.js'
import { atomicJson, readJson, stateDir } from './ops-lock.js'
import type { TaddrUtxo } from './zcash-light.js'

export type WrapRequest = { id: number; status: number; deposit: bigint; txid: string }
export type DepositHold = { id: number; outpoint: string; value: string }
const key = (o: TaddrUtxo) => `${o.txid.toLowerCase()}:${o.index}`
/** Protect all exact payments, including ambiguous duplicates and cancelled requests.
 * A hold is released only by the matching on-chain fulfilment. Missing outputs
 * remain obligations and stop automation until an operator reconciles them.
 */
export function depositHolds(requests: WrapRequest[], outputs: TaddrUtxo[], previous: DepositHold[], knownSweepOutpoints: ReadonlySet<string> = new Set()) {
  const holds = new Map(previous.map(h => [h.outpoint, h]))
  const byDeposit = new Map(requests.map(r => [r.deposit.toString(), r]))
  const byId = new Map(requests.map(r => [r.id, r]))
  for (const o of outputs) {
    if (knownSweepOutpoints.has(key(o))) continue // Internal consolidation is not a new legacy tagged payment.
    const r = byDeposit.get(o.valueZat.toString())
    if (r) holds.set(key(o), { id: r.id, outpoint: key(o), value: o.valueZat.toString() })
  }
  for (const [k, h] of holds) {
    const r = byId.get(h.id)
    if (!r || BigInt(h.value) <= 0n) throw new Error('Wrap obligation journal needs reconciliation')
    if (r.status === 2 && h.outpoint.split(':')[0] === r.txid.toLowerCase()) holds.delete(k)
  }
  const available = new Set(outputs.map(key))
  if ([...holds.keys()].some(k => !available.has(k))) throw new Error('Protected wrap output disappeared; reconcile before minting or reserve spending')
  return [...holds.values()]
}

/** Caller holds issuance lock. Live balance and holds use the SAME output snapshot. */
export async function wrapAccounting() {
  const address = process.env.WRAP_DESK_ADDRESS
  if (!address || !ethers.isAddress(address)) throw new Error('WRAP_DESK_ADDRESS is required for safe reserve accounting')
  const blockTag = await provider.getBlockNumber()
  const desk = new ethers.Contract(address, ['function requestCount() view returns(uint256)', 'function summary(uint256) view returns(address,uint256,uint64,uint8,bytes32,uint256)'], provider)
  const n = Number(await desk.requestCount({blockTag}))
  if (!Number.isSafeInteger(n) || n < 0 || n > 10000) throw new Error('Wrap request capacity requires reconciliation')
  const requests: WrapRequest[] = []
  for (let start = 0; start < n; start += 25) {
    const batch = await Promise.all(Array.from({length: Math.min(25, n-start)}, async (_, k) => {
      const id = start+k, s = await desk.summary(id, {blockTag})
      return {id, status:Number(s[3]), deposit:BigInt(s[5]), txid:String(s[4])}
    }))
    requests.push(...batch)
  }
  const snapshots = await Promise.all(RESERVE_NODES.map(async host => {
    const [info, u] = await Promise.all([reserveRpc(host, 'GetLightdInfo', {}), reserveRpc(host, 'GetAddressUtxos', {addresses:[RESERVE.zcashTAddress], startHeight:0,maxEntries:0})])
    const height = Number(info.blockHeight)
    if (info.chainName !== 'main' || !Number.isSafeInteger(height) || height <= 0) throw new Error('Invalid Zcash chain')
    const outputs: TaddrUtxo[] = (u.addressUtxos ?? []).map((x:any) => ({txid:'0x'+Buffer.from(x.txid).reverse().toString('hex'),index:Number(x.index),valueZat:BigInt(x.valueZat),height:Number(x.height)}))
    if (outputs.some(o => !/^0x[0-9a-f]{64}$/.test(o.txid) || !Number.isSafeInteger(o.index) || o.index<0 || o.valueZat<=0n || !Number.isSafeInteger(o.height) || o.height<0)) throw new Error('Invalid reserve output')
    outputs.sort((a,b) => key(a).localeCompare(key(b)))
    if (new Set(outputs.map(key)).size !== outputs.length) throw new Error('Duplicate reserve output')
    return {height,outputs}
  }))
  if (Number(await desk.requestCount()) !== n) throw new Error('Wrap requests changed during snapshot; retry later')
  const encode = (v: unknown) => JSON.stringify(v, (_, x) => typeof x==='bigint'?x.toString():x)
  if (Math.abs(snapshots[0].height-snapshots[1].height)>2 || encode(snapshots[0].outputs)!==encode(snapshots[1].outputs)) throw new Error('Zcash sources disagree; retry later')
  const tip = Math.min(...snapshots.map(s=>s.height)), outputs = snapshots[0].outputs
  const file = `${stateDir}wrap-obligations.json`
  const interim = await interimAccounting()
  const holds = depositHolds(requests, outputs, readJson<DepositHold[]>(file, []), new Set(interim.knownSweepOutpoints))
  atomicJson(file, holds)
  const confirmed = outputs.filter(o => o.height>0 && tip-o.height+1>=3)
  const live = confirmed.reduce((s,o)=>s+o.valueZat,0n)
  // Counting unconfirmed holds too is deliberately conservative.
  const reserved = holds.reduce((s,h)=>s+BigInt(h.value),0n)
  return {live, reserved: reserved + interim.reserved, holds: [...holds, ...interim.holds], outputs, tip, requests}
}
