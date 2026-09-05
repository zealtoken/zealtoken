import { ethers, network } from 'hardhat'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Deploys the RedemptionDesk. Owner defaults to the deployer; operator is the
 * fulfiller key (DESK_OPERATOR), minimum 0.001 zZEC unless DESK_MIN_ZZEC is set.
 *   DESK_OPERATOR=0x... npm run desk
 */
const ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402'
async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const wallet = await unlock(ethers.provider)
  const owner = ethers.getAddress((process.env.DESK_OWNER ?? wallet.address).trim())
  const operator = ethers.getAddress((process.env.DESK_OPERATOR ?? '').trim())
  const min = BigInt(Math.round(Number(process.env.DESK_MIN_ZZEC ?? '0.001') * 1e8))
  console.log(`\nDeployer ${wallet.address}\nowner    ${owner}\noperator ${operator}\nmin      ${Number(min) / 1e8} zZEC\n`)
  const D = (await ethers.getContractFactory('RedemptionDesk')).connect(wallet)
  const desk = await D.deploy(ZZEC, owner, operator, min)
  await desk.waitForDeployment()
  const addr = await desk.getAddress()
  console.log(`RedemptionDesk ${addr}`)
  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  rec.contracts = { ...(rec.contracts ?? {}), RedemptionDesk: addr }
  rec.desk = { zzec: ZZEC, owner, operator, minZzec: min.toString(), deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`\nNext: CONTRACTS.desk in src/config.ts, DESK_ADDRESS in ops/.env, verify on Blockscout.\n`)
}
main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exitCode = 1 })
