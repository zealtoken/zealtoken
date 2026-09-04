import { ethers } from 'hardhat'
import { unlock } from './lib/secure'

/**
 * Owner action on ZZEC: set maxAttestationAge. The scheduler attests every 6h,
 * so a 12h window means a mint can never rely on a number older than two
 * missed runs.   ATTESTATION_AGE_HOURS=12 npm run zzec:age
 */
const ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402'
async function main() {
  const hours = Number(process.env.ATTESTATION_AGE_HOURS ?? 12)
  if (!(hours >= 1 && hours <= 168)) throw new Error('1..168 hours')
  const wallet = await unlock(ethers.provider)
  const c = new ethers.Contract(ZZEC, ['function owner() view returns (address)', 'function maxAttestationAge() view returns (uint64)', 'function setMaxAttestationAge(uint64)'], wallet)
  if ((await c.owner()).toLowerCase() !== wallet.address.toLowerCase()) throw new Error('keystore is not the ZZEC owner')
  console.log(`maxAttestationAge ${await c.maxAttestationAge()}s -> ${hours * 3600}s`)
  const tx = await c.setMaxAttestationAge(hours * 3600)
  console.log(`tx ${tx.hash}`); await tx.wait()
  console.log(`now ${await c.maxAttestationAge()}s`)
}
main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exitCode = 1 })
