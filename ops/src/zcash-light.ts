/**
 * Read a transparent address balance straight from a lightwalletd node over
 * gRPC. No wallet, no explorer API, no key. This is how the attestor reads the
 * reserve; sends still go through zingo-cli, which holds the spending key.
 */
import { reserveRpc } from './reserve-rpc.js'
const DEFAULT_HOST = process.env.LIGHTWALLETD?.replace(/^https?:\/\//, '') ?? 'zec.rocks:443'
export async function taddrBalanceZats(address: string, host?: string): Promise<bigint> {
  const r = await reserveRpc(host ?? DEFAULT_HOST, 'GetTaddressBalance', {addresses:[address]})
  return BigInt(r.valueZat)
}

export async function chainTip(host?: string): Promise<{ height: number; hash: string; chain: string }> {
  const [info,b] = await Promise.all([reserveRpc(host ?? DEFAULT_HOST, 'GetLightdInfo', {}), reserveRpc(host ?? DEFAULT_HOST, 'GetLatestBlock', {})])
  // lightwalletd returns the hash little-endian; explorers show it reversed
  return { height: Number(b.height), hash: '0x' + Buffer.from(b.hash).reverse().toString('hex'), chain: info.chainName }
}

if (process.argv[1]?.endsWith('zcash-light.ts')) {
  const addr = process.argv[2] ?? process.env.ZEC_RESERVE_ADDRESS
  if (!addr) throw new Error('address?')
  const [bal, tip] = await Promise.all([taddrBalanceZats(addr), chainTip()])
  console.log(`${addr}\n  balance ${(Number(bal) / 1e8).toFixed(8)} ZEC (${bal} zat)\n  tip     ${tip.chain} #${tip.height} ${tip.hash}`)
}

export type TaddrUtxo = { txid: string; index: number; valueZat: bigint; height: number }
/** Unspent outputs on a transparent address (txid in display byte order). */
export async function addressUtxos(address: string, host?: string): Promise<TaddrUtxo[]> {
  const r = await reserveRpc(host ?? DEFAULT_HOST, 'GetAddressUtxos', {addresses:[address],startHeight:0,maxEntries:0})
  return (r.addressUtxos ?? []).map((u:any) => ({txid:'0x'+Buffer.from(u.txid).reverse().toString('hex'),index:Number(u.index),valueZat:BigInt(u.valueZat),height:Number(u.height)}))
}

/** Block timestamp evidence for deposit matching. Missing data fails closed. */
export async function blockTime(height: number, host?: string): Promise<number> {
  if (!Number.isSafeInteger(height) || height <= 0) throw new Error('Invalid Zcash block height')
  const r = await reserveRpc(host ?? DEFAULT_HOST, 'GetBlock', {height})
  if (Number(r.height)!==height || !Number.isSafeInteger(r.time) || r.time<=0) throw new Error('Invalid Zcash block evidence')
  return r.time
}
