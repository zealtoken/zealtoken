import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RESERVE, ZATS_PER_ZEC } from './config.js'

const run = promisify(execFile)

/**
 * Thin wrapper over zingo-cli in non-interactive mode. The wallet's spending
 * key lives in zingo's own encrypted wallet file, never in this process.
 *
 * ZINGO_CLI: path to the binary. ZINGO_DATA: --data-dir for the wallet.
 */
async function zingo(args: string[]): Promise<string> {
  const bin = process.env.ZINGO_CLI ?? 'zingo-cli'
  const base = ['--server', RESERVE.lightwalletd]
  if (process.env.ZINGO_DATA) base.push('--data-dir', process.env.ZINGO_DATA)
  const { stdout } = await run(bin, [...base, ...args], { maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

/** Transparent balance of the reserve address, in zatoshi, after a sync. */
export async function reserveBalanceZats(): Promise<bigint> {
  const out = await zingo(['--waitsync', 'balance'])
  // zingo prints JSON for `balance`; the transparent line is what backs zZEC.
  const j = JSON.parse(out.slice(out.indexOf('{')))
  const t = j.transparent_balance ?? j.tbalance ?? j.transparent
  if (t === undefined) throw new Error(`unexpected balance output: ${out.slice(0, 200)}`)
  return BigInt(t)
}

/** Latest synced block hash, used as the attestation's proofRef. */
export async function chainTipHash(): Promise<string> {
  const out = await zingo(['--waitsync', 'info'])
  const j = JSON.parse(out.slice(out.indexOf('{')))
  const h: string = j.latest_block_hash ?? j.block_hash ?? ''
  if (!/^[0-9a-f]{64}$/i.test(h)) throw new Error(`no block hash in info: ${out.slice(0, 200)}`)
  return '0x' + h
}

/** Send native ZEC from the reserve to a transparent address. Returns the txid. */
export async function sendZec(toTAddress: string, zats: bigint, memo = ''): Promise<string> {
  if (!/^t[13][a-zA-Z0-9]{33}$/.test(toTAddress)) throw new Error(`not a transparent address: ${toTAddress}`)
  const out = await zingo(['--waitsync', 'send', toTAddress, zats.toString(), memo])
  const m = out.match(/[0-9a-f]{64}/i)
  if (!m) throw new Error(`send produced no txid: ${out.slice(0, 200)}`)
  return m[0]
}

export const fmtZec = (zats: bigint) => `${Number(zats) / Number(ZATS_PER_ZEC)} ZEC`
