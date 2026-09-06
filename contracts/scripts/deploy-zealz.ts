import { ethers, network } from 'hardhat'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'
import { mineSalt } from './deploy-hook'

/**
 * Deploys the zealz.fun launchpad in one go: the hook (CREATE2, address flags 0xCC), the factory
 * (whose address the hook needs, so it is predicted from the deployer's next nonce), the locker, and
 * wires them. Everything is printed before the first transaction; the script waits for a keystore
 * passphrase, so it never runs unattended.
 *
 *   OPENING_CAP_ZZEC=2 LAUNCH_FEE_ZATS=500000 TREASURY=0x... npm run zealz:deploy
 */
const CREATE2 = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951', POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7', PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402', FURNACE = '0x72C2f71dC3c0058974fd59039F9A79397bf87E70'
const SUPPLY = 1e27
const tickFor = (price: number, spacing: number) => { const t = Math.floor(Math.log(price) / Math.log(1.0001)); return Math.floor(t / spacing) * spacing }

async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const wallet = await unlock(ethers.provider)
  const treasury = process.env.TREASURY ?? wallet.address
  const capZzec = Number(process.env.OPENING_CAP_ZZEC ?? 2) // whole supply opens at this market cap, in zZEC
  const launchFee = BigInt(process.env.LAUNCH_FEE_ZATS ?? 500_000) // 0.005 zZEC
  const openPrice0 = (capZzec * 1e8) / SUPPLY // zZEC raw units per token raw unit, token as currency0
  const openTick0 = tickFor(openPrice0, 60), openTick1 = tickFor(1 / openPrice0, 60)
  const abi = ethers.AbiCoder.defaultAbiCoder()
  const Hook = await ethers.getContractFactory('ZealzHook', wallet)
  const nonce = await ethers.provider.getTransactionCount(wallet.address)
  const factoryAddr = ethers.getCreateAddress({ from: wallet.address, nonce: nonce + 1 }) // hook deploy is nonce, factory is nonce + 1
  const initCode = ethers.concat([Hook.bytecode, abi.encode(['address', 'address', 'address', 'address', 'address'], [POOL_MANAGER, factoryAddr, FURNACE, treasury, ZZEC])])
  const { salt, address: hookAddr } = mineSalt(ethers.keccak256(initCode), 0x00ccn)
  console.log(`\nDeployer   ${wallet.address}\nTreasury   ${treasury}\nOpening    ${capZzec} zZEC cap · ticks ${openTick0} / ${openTick1}\nLaunch fee ${launchFee} zats\nHook       ${hookAddr} (salt ${salt})\nFactory    ${factoryAddr} (predicted)\n`)
  if ((await ethers.provider.getCode(hookAddr)) !== '0x') throw new Error('hook already deployed at that address')

  const t1 = await wallet.sendTransaction({ to: CREATE2, data: ethers.concat([salt, initCode]) }); console.log(`hook tx    ${t1.hash}`); await t1.wait()
  const factory = await (await ethers.getContractFactory('ZealzFactory', wallet)).deploy(POSM, PERMIT2, POOL_MANAGER, ZZEC, hookAddr, treasury, launchFee, openTick0, openTick1)
  await factory.waitForDeployment()
  if ((await factory.getAddress()).toLowerCase() !== factoryAddr.toLowerCase()) throw new Error(`factory landed at ${await factory.getAddress()}, hook expects ${factoryAddr}`)
  console.log(`factory    ${await factory.getAddress()}`)
  const locker = await (await ethers.getContractFactory('ZealzLocker', wallet)).deploy(POSM, POOL_MANAGER, PERMIT2, factoryAddr)
  await locker.waitForDeployment(); console.log(`locker     ${await locker.getAddress()}`)
  const t2 = await factory.setLocker(await locker.getAddress()); await t2.wait(); console.log(`setLocker  ${t2.hash}`)

  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  rec.contracts.ZealzHook = hookAddr; rec.contracts.ZealzFactory = factoryAddr; rec.contracts.ZealzLocker = await locker.getAddress()
  rec.zealz = { treasury, openingCapZzec: capZzec, launchFeeZats: launchFee.toString(), openTick0, openTick1, hookSalt: salt, deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`\nrecorded in ${file}\nnext: set CONTRACTS in zealz.fun/src/config.ts, ZEALZ_FACTORY/ZEALZ_LOCKER in ops/.env, verify on Sourcify`)
}
main().catch((e) => { console.error(e); process.exit(1) })
