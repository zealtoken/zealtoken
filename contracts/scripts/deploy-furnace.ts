import { ethers, network } from 'hardhat'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Deploys ZealFurnaceV4 against the live Uniswap v4 core on Robinhood Chain.
 * Both pool keys are fixed facts: the Pons-hooked $ZEAL/ETH pool and our
 * hookless zZEC/ETH pool at 1% / spacing 200.
 *
 *   FURNACE_IGNITER=0x... npm run furnace      (owner defaults to the deployer)
 *
 * Deploy AFTER the zZEC/ETH pool exists (ops: npm run pool); the constructor
 * refuses pools that are not initialized. To hand it the LP NFT afterwards, the
 * OWNER must call positionManager.safeTransferFrom(owner, furnace, tokenId).
 */
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
const POSITION_MANAGER = '0x58daec3116aae6d93017baaea7749052e8a04fa7'
const ZEAL = '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC'
const ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402'
const PONS_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'
const ZERO = ethers.ZeroAddress

async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const wallet = await unlock(ethers.provider)
  const owner = ethers.getAddress((process.env.FURNACE_OWNER ?? wallet.address).trim())
  const igniter = ethers.getAddress((process.env.FURNACE_IGNITER ?? wallet.address).trim())
  const zzecPool = { currency0: ZERO, currency1: ZZEC, fee: 10_000, tickSpacing: 200, hooks: ZERO }
  const zealPool = { currency0: ZERO, currency1: ZEAL, fee: 0, tickSpacing: 200, hooks: PONS_HOOK }
  const keyT = 'tuple(address,address,uint24,int24,address)'
  const id = (k: typeof zzecPool) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode([keyT], [[k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]]))
  if (id(zealPool) !== '0x95f9fcf8eb2d707d6c9c8175822c6005fcce759933e54f8d5ca6df458c8ccaf0') throw new Error('$ZEAL pool key does not reproduce the known poolId')

  console.log(`\nDeployer ${wallet.address}  ${ethers.formatEther(await ethers.provider.getBalance(wallet.address))} ETH`)
  console.log(`owner    ${owner}\nigniter  ${igniter}\nzZEC pool ${id(zzecPool)}\n$ZEAL pool ${id(zealPool)}\n`)
  const F = (await ethers.getContractFactory('ZealFurnaceV4')).connect(wallet)
  const maxImpactBps = Number(process.env.FURNACE_MAX_IMPACT_BPS ?? 250) // sqrt-price bps; ~5% price per leg
  console.log(`impact   ${maxImpactBps} bps of sqrt price per leg (about ${(1 - (1 - maxImpactBps / 10000) ** 2) * 100}% price)\n`)
  const furnace = await F.deploy(POOL_MANAGER, POSITION_MANAGER, ZEAL, ZZEC, zzecPool, zealPool, maxImpactBps, owner, igniter)
  await furnace.waitForDeployment()
  const addr = await furnace.getAddress()
  console.log(`ZealFurnaceV4 ${addr}`)
  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  rec.contracts = { ...(rec.contracts ?? {}), ZealFurnaceV4: addr }
  rec.furnaceV4 = { poolManager: POOL_MANAGER, positionManager: POSITION_MANAGER, zeal: ZEAL, zzec: ZZEC, owner, igniter, deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`\nNext:\n  1. CONTRACTS.furnace = '${addr}' in src/config.ts\n  2. Verify on robinhoodchain.blockscout.com\n  3. As owner: positionManager.safeTransferFrom(owner, furnace, tokenId) so collectFees() works (safeTransferFrom, not transferFrom)\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
