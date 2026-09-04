import { RESERVE } from './config.js'
import { zzec, roleSigner } from './chain.js'
import { reserveBalanceZats, chainTipHash, fmtZec } from './zcash.js'
import { chainTip } from './zcash-light.js'

/**
 * Read the reserve's transparent balance from Zcash and post it on-chain.
 * The number is checkable by anyone against the published t-address; the
 * proofRef is the Zcash block hash it was read at.
 */
async function main() {
  // Pin the proof to the block the balance was read at: tip, balance, tip again; retry if the tip moved.
  let tip = await chainTip()
  if (tip.chain !== 'main') throw new Error(`lightwalletd is on chain '${tip.chain}', not main`)
  let zats = 0n
  for (let i = 0; ; i++) {
    zats = await reserveBalanceZats(RESERVE.zcashTAddress)
    const again = await chainTip()
    if (again.height === tip.height) break
    tip = again
    if (i >= 3) throw new Error('Zcash tip kept moving during the read; try again')
  }
  const proof = tip.hash
  const c = zzec(await roleSigner('attestor'))
  const [prev, supply] = (await Promise.all([c.reserveZats(), c.totalSupply()])) as [bigint, bigint]
  console.log(`reserve   ${fmtZec(zats)}  (previous attestation ${fmtZec(prev)})`)
  console.log(`supply    ${fmtZec(supply)}  -> coverage after: ${supply === 0n ? 'n/a' : (Number(zats) / Number(supply)).toFixed(4)}`)
  // A reading that drops sharply, or reads zero while something was there, is more likely a node
  // problem than a real change. Refuse unless explicitly forced; exit non-zero so the scheduler log shows it.
  // A reading at or above supply cannot over-mint, so any drop explained by redemptions is fine.
  // A reading BELOW supply that also dropped sharply (or to zero) is more likely a node problem.
  const force = process.env.ATTEST_FORCE === '1'
  if (!force && zats < supply && prev > 0n && zats === 0n) throw new Error('reading is 0 below supply; refusing (ATTEST_FORCE=1 to override)')
  if (!force && zats < supply && prev > 0n && zats * 100n < prev * 80n) throw new Error(`reading ${fmtZec(zats)} is >20% below the previous ${fmtZec(prev)} and below supply; refusing (ATTEST_FORCE=1 to override)`)
  if (zats < supply) console.log('WARNING: reserve below supply. Attesting anyway; the contract will emit CoverageBreach.')
  const tx = await c.attest(zats, proof)
  console.log(`attest    ${tx.hash}`)
  await tx.wait()
  console.log('done')
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
