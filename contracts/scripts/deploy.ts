import { ethers, network } from 'hardhat'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deploys ZealFoundry and ZZEC.
 *
 * Everything comes from the environment so nothing sensitive or
 * deployment-specific is committed. The script refuses to run rather than
 * guessing, because every one of these values is either immutable after
 * deployment or expensive to change.
 */

const SPLIT = { reserve: 6_000n, liquidity: 2_500n, ops: 1_500n }

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '') {
    throw new Error(`Missing ${name}. Every value is required — see contracts/README.md.`)
  }
  return v.trim()
}

function requiredAddress(name: string): string {
  const v = required(name)
  if (!ethers.isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`)
  return ethers.getAddress(v)
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const net = await ethers.provider.getNetwork()

  const reserveSink = requiredAddress('RESERVE_SINK')
  const liquiditySink = requiredAddress('LIQUIDITY_SINK')
  const opsSink = requiredAddress('OPS_SINK')

  const zecReserveAddress = required('ZEC_RESERVE_ADDRESS')
  const owner = requiredAddress('ZZEC_OWNER')
  const attestor = requiredAddress('ZZEC_ATTESTOR')
  const minter = requiredAddress('ZZEC_MINTER')
  const maxAttestationAge = Number(process.env.MAX_ATTESTATION_AGE ?? 36 * 3600)

  // These are the mistakes that are unrecoverable, so check them loudly.
  if (new Set([reserveSink, liquiditySink, opsSink]).size !== 3) {
    throw new Error('The three sinks must be distinct addresses.')
  }
  if (attestor === minter) {
    throw new Error(
      'ZZEC_ATTESTOR and ZZEC_MINTER must differ — separating them is the whole point of the role split.',
    )
  }
  if (!/^t[13]/.test(zecReserveAddress)) {
    throw new Error(
      `ZEC_RESERVE_ADDRESS must be a Zcash *transparent* address (t1.../t3...), got "${zecReserveAddress}". ` +
        'A shielded reserve cannot be publicly audited, which defeats the design.',
    )
  }

  console.log(`\nNetwork      ${network.name} (chainId ${net.chainId})`)
  console.log(`Deployer     ${deployer.address}`)
  console.log(`Balance      ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`)
  console.log(`Split        ${SPLIT.reserve / 100n}% reserve / ${SPLIT.liquidity / 100n}% liquidity / ${SPLIT.ops / 100n}% ops`)
  console.log(`Reserve sink ${reserveSink}   << immutable, cannot ever be changed`)
  console.log(`Liquidity    ${liquiditySink}`)
  console.log(`Ops          ${opsSink}`)
  console.log(`ZEC reserve  ${zecReserveAddress}`)
  console.log(`zZEC owner   ${owner}`)
  console.log(`  attestor   ${attestor}`)
  console.log(`  minter     ${minter}\n`)

  const Foundry = await ethers.getContractFactory('ZealFoundry')
  const foundry = await Foundry.deploy(
    SPLIT.reserve,
    SPLIT.liquidity,
    SPLIT.ops,
    reserveSink,
    liquiditySink,
    opsSink,
  )
  await foundry.waitForDeployment()
  const foundryAddress = await foundry.getAddress()
  console.log(`ZealFoundry  ${foundryAddress}`)

  const ZZEC = await ethers.getContractFactory('ZZEC')
  const zzec = await ZZEC.deploy(zecReserveAddress, owner, attestor, minter, maxAttestationAge)
  await zzec.waitForDeployment()
  const zzecAddress = await zzec.getAddress()
  console.log(`ZZEC         ${zzecAddress}\n`)

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: { ZealFoundry: foundryAddress, ZZEC: zzecAddress },
    foundry: {
      split: {
        reserveBps: Number(SPLIT.reserve),
        liquidityBps: Number(SPLIT.liquidity),
        opsBps: Number(SPLIT.ops),
      },
      reserveSink,
      liquiditySink,
      opsSink,
    },
    zzec: { zecReserveAddress, owner, attestor, minter, maxAttestationAge },
  }

  mkdirSync(join(__dirname, '..', 'deployments'), { recursive: true })
  const out = join(__dirname, '..', 'deployments', `${network.name}.json`)
  writeFileSync(out, JSON.stringify(record, null, 2) + '\n')
  console.log(`Wrote ${out}`)

  console.log(`\nNext:`)
  console.log(`  1. Point the Pons fee redirect for $ZEAL at ${foundryAddress}`)
  console.log(`  2. Paste both addresses into src/config.ts on the website`)
  console.log(`  3. Verify on https://robinhoodchain.blockscout.com`)
  console.log(`  4. Post the first attestation before any mint — minting reverts without one\n`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
