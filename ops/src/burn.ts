/**
 * Run the burn loop by hand, nothing locked: collect the zZEC/ETH position's
 * fees to the LP wallet, forward them to the Furnace, ignite.
 *
 *   LP_TOKEN_IDS=1829215,1835853 npm run burn               # plan
 *   LP_TOKEN_IDS=1829215,1835853 npm run burn -- --execute  # signs with the deployer keystore (LP owner + igniter)
 *
 * FURNACE_ADDRESS comes from ops/.env after `npm run furnace` in contracts/.
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, CONTRACTS } from './config.js'

const V4 = { positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7', stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b' } as const
const ZEAL = '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC'
const ZEAL_POOL_ID = '0x95f9fcf8eb2d707d6c9c8175822c6005fcce759933e54f8d5ca6df458c8ccaf0'
const ZZEC_POOL_ID = '0xe90144f308b35e54356aaf0050c8734e85bea118eaf6c347a5c7701b7f545f8a'
const ACT = { DECREASE_LIQUIDITY: 0x01, TAKE_PAIR: 0x11 } as const
const ETH = ethers.ZeroAddress
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const abi = ethers.AbiCoder.defaultAbiCoder()

const posm = new ethers.Contract(V4.positionManager, ['function modifyLiquidities(bytes,uint256) payable', 'function ownerOf(uint256) view returns (address)'], provider)
const stateView = new ethers.Contract(V4.stateView, ['function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24,uint24,uint24)'], provider)
const erc20 = (a: string) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256) returns (bool)'], provider)
const furnaceAbi = ['function ignite(uint256 minZealOut) returns (uint256)', 'function igniter() view returns (address)', 'function totalZealBurned() view returns (uint256)', 'function burnCount() view returns (uint256)', 'function maxImpactBps() view returns (uint256)']

function askHidden(q: string): Promise<string> {
  return new Promise((res) => {
    if (!process.stdin.isTTY) throw new Error('no TTY for a passphrase prompt; set LP_PASS')
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(q)
    const out = process.stdout as unknown as { write: (s: string) => boolean }
    const orig = out.write.bind(process.stdout)
    out.write = (s: string) => (s.includes('\n') ? orig(s) : true)
    rl.question('', (a) => { out.write = orig; process.stdout.write('\n'); rl.close(); res(a) })
  })
}

async function main() {
  const execute = process.argv.includes('--execute')
  const furnaceAddr = process.env.FURNACE_ADDRESS ?? ''
  if (!ethers.isAddress(furnaceAddr)) throw new Error('FURNACE_ADDRESS not set (deploy with `npm run furnace` in contracts/)')
  const tokenIds = (process.env.LP_TOKEN_IDS ?? process.env.LP_TOKEN_ID ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(BigInt)
  if (tokenIds.length === 0) throw new Error('LP_TOKEN_IDS required (comma-separated)')
  const zzec = CONTRACTS.zzec
  const furnace = new ethers.Contract(furnaceAddr, furnaceAbi, provider)
  const owners: string[] = await Promise.all(tokenIds.map((id) => posm.ownerOf(id)))
  const lpOwner = owners[0]
  if (owners.some((o) => o.toLowerCase() !== lpOwner.toLowerCase())) throw new Error('all positions must share one owner')

  // Fees collectable = what a zero-liquidity decrease would pay out. Simulate it from the owner.
  const actions = ethers.solidityPacked(Array(tokenIds.length + 1).fill('uint8'), [...tokenIds.map(() => ACT.DECREASE_LIQUIDITY), ACT.TAKE_PAIR])
  const params = [...tokenIds.map((id) => abi.encode(['uint256', 'uint256', 'uint128', 'uint128', 'bytes'], [id, 0n, 0n, 0n, '0x'])), abi.encode(['address', 'address', 'address'], [ETH, zzec, lpOwner])]
  const unlockData = abi.encode(['bytes', 'bytes[]'], [actions, params])
  const [ethHeldF, zzecHeldF, burned, count, impact] = await Promise.all([provider.getBalance(furnaceAddr), erc20(zzec).balanceOf(furnaceAddr), furnace.totalZealBurned(), furnace.burnCount(), furnace.maxImpactBps()])
  const ethNow = await provider.getBalance(lpOwner), zzecNow: bigint = await erc20(zzec).balanceOf(lpOwner)

  // Price the burn: ETH -> ZEAL at the pool's current price, less the 1% Pons hook fee and the impact bound.
  const s = await stateView.getSlot0(ZEAL_POOL_ID)
  const zealPerEth = Number(s.sqrtPriceX96) ** 2 / 2 ** 192 // both 18dp
  const z = await stateView.getSlot0(ZZEC_POOL_ID)
  const ethPerZzec = 1 / (Number(z.sqrtPriceX96) ** 2 / 2 ** 192) / 1e10 // raw1/raw0 with 8dp vs 18dp

  console.log(`\nFurnace ${furnaceAddr}  burned so far ${ethers.formatEther(burned)} ZEAL in ${count} burns  impact bound ${impact} bps (sqrt)`)
  console.log(`LP #${tokenIds.join(', #')} owner ${lpOwner}  |  Furnace holds ${ethers.formatEther(ethHeldF)} ETH + ${Number(zzecHeldF) / 1e8} zZEC`)
  console.log(`prices  1 ETH = ${zealPerEth.toFixed(0)} ZEAL   1 zZEC = ${ethPerZzec.toFixed(5)} ETH`)

  if (!execute) {
    console.log(`\nPlan: collect fees from #${tokenIds.join(', #')} -> ${lpOwner}, forward ETH + zZEC to the Furnace, ignite.\nAdd --execute to sign (deployer keystore).\n`)
    return
  }
  const ksPath = process.env.LP_KEYSTORE ?? new URL('../../contracts/.keystore.json', import.meta.url).pathname
  const pass = process.env.LP_PASS ?? (await askHidden('keystore passphrase: '))
  const wallet = (await ethers.Wallet.fromEncryptedJson(readFileSync(ksPath, 'utf8'), pass)).connect(provider)
  delete process.env.LP_PASS
  if (wallet.address.toLowerCase() !== lpOwner.toLowerCase()) throw new Error(`keystore ${wallet.address} does not own these positions`)
  if ((await furnace.igniter()).toLowerCase() !== wallet.address.toLowerCase()) throw new Error('keystore is not the Furnace igniter')

  // 1. collect
  const tx1 = await (posm.connect(wallet) as ethers.Contract).modifyLiquidities(unlockData, Math.floor(Date.now() / 1000) + 600)
  console.log(`collect   ${tx1.hash}`); await tx1.wait()
  const ethGot = (await provider.getBalance(wallet.address)) - ethNow // net of gas, so slightly under
  const zzecGot: bigint = (await erc20(zzec).balanceOf(wallet.address)) - zzecNow
  console.log(`collected ~${ethers.formatEther(ethGot > 0n ? ethGot : 0n)} ETH + ${Number(zzecGot) / 1e8} zZEC`)

  // 2. forward everything collectable (keep gas)
  const gasReserve = ethers.parseEther('0.003')
  const bal = await provider.getBalance(wallet.address)
  const ethSend = ethGot > 0n && bal > ethGot + gasReserve ? ethGot : 0n
  if (ethSend > 0n) { const t = await wallet.sendTransaction({ to: furnaceAddr, value: ethSend }); console.log(`forward   ${t.hash} (${ethers.formatEther(ethSend)} ETH)`); await t.wait() }
  if (zzecGot > 0n) { const t = await (erc20(zzec).connect(wallet) as ethers.Contract).transfer(furnaceAddr, zzecGot); console.log(`forward   ${t.hash} (${Number(zzecGot) / 1e8} zZEC)`); await t.wait() }

  // 3. ignite with a floor: 85% of the naive expectation (fee, impact bound, rounding).
  const ethIn = (await provider.getBalance(furnaceAddr)) + BigInt(Math.floor(Number(await erc20(zzec).balanceOf(furnaceAddr)) * ethPerZzec * 1e10))
  const expect = Number(ethIn) / 1e18 * zealPerEth
  const minOut = ethers.parseEther((expect * 0.85).toFixed(18))
  if (ethIn === 0n) { console.log('nothing to ignite'); return }
  console.log(`ignite    expect ~${expect.toFixed(0)} ZEAL, floor ${ethers.formatEther(minOut)}`)
  const tx3 = await (furnace.connect(wallet) as ethers.Contract).ignite(minOut)
  console.log(`ignite    ${tx3.hash}`); await tx3.wait()
  console.log(`\nDONE  burned total ${ethers.formatEther(await furnace.totalZealBurned())} ZEAL in ${await furnace.burnCount()} burns\n`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
