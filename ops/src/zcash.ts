import { taddrBalanceZats, chainTip } from './zcash-light.js'
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
export async function reserveBalanceZats(address: string): Promise<bigint> {
  return taddrBalanceZats(address)
}

/** Latest synced block hash, used as the attestation's proofRef. */
export async function chainTipHash(): Promise<string> {
  return (await chainTip()).hash
}

/** Send native ZEC from the reserve to a transparent address. Returns the txid. */
/**
 * Send native ZEC to a transparent address. No memo: transparent outputs cannot carry one.
 * zingo-cli's exact send grammar differs between releases (send vs quicksend, --online consent);
 * pin the binary and set ZINGO_SEND_ARGS to match it, then prove one redemption end to end
 * before Phase 03 opens. Nothing here runs until then.
 */
export async function sendZec(toTAddress: string, zats: bigint): Promise<string> {
  if (!/^t[13][a-zA-Z0-9]{33}$/.test(toTAddress)) throw new Error(`not a transparent address: ${toTAddress}`)
  const extra = (process.env.ZINGO_SEND_ARGS ?? '--online').split(' ').filter(Boolean)
  const out = await zingo([...extra, '--waitsync', process.env.ZINGO_SEND_CMD ?? 'quicksend', toTAddress, zats.toString()])
  const m = out.match(/[0-9a-f]{64}/i)
  if (!m) throw new Error(`send produced no txid: ${out.slice(0, 200)}`)
  return m[0]
}

export const fmtZec = (zats: bigint) => `${Number(zats) / Number(ZATS_PER_ZEC)} ZEC`
