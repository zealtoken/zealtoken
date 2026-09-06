import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * POST /api/rpc
 * Same-origin JSON-RPC relay to Robinhood Chain for the site's READ calls.
 * The public node intermittently sends a duplicated CORS header, which
 * browsers reject; a server-side hop never has that problem. Read-only
 * methods only, small bodies only, nothing is signed here.
 */
const UPSTREAM = 'https://rpc.mainnet.chain.robinhood.com'
const ALLOW = new Set(['eth_call', 'eth_getLogs', 'eth_blockNumber', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_getTransactionReceipt', 'eth_estimateGas', 'eth_chainId', 'eth_gasPrice'])
const MAX_BODY = 64 * 1024

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"POST only"}'); return }
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) { res.statusCode = 413; res.end('{"error":"body too large"}'); return } }
  let body: unknown
  try { body = JSON.parse(raw) } catch { res.statusCode = 400; res.end('{"error":"bad json"}'); return }
  const calls = Array.isArray(body) ? body : [body]
  if (calls.length > 120 || calls.some((c) => !c || typeof c !== 'object' || !ALLOW.has((c as { method?: string }).method ?? ''))) { res.statusCode = 400; res.end('{"error":"method not allowed"}'); return }
  try {
    const up = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw, signal: AbortSignal.timeout(20_000) })
    const text = await up.text()
    res.statusCode = up.status
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'upstream unreachable', detail: (e as Error).message }))
  }
}
