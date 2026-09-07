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
/** Identical read bodies within a few seconds share one upstream call: the site polls the same views from every visitor. */
const CACHE_MS = 8_000
const cache = new Map<string, { at: number; status: number; text: string }>()

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  if (req.method !== 'POST') { res.statusCode = 405; res.end('{"error":"POST only"}'); return }
  // our own pages only: this is a relay for the site, not a public RPC
  const from = String(req.headers.origin ?? req.headers.referer ?? '')
  const host = (() => { try { return new URL(from).hostname } catch { return '' } })()
  const ours = ['zealtoken.com', 'www.zealtoken.com', 'zealz.fun', 'www.zealz.fun', 'localhost', '127.0.0.1'].includes(host) || host.endsWith('.vercel.app')
  if (!ours) { res.statusCode = 403; res.end('{"error":"not for you"}'); return }
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > MAX_BODY) { res.statusCode = 413; res.end('{"error":"body too large"}'); return } }
  let body: unknown
  try { body = JSON.parse(raw) } catch { res.statusCode = 400; res.end('{"error":"bad json"}'); return }
  const calls = Array.isArray(body) ? body : [body]
  if (calls.length > 24 || calls.some((c) => !c || typeof c !== 'object' || !ALLOW.has((c as { method?: string }).method ?? ''))) { res.statusCode = 400; res.end('{"error":"method not allowed"}'); return }
  const hit = cache.get(raw)
  if (hit && Date.now() - hit.at < CACHE_MS) { res.statusCode = hit.status; res.setHeader('content-type', 'application/json'); res.setHeader('x-relay-cache', 'hit'); res.end(hit.text); return }
  try {
    let up: Response | null = null, text = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      up = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw, signal: AbortSignal.timeout(20_000) })
      text = await up.text()
      if (up.status !== 429 && up.status < 500) break
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
    if (!up) throw new Error('no response')
    if (up.ok) { cache.set(raw, { at: Date.now(), status: up.status, text }); if (cache.size > 500) cache.delete(cache.keys().next().value as string) }
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
