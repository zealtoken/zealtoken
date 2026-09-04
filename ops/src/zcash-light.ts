/**
 * Read a transparent address balance straight from a lightwalletd node over
 * gRPC. No wallet, no explorer API, no key. This is how the attestor reads the
 * reserve; sends still go through zingo-cli, which holds the spending key.
 */
import * as grpc from '@grpc/grpc-js'
import * as loader from '@grpc/proto-loader'

const PROTO = new URL('../proto/service.proto', import.meta.url).pathname
const DEFAULT_HOST = process.env.LIGHTWALLETD?.replace(/^https?:\/\//, '') ?? 'zec.rocks:443'

type Streamer = {
  GetTaddressBalance(req: { addresses: string[] }, cb: (e: Error | null, r?: { valueZat: string | number }) => void): void
  GetLatestBlock(req: object, cb: (e: Error | null, r?: { height: string | number; hash: Buffer }) => void): void
  GetLightdInfo(req: object, cb: (e: Error | null, r?: { chainName: string; blockHeight: string | number; version: string }) => void): void
}

function client(host = DEFAULT_HOST): Streamer {
  const def = loader.loadSync(PROTO, { keepCase: true, longs: String, defaults: true, includeDirs: [new URL('../proto/', import.meta.url).pathname] })
  const pkg = grpc.loadPackageDefinition(def) as unknown as { cash: { z: { wallet: { sdk: { rpc: { CompactTxStreamer: new (h: string, c: grpc.ChannelCredentials) => Streamer } } } } } }
  return new pkg.cash.z.wallet.sdk.rpc.CompactTxStreamer(host, grpc.credentials.createSsl())
}

const call = <T>(fn: (cb: (e: Error | null, r?: T) => void) => void) =>
  new Promise<T>((res, rej) => fn((e, r) => (e ? rej(e) : res(r as T))))

export async function taddrBalanceZats(address: string, host?: string): Promise<bigint> {
  const c = client(host)
  const r = await call<{ valueZat: string | number }>((cb) => c.GetTaddressBalance({ addresses: [address] }, cb))
  return BigInt(r.valueZat)
}

export async function chainTip(host?: string): Promise<{ height: number; hash: string; chain: string }> {
  const c = client(host)
  const info = await call<{ chainName: string; blockHeight: string | number }>((cb) => c.GetLightdInfo({}, cb))
  const b = await call<{ height: string | number; hash: Buffer }>((cb) => c.GetLatestBlock({}, cb))
  // lightwalletd returns the hash little-endian; explorers show it reversed
  return { height: Number(b.height), hash: '0x' + Buffer.from(b.hash).reverse().toString('hex'), chain: info.chainName }
}

if (process.argv[1]?.endsWith('zcash-light.ts')) {
  const addr = process.argv[2] ?? process.env.ZEC_RESERVE_ADDRESS
  if (!addr) throw new Error('address?')
  const [bal, tip] = await Promise.all([taddrBalanceZats(addr), chainTip()])
  console.log(`${addr}\n  balance ${(Number(bal) / 1e8).toFixed(8)} ZEC (${bal} zat)\n  tip     ${tip.chain} #${tip.height} ${tip.hash}`)
}
