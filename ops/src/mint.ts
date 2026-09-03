import { ethers } from 'ethers'
import { zzec, roleSigner } from './chain.js'
import { fmtZec } from './zcash.js'

/**
 * Mint zZEC up to the attested reserve. Usage:
 *   MINT_TO=0x... MINT_ZEC=12.5 npm run mint
 * Omit MINT_ZEC to mint all remaining headroom.
 */
async function main() {
  const to = process.env.MINT_TO
  if (!to || !ethers.isAddress(to)) throw new Error('MINT_TO must be an address')
  const c = zzec(await roleSigner('minter'))
  const [reserve, supply, fresh, paused] = (await Promise.all([c.reserveZats(), c.totalSupply(), c.attestationIsFresh(), c.mintingPaused()])) as [bigint, bigint, boolean, boolean]
  const headroom = reserve - supply
  console.log(`reserve ${fmtZec(reserve)}  supply ${fmtZec(supply)}  headroom ${fmtZec(headroom)}`)
  if (!fresh) throw new Error('attestation is stale; run attest first')
  if (paused) throw new Error('minting is paused')
  const want: bigint = process.env.MINT_ZEC ? BigInt(Math.round(parseFloat(process.env.MINT_ZEC) * 1e8)) : headroom
  if (want <= 0n) throw new Error('nothing to mint')
  if (want > headroom) throw new Error(`requested ${fmtZec(want)} exceeds headroom ${fmtZec(headroom)}`)
  const tx = await c.mint(to, want)
  console.log(`mint ${fmtZec(want)} -> ${to}  ${tx.hash}`)
  await tx.wait()
  console.log('done')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
