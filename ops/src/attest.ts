import { RESERVE } from './config.js'
import { zzec, roleSigner } from './chain.js'
import { reserveBalanceZats, chainTipHash, fmtZec } from './zcash.js'

/**
 * Read the reserve's transparent balance from Zcash and post it on-chain.
 * The number is checkable by anyone against the published t-address; the
 * proofRef is the Zcash block hash it was read at.
 */
async function main() {
  const [zats, proof] = await Promise.all([reserveBalanceZats(RESERVE.zcashTAddress), chainTipHash()])
  const c = zzec(await roleSigner('attestor'))
  const [prev, supply] = (await Promise.all([c.reserveZats(), c.totalSupply()])) as [bigint, bigint]
  console.log(`reserve   ${fmtZec(zats)}  (previous attestation ${fmtZec(prev)})`)
  console.log(`supply    ${fmtZec(supply)}  -> coverage after: ${supply === 0n ? 'n/a' : (Number(zats) / Number(supply)).toFixed(4)}`)
  if (zats < supply) console.log('WARNING: reserve below supply. Attesting anyway; the contract will emit CoverageBreach.')
  const tx = await c.attest(zats, proof)
  console.log(`attest    ${tx.hash}`)
  await tx.wait()
  console.log('done')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
