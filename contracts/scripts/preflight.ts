import { ethers, network } from 'hardhat'
import { keystoreAddress, keystoreExists } from './lib/secure'

/**
 * Everything that can be checked before a single wei of gas is spent.
 *
 * The Foundry's sinks and split are immutable, so a wrong address here is
 * permanent. This script validates the whole configuration, simulates the real
 * deployment against live chain state, prices it, and deploys NOTHING.
 *
 *   cd contracts && npx hardhat run scripts/preflight.ts --network rhMainnet
 */

const SPLIT = { reserve: 6_000n, liquidity: 2_500n, ops: 1_500n }
const EXPECTED_CHAIN = 4663n

const problems: string[] = []
const warnings: string[] = []

function addr(name: string): string | null {
  const v = (process.env[name] ?? '').trim()
  if (!v) {
    problems.push(`${name} is not set in contracts/.env`)
    return null
  }
  if (!ethers.isAddress(v)) {
    problems.push(`${name} is not a valid address: ${v}`)
    return null
  }
  const c = ethers.getAddress(v)
  if (c === ethers.ZeroAddress) problems.push(`${name} is the zero address`)
  if (v !== c && v.toLowerCase() !== v) {
    warnings.push(`${name} checksum differs from input; using ${c}`)
  }
  return c
}

async function main() {
  const net = await ethers.provider.getNetwork()
  const deployerAddr = keystoreAddress()

  console.log(`\n${'='.repeat(64)}`)
  console.log(`PREFLIGHT  ${network.name}  chainId ${net.chainId}`)
  console.log('='.repeat(64))

  if (net.chainId !== EXPECTED_CHAIN) {
    problems.push(`connected to chainId ${net.chainId}, expected ${EXPECTED_CHAIN} (Robinhood Chain)`)
  }
  if (!keystoreExists()) {
    problems.push('no keystore. Run: npm run key:create')
  } else if (!deployerAddr) {
    problems.push('keystore is unreadable. Recreate it with: npm run key:create')
  }

  const reserveSink = addr('RESERVE_SINK')
  const liquiditySink = addr('LIQUIDITY_SINK')
  const opsSink = addr('OPS_SINK')

  const sinks = [reserveSink, liquiditySink, opsSink].filter(Boolean) as string[]
  if (sinks.length === 3 && new Set(sinks).size !== 3) {
    problems.push('the three sinks must be distinct addresses')
  }

  const total = SPLIT.reserve + SPLIT.liquidity + SPLIT.ops
  if (total !== 10_000n) problems.push(`split totals ${total} bps, must be 10000`)

  // ---- deployer ----
  let balance = 0n
  let deployer = ''
  if (deployerAddr) {
    deployer = deployerAddr
    balance = await ethers.provider.getBalance(deployer)
    console.log(`\nDeployer      ${deployer}   (from keystore, not unlocked)`)
    console.log(`Balance       ${ethers.formatEther(balance)} ETH`)
    if (balance === 0n) problems.push('deployer has no ETH; it cannot pay gas')
    if (sinks.includes(deployer)) {
      warnings.push('the deployer is also one of the sinks; fine, but usually a mistake')
    }
  }

  // ---- what the sinks actually are ----
  console.log(`\nSinks (IMMUTABLE once deployed)`)
  for (const [label, a] of [
    ['reserve  60%', reserveSink],
    ['liquidity 25%', liquiditySink],
    ['ops       15%', opsSink],
  ] as const) {
    if (!a) {
      console.log(`  ${label}  <missing>`)
      continue
    }
    const code = await ethers.provider.getCode(a)
    const kind = code === '0x' ? 'EOA / wallet' : `contract (${(code.length - 2) / 2} bytes)`
    const bal = await ethers.provider.getBalance(a)
    console.log(`  ${label}  ${a}   ${kind}, ${ethers.formatEther(bal)} ETH`)
    if (code === '0x' && label.startsWith('reserve')) {
      warnings.push(
        'the reserve sink is a plain wallet, not a multisig. It can never be changed. Consider a Safe.',
      )
    }
  }

  // ---- simulate the real deployment against live state ----
  if (problems.length === 0) {
    const Foundry = await ethers.getContractFactory('ZealFoundry')
    const tx = await Foundry.getDeployTransaction(
      SPLIT.reserve,
      SPLIT.liquidity,
      SPLIT.ops,
      reserveSink!,
      liquiditySink!,
      opsSink!,
    )
    try {
      const gas = await ethers.provider.estimateGas({ ...tx, from: deployer })
      const fee = await ethers.provider.getFeeData()
      const price = fee.maxFeePerGas ?? fee.gasPrice ?? 0n
      const cost = gas * price
      console.log(`\nSimulated deploy`)
      console.log(`  gas estimate  ${gas.toLocaleString('en-US')}`)
      console.log(`  gas price     ${ethers.formatUnits(price, 'gwei')} gwei`)
      console.log(`  est. cost     ${ethers.formatEther(cost)} ETH`)
      if (balance < cost * 2n) {
        warnings.push(
          `balance is thin: ${ethers.formatEther(balance)} ETH against an estimated ${ethers.formatEther(cost)} ETH`,
        )
      }
    } catch (e) {
      problems.push(`deployment simulation reverted: ${(e as Error).message.split('\n')[0]}`)
    }
  }

  // ---- verdict ----
  console.log(`\n${'-'.repeat(64)}`)
  if (warnings.length) {
    console.log('WARNINGS')
    warnings.forEach((w) => console.log(`  ! ${w}`))
  }
  if (problems.length) {
    console.log('BLOCKERS')
    problems.forEach((p) => console.log(`  x ${p}`))
    console.log(`\nNOT READY. Nothing was deployed.\n`)
    process.exitCode = 2
    return
  }
  console.log('READY. Nothing was deployed.')
  console.log('\nTo deploy for real:')
  console.log('  DEPLOY_ONLY=foundry npm run deploy:mainnet\n')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
