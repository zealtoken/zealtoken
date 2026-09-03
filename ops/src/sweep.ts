/**
 * The reserve leg: ETH in the sink on Robinhood Chain -> native ZEC at the
 * reserve t-address.
 *
 * Two hops, because NEAR Intents does not list chain 4663 as an origin:
 *   1. Robinhood Chain ETH -> Arbitrum ETH via a fast bridge (Relay or Across;
 *      the canonical bridge is a 7-day challenge window, unusable here).
 *   2. Arbitrum ETH -> native ZEC via the NEAR Intents 1Click API: request a
 *      quote, send to its depositAddress, poll status until ZEC lands.
 *
 * Wired once the rail schemas are confirmed; see the README. Until then this
 * prints what it would do and exits non-zero so it can't be run by accident.
 */
import { ethers } from 'ethers'
import { provider } from './chain.js'
import { RESERVE } from './config.js'

async function main() {
  const bal = await provider.getBalance(RESERVE.sinkEvm)
  console.log(`sink holds ${ethers.formatEther(bal)} ETH`)
  console.log(`would: bridge 4663 -> Arbitrum, then 1Click ETH -> ZEC to ${RESERVE.zcashTAddress || '<ZEC_RESERVE_ADDRESS unset>'}`)
  console.log('sweep is not wired yet')
  process.exitCode = 2
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
