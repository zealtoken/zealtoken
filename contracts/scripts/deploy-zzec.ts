import { ethers, network } from 'hardhat'
import { unlock } from './lib/secure'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Phase 02: deploy ZZEC alone. The Foundry is already live and the Furnace
 * waits on its Uniswap V4 rebuild, so this touches neither.
 *
 * On deploy the supply is 0 and nothing can be minted: mint() requires a fresh
 * attestation and caps at the attested reserve. So "live" here means the
 * rules are on-chain and readable, not that zZEC exists yet.
 */
async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const deployer = await unlock(ethers.provider)

  const reserve = (process.env.ZEC_RESERVE_ADDRESS ?? '').trim()
  if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(reserve)) throw new Error('ZEC_RESERVE_ADDRESS must be a transparent t-address')
  const owner = ethers.getAddress((process.env.ZZEC_OWNER ?? deployer.address).trim())
  const attestor = ethers.getAddress((process.env.ZZEC_ATTESTOR ?? '').trim())
  const minter = ethers.getAddress((process.env.ZZEC_MINTER ?? '').trim())
  if (attestor === minter) throw new Error('attestor and minter must differ')
  const maxAge = Number(process.env.MAX_ATTESTATION_AGE ?? 36 * 3600)

  console.log(`\nNetwork    ${network.name} (${net.chainId})\nDeployer   ${deployer.address}\nReserve    ${reserve}\nOwner      ${owner}\nAttestor   ${attestor}\nMinter     ${minter}\nMax age    ${maxAge}s\n`)

  const ZZEC = (await ethers.getContractFactory('ZZEC')).connect(deployer)
  const zzec = await ZZEC.deploy(reserve, owner, attestor, minter, maxAge)
  await zzec.waitForDeployment()
  const address = await zzec.getAddress()
  console.log(`ZZEC       ${address}\n`)

  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: Number(net.chainId), contracts: {} }
  rec.contracts = { ...(rec.contracts ?? {}), ZZEC: address }
  rec.zzec = { deployedAt: new Date().toISOString(), zecReserveAddress: reserve, owner, attestor, minter, maxAttestationAge: maxAge }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`Wrote ${file}\n\nNext:\n  1. CONTRACTS.zzec = '${address}' in src/config.ts and ZZEC_ADDRESS in ops/.env\n  2. Verify the source on robinhoodchain.blockscout.com\n  3. First attestation before any mint (ops: npm run attest)\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
