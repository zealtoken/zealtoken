import { ethers } from 'hardhat'
import { unlock } from './lib/secure'
/** ACTION=pause|unpause|status npm run desk:admin — toggle NEW redemption requests on the RedemptionDesk (fulfil and reclaim never pause). */
async function main() {
  const DESK = process.env.DESK_ADDRESS ?? '0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a'
  const action = process.env.ACTION ?? 'status'
  const d = await ethers.getContractAt('RedemptionDesk', DESK)
  console.log(`RedemptionDesk ${DESK}\nrequestsPaused ${await d.requestsPaused()}  requests ${await d.requestCount()}\n`)
  if (action === 'status') return
  const w = await unlock(ethers.provider)
  const tx = await (d.connect(w) as typeof d).setRequestsPaused(action === 'pause')
  console.log(`setRequestsPaused(${action === 'pause'}) ${tx.hash}`); await tx.wait(); console.log(`requestsPaused now ${await d.requestsPaused()}`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
