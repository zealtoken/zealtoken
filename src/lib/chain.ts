/**
 * The smallest possible chain reader.
 *
 * Every number on the ledger is a public view on a contract we wrote, so the
 * site reads them straight from Robinhood Chain over JSON-RPC. No indexer, no
 * backend, no library: the selectors are precomputed from the compiled ABIs and
 * the calls are batched into one request.
 */

import { CHAIN } from '../config'

/** keccak256(signature)[0:4], computed from the compiled ABIs in /contracts. */
export const SEL = {
  totalRouted: '0x51f4a71d', // totalRouted(address)
  totalToReserve: '0xdb431f5a', // totalToReserve(address)
  reserveZats: '0xb63374ee', // reserveZats()
  totalSupply: '0x18160ddd', // totalSupply()
  coverageBps: '0x48ebfe9c', // coverageBps()
  lastAttestationAt: '0x8e353f4c', // lastAttestationAt()
  totalZealBurned: '0xa0024092', // totalZealBurned()
  burnCount: '0x524773ce', // burnCount()
  totalEthConsumed: '0x59ff3df5', // totalEthConsumed(): ETH the Furnace spent buying $ZEAL
  totalZzecConsumed: '0x3dff8184', // totalZzecConsumed(): zZEC the Furnace sold on the way to $ZEAL
  balanceOf: '0x70a08231', // balanceOf(address), ERC-20 and Pons V2FeeEscrow alike
  totalRoutedNative: '0x1446461b', // totalRoutedNative()
  totalToReserveNative: '0xbda62f04', // totalToReserveNative()
  pendingCreatorFeeRecipient: '0x9beacf4a', // Pons factory: pendingCreatorFeeRecipient(address) -> (recipient, effectiveAt, expiresAt)
  launches: '0xad091230', // Pons hook: launches(bytes32) -> LaunchInfo (creator is word 4)
  pendingFees: '0x359b4f30', // Pons hook: pendingFees(bytes32,address)
} as const

export const MAX_UINT = (1n << 256n) - 1n

/** An eth_call, or a native balance read when `data` is omitted. */
export type Call = { to: string; data?: string }

export const nativeBalance = (addr: string): Call => ({ to: addr })

export const encAddress = (addr: string) => addr.toLowerCase().replace(/^0x/, '').padStart(64, '0')

export const view = (to: string, selector: string, argAddress?: string): Call => ({
  to,
  data: argAddress ? selector + encAddress(argAddress) : selector,
})

export const hexToBig = (hex: string): bigint => (hex && hex !== '0x' ? BigInt(hex) : 0n)

type RpcResult = { id: number; result?: string; error?: { message: string } }

/** POST a JSON-RPC body: the relay first (retrying briefly on 429/5xx), then the node directly as a last resort. */
export async function rpcPost(body: unknown, signal?: AbortSignal): Promise<Response> {
  const payload = JSON.stringify(body)
  const targets = [CHAIN.rpc, CHAIN.rpcPublic]
  let last: Error | null = null
  for (const url of targets) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, signal })
        if (res.ok) return res
        last = new Error(`rpc ${res.status}`)
        if (res.status !== 429 && res.status < 500) break
      } catch (e) { last = e as Error; if (signal?.aborted) throw e }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  throw last ?? new Error('rpc unreachable')
}

/** One batched eth_call round trip plus the block it was read at. */
export async function readBatch(
  calls: Call[],
  signal?: AbortSignal,
): Promise<{ values: bigint[]; block: bigint }> {
  const body = [
    ...calls.map((c, i) =>
      c.data
        ? { jsonrpc: '2.0', id: i + 1, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] }
        : { jsonrpc: '2.0', id: i + 1, method: 'eth_getBalance', params: [c.to, 'latest'] },
    ),
    { jsonrpc: '2.0', id: calls.length + 1, method: 'eth_blockNumber', params: [] },
  ]

  const res = await rpcPost(body, signal)
  const out = (await res.json()) as RpcResult[]
  const byId = new Map(out.map((r) => [r.id, r]))

  const values = calls.map((_, i) => {
    const r = byId.get(i + 1)
    if (!r || r.error) throw new Error(r?.error?.message ?? 'missing result')
    return hexToBig(r.result ?? '0x')
  })
  const blockRes = byId.get(calls.length + 1)
  return { values, block: hexToBig(blockRes?.result ?? '0x') }
}

/** Same round trip, but the raw hex of every result, for multi-word returns. */
export async function readBatchRaw(calls: Call[], signal?: AbortSignal): Promise<string[]> {
  const body = calls.map((c, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] }))
  const res = await rpcPost(body, signal)
  const out = (await res.json()) as RpcResult[]
  const byId = new Map(out.map((r) => [r.id, r]))
  return calls.map((_, i) => {
    const r = byId.get(i + 1)
    if (!r || r.error || !r.result) throw new Error(r?.error?.message ?? 'missing result')
    return r.result
  })
}

/** Word `n` (32 bytes) of an ABI-encoded return. */
export const word = (hex: string, n: number): string => '0x' + (hex.slice(2 + n * 64, 66 + n * 64) || '0'.repeat(64))
export const wordAddress = (hex: string, n: number): string => '0x' + word(hex, n).slice(-40)

/** bigint with `decimals` places → JS number for display only. */
export function units(v: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  return Number(whole) + Number(frac) / Number(base)
}

/** eth_getLogs for one address and topic list, from genesis. The public RPC answers these quickly. */
export async function getLogs(address: string, topics: (string | null)[], signal?: AbortSignal): Promise<{ topics: string[]; data: string; blockNumber: string; transactionHash: string }[]> {
  const res = await rpcPost({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ address, topics, fromBlock: '0x0', toBlock: 'latest' }] }, signal)
  const j = (await res.json()) as { result?: { topics: string[]; data: string; blockNumber: string; transactionHash: string }[]; error?: { message: string } }
  if (j.error) throw new Error(j.error.message)
  return j.result ?? []
}

/** Minimal ABI encoding for the few shapes the site signs: static words, dynamic bytes, arrays of bytes, tuples. */
export type Enc = { s: string } | { d: string }
export const encUint = (n: bigint): Enc => ({ s: (n < 0n ? (1n << 256n) + n : n).toString(16).padStart(64, '0') })
export const encAddr = (a: string): Enc => ({ s: encAddress(a) })
export const encBytes = (hex: string): Enc => { const h = hex.replace(/^0x/, ''); return { d: (h.length / 2).toString(16).padStart(64, '0') + h.padEnd(Math.ceil(h.length / 64) * 64, '0') } }
/** ABI-encode a list of members as a tuple body (no selector): heads then tails, offsets relative to the tuple start. */
export function encTuple(members: Enc[]): string {
  const headLen = members.length * 32
  let tail = ''
  const heads = members.map((m) => { if ('s' in m) return m.s; const off = headLen + tail.length / 2; tail += m.d; return off.toString(16).padStart(64, '0') })
  return heads.join('') + tail
}
/** bytes[]: count, then offsets, then each element as length-prefixed padded bytes. */
export function encBytesArray(items: string[]): Enc {
  const encoded = items.map((h) => (encBytes(h) as { d: string }).d)
  let tail = ''
  const heads = encoded.map((e) => { const off = items.length * 32 + tail.length / 2; tail += e; return off.toString(16).padStart(64, '0') })
  return { d: items.length.toString(16).padStart(64, '0') + heads.join('') + tail }
}
