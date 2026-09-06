/** Tiny read helpers for the docs visuals: batched eth_call and eth_getLogs against the public RPC. */
import { CHAIN } from '../../config'
export const T = {
  attested: '0x536cbbaa0450bfa092fe0ad313b1d74edbf280a5e12a8b4f590e2b00235cba05', // Attested(uint256,uint256,bytes32,uint64)
  burned: '0x23ff0e75edf108e3d0392d92e13e8c8a868ef19001bd49f9e94876dc46dff87f', // Burned(address,uint256,uint256)
  ignited: '0xa1f37af5ef6bb247b9e65409264bbbe11f882ac327d4376ba628dea622f2053e', // Ignited(uint256,uint256,uint256,address)
  hookTaken: '0xd5de75b5f8e8b4a515838afdb4948be0451601c913a6bf795bee0f0b23e84efa', // BurnShareTaken(address,uint256,address)
} as const
export type Log = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }
/** The public RPC drops bursts of concurrent requests from one page, so every call goes through one queue with retries. */
let chain: Promise<unknown> = Promise.resolve()
async function post<T>(body: unknown): Promise<T> {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(CHAIN.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (!r.ok) throw new Error(`rpc ${r.status}`)
        return (await r.json()) as T
      } catch (e) { if (attempt >= 3) throw e; await new Promise((res) => setTimeout(res, 350 * (attempt + 1))) }
    }
  }
  const p = chain.then(run, run)
  chain = p.catch(() => undefined)
  return p
}
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const j = await post<{ result?: T; error?: { message: string } }>({ jsonrpc: '2.0', id: 1, method, params })
  if (j.error) throw new Error(j.error.message)
  return j.result as T
}
export const getLogs = (address: string, topic: string) => rpc<Log[]>('eth_getLogs', [{ address, topics: [topic], fromBlock: '0x0', toBlock: 'latest' }])
export const call = (to: string, data: string) => rpc<string>('eth_call', [{ to, data }, 'latest'])
/** Block timestamps for many blocks in ONE request: the public RPC drops rapid sequential fetches. */
export async function blockTimes(ns: string[]): Promise<Record<string, number>> {
  if (!ns.length) return {}
  const body = [...new Set(ns)].map((n, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_getBlockByNumber', params: [n, false] }))
  const out = await post<{ id: number; result?: { number: string; timestamp: string } }[]>(body)
  const map: Record<string, number> = {}
  body.forEach((b, i) => { const res = out.find((o) => o.id === i + 1)?.result; if (res) { map[(b.params[0] as string).toLowerCase()] = Number(res.timestamp); map[res.number.toLowerCase()] = Number(res.timestamp) } })
  return map
}
export const w = (hex: string, i: number) => BigInt('0x' + (hex.slice(2 + i * 64, 66 + i * 64) || '0'))
export const num = (v: bigint, dec: number) => Number(v) / 10 ** dec
export const css = (name: string, fallback: string) => (typeof window === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)
