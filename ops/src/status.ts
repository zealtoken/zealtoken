import { ethers } from 'ethers'
import { provider, zzec } from './chain.js'
import { CONTRACTS, RESERVE } from './config.js'
import { fmtZec } from './zcash.js'

/** One screen: where every part of the reserve loop stands right now. */
async function main() {
  const [sink, foundry, tap, block] = await Promise.all([
    provider.getBalance(RESERVE.sinkEvm), provider.getBalance(CONTRACTS.foundry), provider.getBalance(CONTRACTS.tap), provider.getBlockNumber(),
  ])
  console.log(`block ${block}`)
  console.log(`reserve sink (EVM)   ${ethers.formatEther(sink)} ETH   <- ETH waiting to become ZEC`)
  console.log(`foundry              ${ethers.formatEther(foundry)} ETH   tap ${ethers.formatEther(tap)} ETH`)
  if (CONTRACTS.zzec) {
    const c = zzec()
    const [r, s, fresh, paused, n] = (await Promise.all([c.reserveZats(), c.totalSupply(), c.attestationIsFresh(), c.mintingPaused(), c.redemptionCount()])) as [bigint, bigint, boolean, boolean, bigint]
    console.log(`zZEC reserve         ${fmtZec(r)} attested ${fresh ? '(fresh)' : '(STALE)'}`)
    console.log(`zZEC supply          ${fmtZec(s)}  coverage ${s === 0n ? 'n/a' : (Number(r) / Number(s)).toFixed(4)}  minting ${paused ? 'PAUSED' : 'open'}`)
    console.log(`redemptions          ${n}`)
  } else console.log('zZEC                 not deployed yet (Phase 02)')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
