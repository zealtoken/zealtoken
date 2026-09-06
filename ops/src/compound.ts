/**
 * Compound every launched pool's LP fees back into its locked position. Anyone may call
 * compound(); we do it daily from the burn job so "depth only goes up" needs no one to remember.
 *
 *   ZEALZ_FACTORY=0x... ZEALZ_LOCKER=0x... npm run compound
 *
 * Exits quietly when the launchpad is not deployed yet (no factory address).
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { CHAIN } from './config.js'

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
/** The burn job's deployer keystore (LP_KEYSTORE + LP_PASS), same as burn.ts. */
async function signerFromEnv() {
  const file = process.env.LP_KEYSTORE, pass = process.env.LP_PASS
  if (!file || !pass) throw new Error('set LP_KEYSTORE and LP_PASS')
  return (await ethers.Wallet.fromEncryptedJson(readFileSync(file, 'utf8'), pass)).connect(provider)
}

const FACTORY = process.env.ZEALZ_FACTORY ?? '', LOCKER = process.env.ZEALZ_LOCKER ?? ''
async function main() {
  if (!ethers.isAddress(FACTORY) || !ethers.isAddress(LOCKER)) { console.log(`${new Date().toISOString()} launchpad not deployed; nothing to compound`); return }
  const factory = new ethers.Contract(FACTORY, ['function launchCount() view returns (uint256)', 'function launches(uint256) view returns (address token, address creator, bytes32 poolId, uint256 positionId, uint8 curve, uint8 opening, uint64 at, uint16 burnBps, uint16 creatorBps)'], provider)
  const signer = await signerFromEnv()
  const locker = new ethers.Contract(LOCKER, ['function compound(uint256 tokenId)', 'function compoundedLiquidity(uint256) view returns (uint256)'], signer)
  const n = Number(await factory.launchCount())
  let done = 0
  for (let i = 0; i < n; i++) {
    const l = await factory.launches(i)
    try {
      await locker.compound.staticCall(l.positionId)
      const tx = await locker.compound(l.positionId); await tx.wait()
      console.log(`${new Date().toISOString()} compounded ${l.token} position ${l.positionId} tx ${tx.hash}`); done++
    } catch (e: any) {
      console.log(`${new Date().toISOString()} skip ${l.token}: ${e?.shortMessage ?? e?.message ?? e}`.slice(0, 200))
    }
  }
  console.log(`${new Date().toISOString()} compound run: ${done}/${n} positions`)
}
main().catch((e) => { console.error(`${new Date().toISOString()} ERROR ${e?.shortMessage ?? e?.message ?? e}`); process.exitCode = 1 })
