/**
 * Pay every holder of every launched token their zZEC dividends. Runs daily from the burn job.
 * Holders are found from the token's Transfer logs; anyone owed more than dust is paid with
 * claimForMany(), batched. Exits quietly until the launchpad is deployed.
 *
 *   ZEALZ_FACTORY=0x... npm run dividends
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { CHAIN } from './config.js'

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const FACTORY = process.env.ZEALZ_FACTORY ?? ''
const MIN_ZATS = BigInt(process.env.DIVIDEND_MIN_ZATS ?? 1_000) // below this a payout is not worth the gas
const BATCH = 150
async function signerFromEnv() {
  const file = process.env.LP_KEYSTORE, pass = process.env.LP_PASS
  if (!file || !pass) throw new Error('set LP_KEYSTORE and LP_PASS')
  return (await ethers.Wallet.fromEncryptedJson(readFileSync(file, 'utf8'), pass)).connect(provider)
}
async function main() {
  if (!ethers.isAddress(FACTORY)) { console.log(`${new Date().toISOString()} launchpad not deployed; no dividends to pay`); return }
  const factory = new ethers.Contract(FACTORY, ['function launchCount() view returns (uint256)', 'function launches(uint256) view returns (address token, address creator, bytes32 poolId, uint256 positionId, uint8 curve, uint8 opening, uint64 at, uint16 totalBps, uint16 burnBps, uint16 creatorBps)'], provider)
  const signer = await signerFromEnv()
  const n = Number(await factory.launchCount())
  let paidTotal = 0n, paidHolders = 0
  for (let i = 0; i < n; i++) {
    const l = await factory.launches(i)
    if (Number(l.totalBps) - Number(l.burnBps) - Number(l.creatorBps) - 50 === 0) continue // no holders' share on this token
    const token = new ethers.Contract(l.token, ['event Transfer(address indexed from, address indexed to, uint256 value)', 'function dividendsOf(address) view returns (uint256)', 'function claimForMany(address[]) returns (uint256)', 'function excluded(address) view returns (bool)'], signer)
    const logs = await token.queryFilter(token.filters.Transfer(), 0, 'latest')
    const holders = new Set<string>()
    for (const lg of logs) holders.add((lg as ethers.EventLog).args.to as string)
    const owed: string[] = []
    for (const h of holders) {
      if (h === ethers.ZeroAddress || (await token.excluded(h))) continue
      if ((await token.dividendsOf(h)) >= MIN_ZATS) owed.push(h)
    }
    for (let b = 0; b < owed.length; b += BATCH) {
      const slice = owed.slice(b, b + BATCH)
      const tx = await token.claimForMany(slice); const rc = await tx.wait()
      const paid = rc!.logs.reduce((s: bigint, lg: any) => { try { const p = token.interface.parseLog(lg); return p?.name === 'DividendsClaimed' ? s + (p.args.zats as bigint) : s } catch { return s } }, 0n)
      paidTotal += paid; paidHolders += slice.length
      console.log(`${new Date().toISOString()} ${l.token} paid ${slice.length} holders ${Number(paid) / 1e8} zZEC tx ${tx.hash}`)
    }
  }
  console.log(`${new Date().toISOString()} dividends run: ${paidHolders} holders, ${Number(paidTotal) / 1e8} zZEC across ${n} tokens`)
}
main().catch((e) => { console.error(`${new Date().toISOString()} ERROR ${e?.shortMessage ?? e?.message ?? e}`); process.exitCode = 1 })
