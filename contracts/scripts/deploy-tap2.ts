import { ethers, network } from 'hardhat'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Deploys ZealTapV2: the creator-fee recipient that can sweep its own pool
 * and migrate itself. Every constructor arg is a fixed fact of the live
 * system except the steward, which defaults to the deployer.
 *
 *   TAP_STEWARD=0x... npm run tap2
 */
const ESCROW = '0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'
const FOUNDRY = '0xa1C1Fb281cCC47C587565a01700bF61a03D885a6'
const HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'
const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const TOKEN = '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC'
const POOL_ID = '0x95f9fcf8eb2d707d6c9c8175822c6005fcce759933e54f8d5ca6df458c8ccaf0'

async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const wallet = await unlock(ethers.provider)
  const steward = ethers.getAddress((process.env.TAP_STEWARD ?? wallet.address).trim())

  // Sanity: the pool the hook knows must be $ZEAL's.
  const hook = new ethers.Contract(HOOK, ['function launches(bytes32) view returns (bool registered,bool memecoinIsCurrency0,address memecoin,address quoteToken,address creator,address buybackCreatorRecipient,address protocolFeeRecipient,uint16,uint16,uint16,uint16,uint16,bool)'], ethers.provider)
  const info = await hook.launches(POOL_ID)
  if (!info.registered || info.memecoin.toLowerCase() !== TOKEN.toLowerCase()) throw new Error('poolId does not resolve to $ZEAL on the hook')

  console.log(`\nDeployer ${wallet.address}  balance ${ethers.formatEther(await ethers.provider.getBalance(wallet.address))} ETH`)
  console.log(`steward  ${steward}\npool     ${POOL_ID}\ncreator  ${info.creator} (current recipient at the hook)\n`)

  const Tap = (await ethers.getContractFactory('ZealTapV2')).connect(wallet)
  const tap = await Tap.deploy(ESCROW, FOUNDRY, HOOK, FACTORY, TOKEN, POOL_ID, steward)
  await tap.waitForDeployment()
  const addr = await tap.getAddress()
  console.log(`ZealTapV2  ${addr}`)

  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  mkdirSync(join(__dirname, '..', 'deployments'), { recursive: true })
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  rec.contracts = { ...(rec.contracts || {}), ZealTapV2: addr }
  rec.tap2 = { escrow: ESCROW, foundry: FOUNDRY, hook: HOOK, factory: FACTORY, token: TOKEN, poolId: POOL_ID, steward, deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`\nNext: Pons Safe calls setCreatorFeeRecipient(${TOKEN}, ${addr}); 3 days later anyone calls executeCreatorFeeRecipientChange, then tap.sweep(0,0).\n`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
