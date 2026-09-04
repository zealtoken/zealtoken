/**
 * Open the zZEC/ETH market on Uniswap v4 (Robinhood Chain) and seed a
 * full-range position. Same encoding Pons uses for graduated pools, read
 * from their verified factory: MINT_POSITION + SETTLE_PAIR + SWEEP.
 *
 *   POOL_ZEC=2 POOL_ETH=5.3 npm run pool              # plan only
 *   POOL_ZEC=2 POOL_ETH=5.3 npm run pool -- --execute  # signs with LP_KEYSTORE
 *
 * The signer must hold the zZEC (mint to it first) and the ETH. Price defaults
 * to Coinbase spot ZEC-USD / ETH-USD; override with PRICE_ETH_PER_ZEC.
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, CONTRACTS } from './config.js'

const V4 = {
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
} as const
const FEE = Number(process.env.POOL_FEE ?? 10_000) // 1.00%
const TICK_SPACING = Number(process.env.POOL_TICK_SPACING ?? 200)
const MIN_USABLE_TICK = -887272
const MAX_USABLE_TICK = 887272
const ACT = { MINT_POSITION: 0x02, SETTLE_PAIR: 0x0d, SWEEP: 0x14 } as const
const Q96 = 1n << 96n
const ETH = ethers.ZeroAddress

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const abi = ethers.AbiCoder.defaultAbiCoder()

const POOL_KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
const posm = new ethers.Contract(V4.positionManager, [
  `function initializePool(${POOL_KEY_T} key,uint160 sqrtPriceX96) payable returns (int24)`,
  'function modifyLiquidities(bytes unlockData,uint256 deadline) payable',
  'function nextTokenId() view returns (uint256)',
], provider)
const stateView = new ethers.Contract(V4.stateView, [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
], provider)
const permit2 = new ethers.Contract(V4.permit2, [
  'function approve(address token,address spender,uint160 amount,uint48 expiration)',
  'function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)',
], provider)
const erc20 = (a: string) => new ethers.Contract(a, [
  'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)',
], provider)

const bsqrt = (n: bigint): bigint => { if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x }
const sqrtAtTick = (tick: number): bigint => BigInt(Math.floor(Math.sqrt(1.0001 ** tick) * 2 ** 96)) // full-range bounds only; precision there is irrelevant

async function price(): Promise<number> {
  if (process.env.PRICE_ETH_PER_ZEC) return Number(process.env.PRICE_ETH_PER_ZEC)
  const spot = async (p: string) => Number((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()).data.amount)
  const [zec, eth] = await Promise.all([spot('ZEC-USD'), spot('ETH-USD')])
  return zec / eth
}

async function main() {
  const execute = process.argv.includes('--execute')
  const zzec = CONTRACTS.zzec
  if (!ethers.isAddress(zzec)) throw new Error('ZZEC_ADDRESS not set')
  const zecAmt = Number(process.env.POOL_ZEC ?? 0), ethAmt = Number(process.env.POOL_ETH ?? 0)
  if (!(zecAmt > 0 && ethAmt > 0)) throw new Error('POOL_ZEC and POOL_ETH are required')
  const ethPerZec = await price()

  // ETH (address 0) sorts first, so currency0 = ETH (18 dp), currency1 = zZEC (8 dp).
  const key = { currency0: ETH, currency1: zzec, fee: FEE, tickSpacing: TICK_SPACING, hooks: ETH }
  const poolId = ethers.keccak256(abi.encode([POOL_KEY_T], [key]))
  // price = raw1 / raw0 = (1/ethPerZec) * 1e8 / 1e18
  const priceRaw = 1e8 / 1e18 / ethPerZec
  const sqrtPriceX96 = BigInt(Math.floor(Math.sqrt(priceRaw) * 2 ** 96))
  const tickLower = Math.trunc(MIN_USABLE_TICK / TICK_SPACING) * TICK_SPACING
  const tickUpper = Math.trunc(MAX_USABLE_TICK / TICK_SPACING) * TICK_SPACING
  const amount0 = ethers.parseEther(ethAmt.toString())
  const amount1 = BigInt(Math.round(zecAmt * 1e8))

  const [slot0, existingL] = await Promise.all([stateView.getSlot0(poolId), stateView.getLiquidity(poolId)])
  const initialized = slot0.sqrtPriceX96 !== 0n
  const useSqrt = initialized ? (slot0.sqrtPriceX96 as bigint) : sqrtPriceX96

  // LiquidityAmounts.getLiquidityForAmounts, full range (sqrtA < P < sqrtB)
  const sA = sqrtAtTick(tickLower), sB = sqrtAtTick(tickUpper)
  const l0 = (amount0 * useSqrt * sB) / (sB - useSqrt) / Q96
  const l1 = (amount1 * Q96) / (useSqrt - sA)
  const liquidity = ((l0 < l1 ? l0 : l1) * 9995n) / 10_000n // 0.05% headroom under the maxima

  console.log(`\nzZEC/ETH pool on Uniswap v4 · fee ${FEE / 10_000}% · spacing ${TICK_SPACING} · no hook`)
  console.log(`poolId       ${poolId}`)
  console.log(`price        1 ZEC = ${ethPerZec.toFixed(5)} ETH ${initialized ? '(pool already initialized; using on-chain price)' : '(will initialize at this price)'}`)
  console.log(`seed         ${ethAmt} ETH + ${zecAmt} zZEC  -> liquidity ${liquidity}  (existing ${existingL})`)
  console.log(`ticks        ${tickLower} .. ${tickUpper}`)

  if (!execute) { console.log('\nPlan only. Add --execute to sign.\n'); return }

  const ksPath = process.env.LP_KEYSTORE ?? new URL('../../contracts/.keystore.json', import.meta.url).pathname
  const pass = process.env.LP_PASS ?? await new Promise<string>((res) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question('keystore passphrase: ', (a) => { rl.close(); res(a) }) })
  const wallet = (await ethers.Wallet.fromEncryptedJson(readFileSync(ksPath, 'utf8'), pass)).connect(provider)
  const owner = process.env.LP_OWNER ?? wallet.address
  const [ethBal, zBal] = await Promise.all([provider.getBalance(wallet.address), erc20(zzec).balanceOf(wallet.address)])
  console.log(`signer       ${wallet.address}  ${ethers.formatEther(ethBal)} ETH  ${Number(zBal) / 1e8} zZEC  -> position to ${owner}`)
  if (zBal < amount1) throw new Error('signer holds less zZEC than POOL_ZEC; mint to it first')
  if (ethBal < amount0 + ethers.parseEther('0.002')) throw new Error('signer holds less ETH than POOL_ETH plus gas')

  if (!initialized) {
    const tx = await (posm.connect(wallet) as ethers.Contract).initializePool(key, sqrtPriceX96)
    console.log(`initialize   ${tx.hash}`); await tx.wait()
  }
  // Permit2 path for the ERC-20 side
  const z = erc20(zzec).connect(wallet) as ethers.Contract
  if ((await z.allowance(wallet.address, V4.permit2)) < amount1) { const tx = await z.approve(V4.permit2, ethers.MaxUint256); console.log(`approve      ${tx.hash}`); await tx.wait() }
  const al = await permit2.allowance(wallet.address, zzec, V4.positionManager)
  if (al.amount < amount1 || Number(al.expiration) < Math.floor(Date.now() / 1000) + 600) {
    const tx = await (permit2.connect(wallet) as ethers.Contract).approve(zzec, V4.positionManager, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 30 * 86400)
    console.log(`permit2      ${tx.hash}`); await tx.wait()
  }

  const actions = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [ACT.MINT_POSITION, ACT.SETTLE_PAIR, ACT.SWEEP])
  const params = [
    abi.encode([POOL_KEY_T, 'int24', 'int24', 'uint256', 'uint128', 'uint128', 'address', 'bytes'], [key, tickLower, tickUpper, liquidity, amount0, amount1, owner, '0x']),
    abi.encode(['address', 'address'], [ETH, zzec]),
    abi.encode(['address', 'address'], [ETH, wallet.address]),
  ]
  const nextId = await posm.nextTokenId()
  const tx = await (posm.connect(wallet) as ethers.Contract).modifyLiquidities(abi.encode(['bytes', 'bytes[]'], [actions, params]), Math.floor(Date.now() / 1000) + 1200, { value: amount0 })
  console.log(`mint LP      ${tx.hash}`); await tx.wait()
  const [s, L] = await Promise.all([stateView.getSlot0(poolId), stateView.getLiquidity(poolId)])
  console.log(`\nDONE  position #${nextId} -> ${owner}\n      pool liquidity ${L}  sqrtPrice ${s.sqrtPriceX96}  tick ${s.tick}\n      poolId ${poolId}\n`)
}
main().catch((e) => { console.error(e.shortMessage ?? e.message ?? e); process.exit(1) })
