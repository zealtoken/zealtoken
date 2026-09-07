/**
 * Peg keeper. A dedicated hot wallet holds zZEC and ETH inventory and trades
 * the zZEC/ETH pool back toward the ZEC price whenever it drifts past a band.
 *
 *   npm run keeper               # report + plan, nothing signed
 *   npm run keeper -- --simulate # build the exact swap and dry-run it on chain
 *   npm run keeper -- --execute  # sign with ops/.keys/keeper.json (KEEPER_PASS or prompt)
 *
 * Above peg: sell zZEC for ETH. Below peg: buy zZEC with ETH. Trades are capped
 * per run at the quoted state (MAX_TRADE_ETH), with a fair-value output floor. Every
 * trade is journaled to launchd/keeper.json. Trades go through the Uniswap
 * Universal Router with a min-out derived from the fair price.
 */
import { ethers } from 'ethers'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CHAIN, CONTRACTS } from './config.js'
import { roleSigner } from './chain.js'
import { planTrade, type Plan } from './keeper-math.js'
import { marketPrices } from './market-price.js'
import { assertLocalSigningActive } from './local-signing.js'
import { runSerialLoop } from './serial-loop.js'
import { atomicJson, Busy, withLock } from './ops-lock.js'
import { managedSend } from './managed-send.js'

const UR = '0x8876789976decbfcbbbe364623c63652db8c0904'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const ETH = ethers.ZeroAddress
// The market the keeper defends. Defaults to the first zZEC/ETH pool; point POOL_* at the hooked market after migration.
const FEE = Number(process.env.POOL_FEE ?? 10_000), SPACING = Number(process.env.POOL_TICK_SPACING ?? 200), HOOKS = process.env.POOL_HOOK ?? ETH
const BAND = Number(process.env.PEG_BAND ?? 0.02) // act outside ±2%
const TARGET = Number(process.env.PEG_TARGET ?? 0.005) // trade back to within ±0.5%
const MAX_TRADE_ETH = ethers.parseEther(process.env.MAX_TRADE_ETH ?? '0.1')
const JOURNAL = new URL('../launchd/keeper.json', import.meta.url).pathname
const CMD_V4_SWAP = 0x10
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f } as const

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true, cacheTimeout: -1 })
const abi = ethers.AbiCoder.defaultAbiCoder()
const KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
const POOL_ID = ethers.keccak256(abi.encode(['tuple(address,address,uint24,int24,address)'], [[ETH, CONTRACTS.zzec, FEE, SPACING, HOOKS]]))
const sv = new ethers.Contract(STATE_VIEW, ['function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24,uint24,uint24)', 'function getLiquidity(bytes32) view returns (uint128)', 'function getTickBitmap(bytes32,int16) view returns (uint256)'], provider)
const ur = new ethers.Contract(UR, ['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable'], provider)
const permit2 = new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)', 'function allowance(address,address,address) view returns (uint160,uint48,uint48)'], provider)
const erc20 = (a: string) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'], provider)
const PRICE_FAILS = new URL('../launchd/keeper-pricefail', import.meta.url).pathname
function encode(p: Plan): { data: string; value: bigint } {
  const key = { currency0: ETH, currency1: CONTRACTS.zzec, fee: FEE, tickSpacing: SPACING, hooks: HOOKS }
  const zeroForOne = p.side === 'buy'
  const actions = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [ACT.SWAP_EXACT_IN_SINGLE, ACT.SETTLE_ALL, ACT.TAKE_ALL])
  const params = [
    // Robinhood Chain's Universal Router carries an extra uint256 minHopPriceX36 in ExactInputSingleParams (modified v4-periphery).
    abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`], [{ poolKey: key, zeroForOne, amountIn: p.amountIn, amountOutMinimum: p.minOut, minHopPriceX36: 0n, hookData: '0x' }]),
    abi.encode(['address', 'uint256'], [zeroForOne ? ETH : CONTRACTS.zzec, p.amountIn]),
    abi.encode(['address', 'uint256'], [zeroForOne ? CONTRACTS.zzec : ETH, p.minOut]),
  ]
  const input = abi.encode(['bytes', 'bytes[]'], [actions, params])
  const data = ur.interface.encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [CMD_V4_SWAP]), [input], Math.floor(Date.now() / 1000) + 45])
  return { data, value: zeroForOne ? p.amountIn : 0n }
}

let sessionSigner: ethers.Wallet | null = null
function signingActive() {
  assertLocalSigningActive('keeper')
  if (process.env.ZEAL_CLOUD_KEEPER === '1' && !existsSync('/etc/zeal/ACTIVE')) throw new Error('Cloud signing is not activated')
}
async function main(): Promise<boolean> {
  const execute = process.argv.includes('--execute'), simulate = process.argv.includes('--simulate')
  const keeperAddr = process.env.KEEPER_ADDRESS ?? '0x19cece80126b79F76D8b8297B876310a56349738'
  let zecUsd: number, ethUsd: number
  try { ({ zecUsd, ethUsd } = await marketPrices()); if (existsSync(PRICE_FAILS)) writeFileSync(PRICE_FAILS, '0') }
  catch (e) {
    // A price outage is not a keeper failure. Skip quietly; alert only once every 10 consecutive misses.
    const n = (existsSync(PRICE_FAILS) ? Number(readFileSync(PRICE_FAILS, 'utf8')) || 0 : 0) + 1
    writeFileSync(PRICE_FAILS, String(n))
    console.log(`${new Date().toISOString()} price feeds unavailable (${n} in a row): skipping tick`)
    if (n % 10 === 0) throw e
    return false
  }
  const blockTag = await provider.getBlockNumber()
  const [s, L, hookBps] = await Promise.all([
    sv.getSlot0(POOL_ID, { blockTag }), sv.getLiquidity(POOL_ID, { blockTag }),
    HOOKS === ETH ? Promise.resolve(0n) : new ethers.Contract(HOOKS, ['function shareBps() view returns (uint256)'], provider).shareBps({ blockTag }),
  ])
  // This market has no protocol fee. Refuse an unsupported fee configuration.
  if (Number(s[2]) !== 0) throw new Error('keeper sizing does not support a protocol fee')
  const sp = Number(s.sqrtPriceX96) / 2 ** 96
  const x = Number(L) / sp / 1e18, y = (Number(L) * sp) / 1e8, fair = zecUsd / ethUsd, pool = x / y
  const stamp = new Date().toISOString()
  console.log(`${stamp} pool ${pool.toFixed(5)} ETH/zZEC · fair ${fair.toFixed(5)} · gap ${((pool / fair - 1) * 100).toFixed(2)}% · depth ${x.toFixed(4)} ETH + ${y.toFixed(4)} zZEC`)

  let signer: ethers.Wallet | null = null
  let from = keeperAddr
  if (execute) { signingActive(); signer = sessionSigner ?? await roleSigner('keeper'); from = signer.address }
  if (!ethers.isAddress(from)) { console.log('set KEEPER_ADDRESS (or --execute) to size against inventory'); return true }
  const [zzecInv, ethInv]: [bigint, bigint] = await Promise.all([erc20(CONTRACTS.zzec).balanceOf(from), provider.getBalance(from)])
  const usable = ethInv > ethers.parseEther('0.01') ? ethInv - ethers.parseEther('0.01') : 0n
  console.log(`inventory ${from}: ${Number(zzecInv) / 1e8} zZEC + ${ethers.formatEther(ethInv)} ETH`)
  const p = planTrade({ sqrt: s.sqrtPriceX96, liquidity: L, lpFee: Number(s[3]), hookBps: Number(hookBps) }, fair, zzecInv, usable, { band: BAND, target: TARGET, maxEth: MAX_TRADE_ETH })
  if (!p) { console.log('no eligible trade (band, inventory, or output floor): nothing to do'); return true }
  // Single-range math must not be used across an initialized liquidity boundary.
  const startTick = Number(s[1]), endTick = Math.log((Number(p.sqrtAfter) / 2 ** 96) ** 2) / Math.log(1.0001)
  const lowTick = Math.min(startTick, endTick), highTick = Math.max(startTick, endTick)
  const wordLow = Math.floor(Math.floor(lowTick / SPACING) / 256), wordHigh = Math.floor(Math.floor(highTick / SPACING) / 256)
  if (wordHigh - wordLow > 32) throw new Error('swap crosses too many tick words; needs a full-range quote')
  for (let word = wordLow; word <= wordHigh; word++) {
    const bitmap: bigint = await sv.getTickBitmap(POOL_ID, word, { blockTag })
    for (let bit = 0; bit < 256; bit++) {
      const tick = (word * 256 + bit) * SPACING
      if ((bitmap & (1n << BigInt(bit))) && tick >= lowTick && tick <= highTick) throw new Error('swap crosses initialized liquidity; needs a multi-range quote')
    }
  }
  // Protect against adverse execution relative to the fresh pool quote, too.
  const quoteFloor = p.expectOut * 995n / 1000n
  if (quoteFloor > p.minOut) p.minOut = quoteFloor
  const fmtIn = p.side === 'sell' ? `${Number(p.amountIn) / 1e8} zZEC` : `${ethers.formatEther(p.amountIn)} ETH`
  const fmtOut = p.side === 'sell' ? `${ethers.formatEther(p.expectOut)} ETH (min ${ethers.formatEther(p.minOut)})` : `${Number(p.expectOut) / 1e8} zZEC (min ${Number(p.minOut) / 1e8})`
  console.log(`plan: ${p.side.toUpperCase()} ${fmtIn} -> ~${fmtOut}`)
  if (!simulate && !execute) return true

  const { data, value } = encode(p)
  if (p.side === 'sell') {
    const [a1, a2] = await Promise.all([erc20(CONTRACTS.zzec).allowance(from, PERMIT2), permit2.allowance(from, CONTRACTS.zzec, UR)])
    const expired = Number(a2[1]) <= Math.floor(Date.now() / 1000) + 60
    const need = a1 < p.amountIn || a2[0] < p.amountIn || expired
    if (need && !execute) { console.log('permit2 approvals missing; simulate assumes them via state override') }
    if (need && signer) {
      if (a1 < p.amountIn) { const t = await managedSend(signer, await erc20(CONTRACTS.zzec).approve.populateTransaction(PERMIT2, ethers.MaxUint256)); await t.wait() }
      if (a2[0] < p.amountIn || expired) { const t = await managedSend(signer, await permit2.approve.populateTransaction(CONTRACTS.zzec, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 365 * 86400)); await t.wait() }
    }
    if (need && simulate && !execute) {
      const inner = ethers.keccak256(abi.encode(['address', 'uint256'], [from, 1]))
      const zSlot = ethers.keccak256(abi.encode(['address', 'bytes32'], [PERMIT2, inner]))
      const s1 = ethers.keccak256(abi.encode(['address', 'uint256'], [from, 1]))
      const s2 = ethers.keccak256(abi.encode(['address', 'bytes32'], [CONTRACTS.zzec, s1]))
      const pSlot = ethers.keccak256(abi.encode(['address', 'bytes32'], [UR, s2]))
      const packed = ethers.toBeHex(((1n << 160n) - 1n) | (BigInt(Math.floor(Date.now() / 1000) + 86400) << 160n), 32)
      const ov = { [CONTRACTS.zzec]: { stateDiff: { [zSlot]: ethers.toBeHex(ethers.MaxUint256, 32) } }, [PERMIT2]: { stateDiff: { [pSlot]: packed } } }
      try { const g = await provider.send('eth_estimateGas', [{ from, to: UR, data, value: ethers.toQuantity(value) }, 'latest', ov]); console.log(`SIMULATION OK (approvals overridden): gas ~${Number(g)}`) } catch (e) { console.log('SIMULATION REVERTED:', (e as Error).message.slice(0, 200)); process.exitCode = 1 }
      return true
    }
  }
  if (simulate && !execute) {
    try { const g = await provider.estimateGas({ from, to: UR, data, value }); console.log(`SIMULATION OK: gas ~${g}`) } catch (e) { console.log('SIMULATION REVERTED:', (e as { shortMessage?: string }).shortMessage ?? (e as Error).message.slice(0, 200)); process.exitCode = 1 }
    return true
  }
  if (!signer) return true
  const journal: unknown[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : []
  if (Date.now() - Date.parse(stamp) > 20_000) throw new Error('swap quote expired; replan on the next tick')
  await provider.estimateGas({ from, to: UR, data, value })
  signingActive()
  const tx = await managedSend(signer, { to: UR, data, value })
  console.log(`${p.side} tx ${tx.hash}`)
  const rc = await tx.wait()
  journal.push({ at: stamp, side: p.side, amountIn: p.amountIn.toString(), minOut: p.minOut.toString(), tx: tx.hash, status: rc?.status })
  writeFileSync(JOURNAL, JSON.stringify(journal, null, 2))
  const s2 = await sv.getSlot0(POOL_ID); const sp2 = Number(s2.sqrtPriceX96) / 2 ** 96
  console.log(`done · pool now ${((Number(L) / sp2 / 1e18) / ((Number(L) * sp2) / 1e8)).toFixed(5)} ETH/zZEC`)
  return true
}
async function run() {
  if (!process.argv.includes('--daemon')) return withLock('keeper-tick', main)
  if (!process.argv.includes('--execute') || process.argv.includes('--simulate')) throw new Error('daemon requires --execute without --simulate')
  await withLock('keeper-daemon', async () => {
    signingActive()
    sessionSigner = await roleSigner('keeper')
    const stop = new AbortController()
    const halt = () => stop.abort()
    process.on('SIGTERM', halt); process.on('SIGINT', halt)
    try {
      await runSerialLoop(async () => {
        signingActive()
        const ok = await withLock('keeper-tick', main)
        if (ok) atomicJson(new URL('../launchd/keeper-heartbeat.json', import.meta.url).pathname, { at: new Date().toISOString(), pid: process.pid })
      }, 2000, stop.signal)
    } finally {
      sessionSigner = null
      process.off('SIGTERM', halt); process.off('SIGINT', halt)
    }
  })
}
run().catch((e) => { if (e instanceof Busy && !process.argv.includes('--daemon')) return; console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
