import * as grpc from '@grpc/grpc-js'
import * as loader from '@grpc/proto-loader'
export const RESERVE_NODES = ['na.zec.rocks:443', 'eu.zec.rocks:443'] as const
export async function reserveRpc(host: string, method: string, request: unknown): Promise<any> {
  if (!['GetBlock', 'GetTaddressBalance', 'GetLightdInfo', 'GetLatestBlock', 'GetAddressUtxos', 'GetTransaction', 'SendTransaction'].includes(method)) throw new Error('Unsupported reserve RPC')
  const proto = new URL('../proto/service.proto', import.meta.url).pathname
  const pkg: any = grpc.loadPackageDefinition(loader.loadSync(proto, { keepCase: true, longs: String, defaults: true, includeDirs: [new URL('../proto/', import.meta.url).pathname] }))
  const c = new pkg.cash.z.wallet.sdk.rpc.CompactTxStreamer(host, grpc.credentials.createSsl())
  try { return await new Promise((resolve, reject) => c[method](request, { deadline: Date.now() + 15000 }, (e: Error | null, r: unknown) => e ? reject(e) : resolve(r))) }
  finally { c.close() }
}
