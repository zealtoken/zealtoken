import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import * as grpc from '@grpc/grpc-js'
import * as loader from '@grpc/proto-loader'

/**
 * GET /api/reserve
 * The reserve's live transparent balance, read from a Zcash lightwalletd
 * node over gRPC at request time. Browsers cannot speak gRPC, so this tiny
 * function is the only server-side piece on the site. It holds no keys and
 * answers with public chain data only.
 */
const ADDRESS = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
const HOSTS = ['zec.rocks:443', 'na.zec.rocks:443', 'eu.zec.rocks:443']
const PROTO_DIR = join(process.cwd(), 'api', 'proto')

type Streamer = {
  GetTaddressBalance(req: { addresses: string[] }, cb: (e: Error | null, r?: { valueZat: string }) => void): void
  GetLatestBlock(req: object, cb: (e: Error | null, r?: { height: string; hash: Buffer }) => void): void
}

type Pkg = { cash: { z: { wallet: { sdk: { rpc: { CompactTxStreamer: new (h: string, c: grpc.ChannelCredentials) => Streamer & { close(): void } } } } } } }
let pkg: Pkg | null = null
function client(host: string): Streamer & { close(): void } {
  pkg ??= grpc.loadPackageDefinition(loader.loadSync(join(PROTO_DIR, 'service.proto'), { keepCase: true, longs: String, defaults: true, includeDirs: [PROTO_DIR] })) as unknown as Pkg
  return new pkg.cash.z.wallet.sdk.rpc.CompactTxStreamer(host, grpc.credentials.createSsl())
}
const call = <T>(fn: (cb: (e: Error | null, r?: T) => void) => void, ms = 4000) =>
  new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); fn((e, r) => { clearTimeout(t); e ? rej(e) : res(r as T) }) })

async function read() {
  let last: unknown
  for (const host of HOSTS) {
    const c = client(host)
    try {
      const [bal, tip] = await Promise.all([
        call<{ valueZat: string }>((cb) => c.GetTaddressBalance({ addresses: [ADDRESS] }, cb)),
        call<{ height: string; hash: Buffer }>((cb) => c.GetLatestBlock({}, cb)),
      ])
      const zats = BigInt(bal.valueZat)
      return { address: ADDRESS, zats: zats.toString(), zec: Number(zats) / 1e8, height: Number(tip.height), hash: Buffer.from(tip.hash).reverse().toString('hex'), source: host, at: new Date().toISOString() }
    } catch (e) { last = e } finally { c.close() }
  }
  throw last
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // One cacheable URL only: a query string would bypass the CDN cache and hit the upstream node per request.
  if ((req.url ?? '').split('?')[1]) {
    res.statusCode = 400
    res.setHeader('cache-control', 'public, s-maxage=3600')
    res.end('{"error":"no query parameters"}')
    return
  }
  try {
    const body = await read()
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300')
    res.setHeader('access-control-allow-origin', '*')
    res.end(JSON.stringify(body))
  } catch (e) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ error: 'lightwalletd unreachable' }))
    void e
  }
}
