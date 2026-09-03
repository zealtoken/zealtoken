import { ethers, network } from 'hardhat'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Deploys ZealTap, the claim-capable creator-fee recipient for Pons V2.
 * Both constructor args are fixed facts of the live system.
 */
const ESCROW = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e' // Pons V2FeeEscrow
const FOUNDRY = '0xa1C1Fb281cCC47C587565a01700bF61a03D885a6'

async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const wallet = await unlock(ethers.provider)
  console.log(`\nDeployer ${wallet.address}  balance ${ethers.formatEther(await ethers.provider.getBalance(wallet.address))} ETH`)
  console.log(`escrow   ${ESCROW}\nfoundry  ${FOUNDRY}\n`)

  const Tap = (await ethers.getContractFactory('ZealTap')).connect(wallet)
  const tap = await Tap.deploy(ESCROW, FOUNDRY)
  await tap.waitForDeployment()
  const addr = await tap.getAddress()
  console.log(`ZealTap  ${addr}`)

  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  mkdirSync(join(__dirname, '..', 'deployments'), { recursive: true })
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  rec.contracts = { ...(rec.contracts || {}), ZealTap: addr }
  rec.tap = { escrow: ESCROW, foundry: FOUNDRY, deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`\nNext: ask Pons to call setCreatorFeeRecipient(0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC, ${addr})\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
