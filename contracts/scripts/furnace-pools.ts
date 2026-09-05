import { ethers, network } from 'hardhat'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Owner action on the Furnace: rotate its pool keys to the hooked zZEC market.
 *   HOOK_ADDRESS=0x... npm run furnace:pools -- propose   (48h timelock starts)
 *   npm run furnace:pools -- commit                       (after 48h, within 7 days)
 *   npm run furnace:pools -- status
 */
const ZEAL = '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC', ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402', PONS_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044', ZERO = ethers.ZeroAddress
const KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
async function main() {
  const cmd = process.argv.find((a) => ['propose', 'commit', 'status'].includes(a)) ?? 'status'
  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const furnaceAddr = process.env.FURNACE_ADDRESS ?? rec.contracts?.ZealFurnaceV4
  const abi = [`function proposePools(${KEY_T} zzecPool,${KEY_T} zealPool)`, 'function commitPools()', `function pendingPools() view returns (${KEY_T} zzecPool,${KEY_T} zealPool,uint64 eta,bool set)`, `function zzecPool() view returns (${KEY_T})`, 'function owner() view returns (address)']
  const ro = new ethers.Contract(furnaceAddr, abi, ethers.provider)
  const cur = await ro.zzecPool(); const pend = await ro.pendingPools()
  console.log(`\nFurnace ${furnaceAddr}\ncurrent zZEC pool: fee ${cur.fee} spacing ${cur.tickSpacing} hooks ${cur.hooks}`)
  console.log(pend.set ? `pending: fee ${pend.zzecPool.fee} spacing ${pend.zzecPool.tickSpacing} hooks ${pend.zzecPool.hooks} · executable ${new Date(Number(pend.eta) * 1000).toISOString()}` : 'pending: none')
  if (cmd === 'status') return
  const wallet = await unlock(ethers.provider)
  if ((await ro.owner()).toLowerCase() !== wallet.address.toLowerCase()) throw new Error('keystore is not the Furnace owner')
  const c = ro.connect(wallet) as ethers.Contract
  if (cmd === 'propose') {
    const hook = process.env.HOOK_ADDRESS ?? rec.contracts?.ZealBurnHook
    if (!ethers.isAddress(hook)) throw new Error('HOOK_ADDRESS required')
    const fee = Number(process.env.POOL_FEE ?? 3000), spacing = Number(process.env.POOL_TICK_SPACING ?? 60)
    const zzecPool = { currency0: ZERO, currency1: ZZEC, fee, tickSpacing: spacing, hooks: hook }
    const zealPool = { currency0: ZERO, currency1: ZEAL, fee: 0, tickSpacing: 200, hooks: PONS_HOOK }
    const tx = await c.proposePools(zzecPool, zealPool); console.log(`propose tx ${tx.hash}`); await tx.wait()
    console.log('proposed; commit after 48h (within 7 days)')
  } else {
    const tx = await c.commitPools(); console.log(`commit tx ${tx.hash}`); await tx.wait(); console.log('committed')
  }
}
main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exitCode = 1 })
