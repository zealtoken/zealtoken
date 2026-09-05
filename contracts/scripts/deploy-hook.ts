import { ethers, network } from 'hardhat'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unlock } from './lib/secure'

/**
 * Deploys ZealBurnHook via the canonical CREATE2 deployer with a salt mined so
 * the address carries exactly the v4 flags for afterSwap + returns-delta (0x44).
 *
 *   HOOK_SHARE_BPS=70 npm run hook            (defaults: share 0.70%, Furnace from deployments)
 */
const CREATE2 = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
const FLAG_MASK = 0x3fffn, WANT = 0x0044n

export function mineSalt(initCodeHash: string): { salt: string; address: string } {
  for (let i = 0n; i < 5_000_000n; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32)
    const addr = ethers.getCreate2Address(CREATE2, salt, initCodeHash)
    if ((BigInt(addr) & FLAG_MASK) === WANT) return { salt, address: addr }
  }
  throw new Error('no salt found')
}

async function main() {
  const net = await ethers.provider.getNetwork()
  if (net.chainId !== 4663n) throw new Error(`wrong chain ${net.chainId}`)
  const file = join(__dirname, '..', 'deployments', `${network.name}.json`)
  const rec = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { network: network.name, chainId: 4663, contracts: {} }
  const furnace = process.env.FURNACE_ADDRESS ?? rec.contracts?.ZealFurnaceV4
  if (!ethers.isAddress(furnace)) throw new Error('Furnace address unknown')
  const share = Number(process.env.HOOK_SHARE_BPS ?? 70) // 0.70% of every swap's output
  const wallet = await unlock(ethers.provider)
  const Hook = await ethers.getContractFactory('ZealBurnHook')
  const initCode = ethers.concat([Hook.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['address', 'address', 'uint256'], [POOL_MANAGER, furnace, share])])
  const { salt, address } = mineSalt(ethers.keccak256(initCode))
  console.log(`\nDeployer ${wallet.address}\nFurnace  ${furnace}\nshare    ${share} bps\nsalt     ${salt}\naddress  ${address}  (flags 0x${(BigInt(address) & FLAG_MASK).toString(16)})\n`)
  if ((await ethers.provider.getCode(address)) !== '0x') { console.log('already deployed at that address'); return }
  const tx = await wallet.sendTransaction({ to: CREATE2, data: ethers.concat([salt, initCode]) })
  console.log(`deploy tx ${tx.hash}`); await tx.wait()
  if ((await ethers.provider.getCode(address)) === '0x') throw new Error('CREATE2 deploy produced no code')
  rec.contracts = { ...(rec.contracts ?? {}), ZealBurnHook: address }
  rec.hook = { poolManager: POOL_MANAGER, furnace, shareBps: share, salt, deployedAt: new Date().toISOString() }
  writeFileSync(file, JSON.stringify(rec, null, 2) + '\n')
  console.log(`ZealBurnHook ${address}\n\nNext: open the hooked zZEC/ETH pool (ops: POOL_FEE=3000 POOL_TICK_SPACING=60 POOL_HOOK=${address} npm run pool), then Furnace.proposePools to it.\n`)
}
if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1 })
