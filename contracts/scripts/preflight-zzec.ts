import { ethers, network } from 'hardhat'
import { keystoreAddress, keystoreExists } from './lib/secure'

/**
 * Phase 02 preflight: validates every zZEC constructor input, simulates the
 * deployment against live chain state, prices it, and deploys NOTHING.
 *
 *   ZEC_RESERVE_ADDRESS=t1... ZZEC_ATTESTOR=0x... ZZEC_MINTER=0x... npm run preflight:zzec
 *
 * ZZEC_OWNER defaults to the deployer. reserveAddress is set once in the
 * constructor and has no setter, so a typo here is permanent.
 */
const EXPECTED_CHAIN = 4663n
const problems: string[] = []
const warnings: string[] = []

function addr(name: string, fallback?: string): string | null {
  const v = (process.env[name] ?? fallback ?? '').trim()
  if (!v) { problems.push(`${name} is not set`); return null }
  if (!ethers.isAddress(v)) { problems.push(`${name} is not a valid address: ${v}`); return null }
  return ethers.getAddress(v)
}

async function main() {
  const net = await ethers.provider.getNetwork()
  const deployer = keystoreAddress()
  console.log(`\n${'='.repeat(64)}\nPREFLIGHT zZEC  ${network.name}  chainId ${net.chainId}\n${'='.repeat(64)}`)
  if (net.chainId !== EXPECTED_CHAIN) problems.push(`connected to chainId ${net.chainId}, expected ${EXPECTED_CHAIN}`)
  if (!keystoreExists() || !deployer) problems.push('no readable keystore. Run: npm run key:create')

  const reserve = (process.env.ZEC_RESERVE_ADDRESS ?? '').trim()
  if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(reserve)) {
    problems.push(`ZEC_RESERVE_ADDRESS must be a Zcash transparent address (t1.../t3..., 35 chars), got "${reserve || '<unset>'}"`)
  }
  const owner = addr('ZZEC_OWNER', deployer ?? undefined)
  const attestor = addr('ZZEC_ATTESTOR')
  const minter = addr('ZZEC_MINTER')
  if (attestor && minter && attestor === minter) problems.push('attestor and minter must be different keys; that separation is the design')
  const maxAge = Number(process.env.MAX_ATTESTATION_AGE ?? 36 * 3600)
  if (!(maxAge >= 3600 && maxAge <= 7 * 86400)) problems.push(`MAX_ATTESTATION_AGE ${maxAge}s is outside 1h..7d`)

  let balance = 0n
  if (deployer) {
    balance = await ethers.provider.getBalance(deployer)
    console.log(`\nDeployer   ${deployer}  ${ethers.formatEther(balance)} ETH`)
    if (balance === 0n) problems.push('deployer has no ETH for gas')
  }
  console.log(`Reserve    ${reserve || '<unset>'}   << immutable, no setter`)
  console.log(`Owner      ${owner}   (48h timelocked role changes)`)
  console.log(`Attestor   ${attestor}`)
  console.log(`Minter     ${minter}`)
  console.log(`Max age    ${maxAge}s (${(maxAge / 3600).toFixed(1)}h)`)
  for (const [n, a] of [['attestor', attestor], ['minter', minter]] as const) {
    if (a && (await ethers.provider.getCode(a)) !== '0x') warnings.push(`${n} is a contract, not a key; it cannot sign attestations`)
    if (a && a === deployer) warnings.push(`${n} is the deployer key; fine for tonight, rotate via propose/commit later`)
  }

  if (problems.length === 0) {
    const ZZEC = await ethers.getContractFactory('ZZEC')
    const tx = await ZZEC.getDeployTransaction(reserve, owner!, attestor!, minter!, maxAge)
    try {
      const gas = await ethers.provider.estimateGas({ ...tx, from: deployer! })
      const fee = await ethers.provider.getFeeData()
      const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
      console.log(`\nSimulated deploy  gas ${gas.toLocaleString('en-US')}  ~${ethers.formatEther(gas * price)} ETH`)
      if (balance < gas * price * 2n) warnings.push('deployer balance is thin for this deploy')
    } catch (e) {
      problems.push(`simulation reverted: ${(e as Error).message.split('\n')[0]}`)
    }
  }

  console.log(`\n${'-'.repeat(64)}`)
  warnings.forEach((w) => console.log(`  ! ${w}`))
  if (problems.length) {
    problems.forEach((p) => console.log(`  x ${p}`))
    console.log('\nNOT READY. Nothing was deployed.\n'); process.exitCode = 2; return
  }
  console.log('READY. Nothing was deployed.\nTo deploy:  npm run zzec\n')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
