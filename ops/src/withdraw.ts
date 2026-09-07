/**
 * Move ETH or zZEC out of a role wallet, without ever exposing its private key.
 *
 *   ROLE=keeper TO=0x... npm run withdraw                 # report only, signs nothing
 *   ROLE=keeper TO=0x... AMOUNT_ETH=0.9 npm run withdraw -- --execute
 *   ROLE=keeper TO=0x... ALL=1 npm run withdraw -- --execute      # everything but a gas reserve
 *   ROLE=keeper TO=0x... AMOUNT_ZZEC=0.2 npm run withdraw -- --execute
 *
 * Passphrase comes from <ROLE>_PASS or an interactive prompt. Nothing is sent without --execute.
 */
import { managedSend } from './managed-send.js'
import { ethers } from 'ethers'
import { CONTRACTS } from './config.js'
import { provider, roleSigner, type Role } from './chain.js'

const GAS_RESERVE = ethers.parseEther(process.env.GAS_RESERVE_ETH ?? '0.02')
const EXECUTE = process.argv.includes('--execute')

async function main() {
  const role = (process.env.ROLE ?? 'keeper') as Role
  const to = process.env.TO
  if (!to || !ethers.isAddress(to)) throw new Error('TO must be an address')
  const w = await roleSigner(role)
  const zzec = new ethers.Contract(CONTRACTS.zzec, ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'], w)
  const [eth, z] = await Promise.all([provider.getBalance(w.address), zzec.balanceOf(w.address)])
  console.log(`${role} ${w.address}`)
  console.log(`  holds ${ethers.formatEther(eth)} ETH and ${(Number(z) / 1e8).toFixed(8)} zZEC`)
  console.log(`  to    ${to}`)

  if (process.env.AMOUNT_ZZEC) {
    const amt = BigInt(Math.round(Number(process.env.AMOUNT_ZZEC) * 1e8))
    if (amt > z) throw new Error(`only ${(Number(z) / 1e8).toFixed(8)} zZEC available`)
    console.log(`  send  ${(Number(amt) / 1e8).toFixed(8)} zZEC`)
    if (!EXECUTE) return console.log('\ndry run. add --execute to send.')
    const tx = await managedSend(w, await zzec.transfer.populateTransaction(to, amt)); console.log(`  tx ${tx.hash}`); await tx.wait(); console.log('  confirmed')
    return
  }

  let value: bigint
  if (process.env.ALL === '1') {
    const fee = (await provider.getFeeData()).maxFeePerGas ?? ethers.parseUnits('0.1', 'gwei')
    const cost = fee * 21_000n * 2n
    value = eth - GAS_RESERVE - cost
    if (value <= 0n) throw new Error('nothing above the gas reserve')
  } else {
    if (!process.env.AMOUNT_ETH) throw new Error('set AMOUNT_ETH, or ALL=1 to sweep all but the gas reserve')
    value = ethers.parseEther(process.env.AMOUNT_ETH)
    if (value > eth - GAS_RESERVE) throw new Error(`that would leave less than the ${ethers.formatEther(GAS_RESERVE)} ETH gas reserve`)
  }
  console.log(`  send  ${ethers.formatEther(value)} ETH   (leaving ${ethers.formatEther(eth - value)} for gas)`)
  if (!EXECUTE) return console.log('\ndry run. add --execute to send.')
  const tx = await managedSend(w, { to, value })
  console.log(`  tx ${tx.hash}`); await tx.wait(); console.log('  confirmed')
}
main().catch((e) => { console.error(`${new Date().toISOString()} ERROR ${e?.shortMessage ?? e?.message ?? e}`); process.exitCode = 1 })
