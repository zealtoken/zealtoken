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

const ONLY = (process.env.DEPLOY_ONLY ?? 'all').toLowerCase() // 'foundry' for Phase 00

async function main() {
  const [deployer] = await ethers.getSigners()
  const net = await ethers.provider.getNetwork()

  const reserveSink = requiredAddress('RESERVE_SINK')
  const liquiditySink = requiredAddress('LIQUIDITY_SINK')
  const opsSink = requiredAddress('OPS_SINK')

  const phase2 = ONLY === 'all'
  const zecReserveAddress = phase2 ? required('ZEC_RESERVE_ADDRESS') : ''
  const owner = phase2 ? requiredAddress('ZZEC_OWNER') : ethers.ZeroAddress
  const attestor = phase2 ? requiredAddress('ZZEC_ATTESTOR') : ethers.ZeroAddress
  const minter = phase2 ? requiredAddress('ZZEC_MINTER') : ethers.ZeroAddress
  const maxAttestationAge = Number(process.env.MAX_ATTESTATION_AGE ?? 36 * 3600)

  const zealToken = phase2 ? requiredAddress('ZEAL_TOKEN') : ethers.ZeroAddress
  const swapRouter = phase2 ? requiredAddress('SWAP_ROUTER') : ethers.ZeroAddress
  const igniter = phase2 ? requiredAddress('FURNACE_IGNITER') : ethers.ZeroAddress

  // These are the mistakes that are unrecoverable, so check them loudly.
  if (new Set([reserveSink, liquiditySink, opsSink]).size !== 3) {
    throw new Error('The three sinks must be distinct addresses.')
  }
  if (phase2 && attestor === minter) {
    throw new Error(
      'ZZEC_ATTESTOR and ZZEC_MINTER must differ — separating them is the whole point of the role split.',
    )
  }
  if (phase2 && !/^t[13]/.test(zecReserveAddress)) {
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
  if (phase2) {
    console.log(`ZEC reserve  ${zecReserveAddress}`)
    console.log(`zZEC owner   ${owner}`)
    console.log(`  attestor   ${attestor}`)
    console.log(`  minter     ${minter}`)
    console.log(`Furnace`)
    console.log(`  $ZEAL      ${zealToken}   << immutable`)
    console.log(`  router     ${swapRouter}   << immutable; must expose V3 exactInput WITH deadline`)
    console.log(`  igniter    ${igniter}`)
  } else {
    console.log(`Mode         DEPLOY_ONLY=foundry (Phase 00). zZEC and the Furnace deploy in Phase 02.`)
  }
  console.log()

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

  let zzecAddress: string | null = null
  let furnaceAddress: string | null = null
  if (phase2) {
    const ZZEC = await ethers.getContractFactory('ZZEC')
    const zzec = await ZZEC.deploy(zecReserveAddress, owner, attestor, minter, maxAttestationAge)
    await zzec.waitForDeployment()
    zzecAddress = await zzec.getAddress()
    console.log(`ZZEC         ${zzecAddress}`)

    const Furnace = await ethers.getContractFactory('ZealFurnace')
    const furnace = await Furnace.deploy(zealToken, swapRouter, owner, igniter)
    await furnace.waitForDeployment()
    furnaceAddress = await furnace.getAddress()
    console.log(`ZealFurnace  ${furnaceAddress}`)
  }
  console.log()

  const record = {
    network: network.name,
    chainId: Number(net.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: { ZealFoundry: foundryAddress, ZZEC: zzecAddress, ZealFurnace: furnaceAddress },
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
    zzec: phase2 ? { zecReserveAddress, owner, attestor, minter, maxAttestationAge } : null,
    furnace: phase2 ? { zealToken, swapRouter, owner, igniter } : null,
  }

  mkdirSync(join(__dirname, '..', 'deployments'), { recursive: true })
  const out = join(__dirname, '..', 'deployments', `${network.name}.json`)
  writeFileSync(out, JSON.stringify(record, null, 2) + '\n')
  console.log(`Wrote ${out}`)

  console.log(`\nNext:`)
  console.log(`  1. Point the Pons fee redirect for $ZEAL at ${foundryAddress}`)
  console.log(`  2. Paste the address(es) into src/config.ts on the website (CONTRACTS.*)`)
  if (phase2) console.log(`  2b. Point the zZEC LP position's fee collection at ${furnaceAddress}`)
  console.log(`  3. Verify on https://robinhoodchain.blockscout.com`)
  console.log(`  4. Post the first attestation before any mint — minting reverts without one\n`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
