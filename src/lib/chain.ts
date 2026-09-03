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
  balanceOf: '0x70a08231', // balanceOf(address), ERC-20 and Pons V2FeeEscrow alike
  totalRoutedNative: '0x1446461b', // totalRoutedNative()
  totalToReserveNative: '0xbda62f04', // totalToReserveNative()
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

  const res = await fetch(CHAIN.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`rpc ${res.status}`)

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

/** bigint with `decimals` places → JS number for display only. */
export function units(v: bigint, decimals: number): number {
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  return Number(whole) + Number(frac) / Number(base)
}
