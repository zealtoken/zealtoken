/** Tiny read helpers for the docs visuals: batched eth_call and eth_getLogs against the public RPC. */
import { CHAIN } from '../../config'
export const T = {
  attested: '0x536cbbaa0450bfa092fe0ad313b1d74edbf280a5e12a8b4f590e2b00235cba05', // Attested(uint256,uint256,bytes32,uint64)
  burned: '0x23ff0e75edf108e3d0392d92e13e8c8a868ef19001bd49f9e94876dc46dff87f', // Burned(address,uint256,uint256)
  ignited: '0xa1f37af5ef6bb247b9e65409264bbbe11f882ac327d4376ba628dea622f2053e', // Ignited(uint256,uint256,uint256,address)
  hookTaken: '0xd5de75b5f8e8b4a515838afdb4948be0451601c913a6bf795bee0f0b23e84efa', // BurnShareTaken(address,uint256,address)
} as const
export type Log = { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(CHAIN.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const j = (await r.json()) as { result?: T; error?: { message: string } }
  if (j.error) throw new Error(j.error.message)
  return j.result as T
}
export const getLogs = (address: string, topic: string) => rpc<Log[]>('eth_getLogs', [{ address, topics: [topic], fromBlock: '0x0', toBlock: 'latest' }])
export const call = (to: string, data: string) => rpc<string>('eth_call', [{ to, data }, 'latest'])
export const blockTime = async (n: string) => Number((await rpc<{ timestamp: string }>('eth_getBlockByNumber', [n, false])).timestamp)
export const w = (hex: string, i: number) => BigInt('0x' + (hex.slice(2 + i * 64, 66 + i * 64) || '0'))
export const num = (v: bigint, dec: number) => Number(v) / 10 ** dec
export const css = (name: string, fallback: string) => (typeof window === 'undefined' ? fallback : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback)
