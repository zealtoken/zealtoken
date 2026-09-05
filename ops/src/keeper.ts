/**
 * Peg keeper. A dedicated hot wallet holds zZEC and ETH inventory and trades
 * the zZEC/ETH pool back toward the ZEC price whenever it drifts past a band.
 *
 *   npm run keeper               # report + plan, nothing signed
 *   npm run keeper -- --simulate # build the exact swap and dry-run it on chain
 *   npm run keeper -- --execute  # sign with ops/.keys/keeper.json (KEEPER_PASS or prompt)
 *
 * Above peg: sell zZEC for ETH. Below peg: buy zZEC with ETH. Trades are capped
 * per run (MAX_TRADE_ETH), never sell below fair, never buy above it, and every
 * trade is journaled to launchd/keeper.json. Trades go through the Uniswap
 * Universal Router with a min-out derived from the fair price.
 */
import { ethers } from 'ethers'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CHAIN, CONTRACTS } from './config.js'
import { roleSigner } from './chain.js'

const UR = '0x8876789976decbfcbbbe364623c63652db8c0904'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const POOL_ID = '0xe90144f308b35e54356aaf0050c8734e85bea118eaf6c347a5c7701b7f545f8a'
const FEE = 10_000, SPACING = 200, ETH = ethers.ZeroAddress
const BAND = Number(process.env.PEG_BAND ?? 0.02) // act outside ±2%
const TARGET = Number(process.env.PEG_TARGET ?? 0.005) // trade back to within ±0.5%
const MAX_TRADE_ETH = ethers.parseEther(process.env.MAX_TRADE_ETH ?? '0.1')
const JOURNAL = new URL('../launchd/keeper.json', import.meta.url).pathname
const CMD_V4_SWAP = 0x10
const ACT = { SWAP_EXACT_IN_SINGLE: 0x06, SETTLE_ALL: 0x0c, TAKE_ALL: 0x0f } as const

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const abi = ethers.AbiCoder.defaultAbiCoder()
const KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
const sv = new ethers.Contract(STATE_VIEW, ['function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24,uint24,uint24)', 'function getLiquidity(bytes32) view returns (uint128)'], provider)
const ur = new ethers.Contract(UR, ['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable'], provider)
const permit2 = new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)', 'function allowance(address,address,address) view returns (uint160,uint48,uint48)'], provider)
const erc20 = (a: string) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'], provider)
const spot = async (p: string) => Number((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()).data.amount)

type Plan = { side: 'sell' | 'buy'; amountIn: bigint; minOut: bigint; expectOut: bigint }

function plan(x: number, y: number, fair: number, zzecInv: bigint, ethInv: bigint): Plan | null {
  const pool = x / y, k = x * y
  const gap = pool / fair - 1
  if (Math.abs(gap) <= BAND) return null
  if (gap > 0) {
    // sell zZEC until the pool is TARGET above fair
    const pT = fair * (1 + TARGET), yT = Math.sqrt(k / pT)
    let sell = BigInt(Math.floor(((yT - y) / 0.99) * 1e8))
    if (sell > zzecInv) sell = zzecInv
    if (sell <= 0n) return null
    const sellF = Number(sell) / 1e8, ethOut = x - k / (y + sellF * 0.99)
    let amountIn = sell
    if (BigInt(Math.floor(ethOut * 1e18)) > MAX_TRADE_ETH) amountIn = BigInt(Math.floor(sellF * (Number(MAX_TRADE_ETH) / 1e18 / ethOut) * 1e8))
    const outF = x - k / (y + (Number(amountIn) / 1e8) * 0.99)
    // never sell below fair: floor = fair value of what we sell, minus 1%
    const minOut = BigInt(Math.floor((Number(amountIn) / 1e8) * fair * 0.99 * 1e18))
    return { side: 'sell', amountIn, minOut, expectOut: BigInt(Math.floor(outF * 1e18)) }
  }
  const pT = fair * (1 - TARGET), yT = Math.sqrt(k / pT), xT = k / yT
  let buyEth = BigInt(Math.floor(((xT - x) / 0.99) * 1e18))
  if (buyEth > MAX_TRADE_ETH) buyEth = MAX_TRADE_ETH
  if (buyEth > ethInv) buyEth = ethInv
  if (buyEth <= 0n) return null
  const inF = Number(buyEth) / 1e18, outF = y - k / (x + inF * 0.99)
  const minOut = BigInt(Math.floor((inF / fair) * 0.99 * 1e8)) // never pay above fair
  return { side: 'buy', amountIn: buyEth, minOut, expectOut: BigInt(Math.floor(outF * 1e8)) }
}

function encode(p: Plan): { data: string; value: bigint } {
  const key = { currency0: ETH, currency1: CONTRACTS.zzec, fee: FEE, tickSpacing: SPACING, hooks: ETH }
  const zeroForOne = p.side === 'buy'
  const actions = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [ACT.SWAP_EXACT_IN_SINGLE, ACT.SETTLE_ALL, ACT.TAKE_ALL])
  const params = [
    abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`], [{ poolKey: key, zeroForOne, amountIn: p.amountIn, amountOutMinimum: p.minOut, hookData: '0x' }]),
    abi.encode(['address', 'uint256'], [zeroForOne ? ETH : CONTRACTS.zzec, p.amountIn]),
    abi.encode(['address', 'uint256'], [zeroForOne ? CONTRACTS.zzec : ETH, p.minOut]),
  ]
  const input = abi.encode(['bytes', 'bytes[]'], [actions, params])
  const data = ur.interface.encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [CMD_V4_SWAP]), [input], Math.floor(Date.now() / 1000) + 300])
  return { data, value: zeroForOne ? p.amountIn : 0n }
}

async function main() {
  const execute = process.argv.includes('--execute'), simulate = process.argv.includes('--simulate')
  const keeperAddr = process.env.KEEPER_ADDRESS ?? ''
  const [s, L, zecUsd, ethUsd] = await Promise.all([sv.getSlot0(POOL_ID), sv.getLiquidity(POOL_ID), spot('ZEC-USD'), spot('ETH-USD')])
  const sp = Number(s.sqrtPriceX96) / 2 ** 96
  const x = Number(L) / sp / 1e18, y = (Number(L) * sp) / 1e8, fair = zecUsd / ethUsd, pool = x / y
  const stamp = new Date().toISOString()
  console.log(`${stamp} pool ${pool.toFixed(5)} ETH/zZEC · fair ${fair.toFixed(5)} · gap ${((pool / fair - 1) * 100).toFixed(2)}% · depth ${x.toFixed(4)} ETH + ${y.toFixed(4)} zZEC`)

  let signer: ethers.Wallet | null = null
  let from = keeperAddr
  if (execute) { signer = await roleSigner('keeper' as never); from = signer.address }
  if (!ethers.isAddress(from)) { console.log('set KEEPER_ADDRESS (or --execute) to size against inventory'); return }
  const [zzecInv, ethInv]: [bigint, bigint] = await Promise.all([erc20(CONTRACTS.zzec).balanceOf(from), provider.getBalance(from)])
  const usable = ethInv > ethers.parseEther('0.01') ? ethInv - ethers.parseEther('0.01') : 0n
  console.log(`inventory ${from}: ${Number(zzecInv) / 1e8} zZEC + ${ethers.formatEther(ethInv)} ETH`)
  const p = plan(x, y, fair, zzecInv, usable)
  if (!p) { console.log('within band or no inventory for this side: nothing to do'); return }
  const fmtIn = p.side === 'sell' ? `${Number(p.amountIn) / 1e8} zZEC` : `${ethers.formatEther(p.amountIn)} ETH`
  const fmtOut = p.side === 'sell' ? `${ethers.formatEther(p.expectOut)} ETH (min ${ethers.formatEther(p.minOut)})` : `${Number(p.expectOut) / 1e8} zZEC (min ${Number(p.minOut) / 1e8})`
  console.log(`plan: ${p.side.toUpperCase()} ${fmtIn} -> ~${fmtOut}`)
  if (!simulate && !execute) return

  const { data, value } = encode(p)
  if (p.side === 'sell') {
    const [a1, a2] = await Promise.all([erc20(CONTRACTS.zzec).allowance(from, PERMIT2), permit2.allowance(from, CONTRACTS.zzec, UR)])
    const need = a1 < p.amountIn || a2[0] < p.amountIn
    if (need && !execute) { console.log('permit2 approvals missing; simulate assumes them via state override') }
    if (need && signer) {
      if (a1 < p.amountIn) { const t = await (erc20(CONTRACTS.zzec).connect(signer) as ethers.Contract).approve(PERMIT2, ethers.MaxUint256); await t.wait() }
      if (a2[0] < p.amountIn) { const t = await (permit2.connect(signer) as ethers.Contract).approve(CONTRACTS.zzec, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 365 * 86400); await t.wait() }
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
      return
    }
  }
  if (simulate && !execute) {
    try { const g = await provider.estimateGas({ from, to: UR, data, value }); console.log(`SIMULATION OK: gas ~${g}`) } catch (e) { console.log('SIMULATION REVERTED:', (e as { shortMessage?: string }).shortMessage ?? (e as Error).message.slice(0, 200)); process.exitCode = 1 }
    return
  }
  if (!signer) return
  const journal: unknown[] = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, 'utf8')) : []
  const tx = await signer.sendTransaction({ to: UR, data, value })
  console.log(`${p.side} tx ${tx.hash}`)
  const rc = await tx.wait()
  journal.push({ at: stamp, side: p.side, amountIn: p.amountIn.toString(), minOut: p.minOut.toString(), tx: tx.hash, status: rc?.status })
  writeFileSync(JOURNAL, JSON.stringify(journal, null, 2))
  const s2 = await sv.getSlot0(POOL_ID); const sp2 = Number(s2.sqrtPriceX96) / 2 ** 96
  console.log(`done · pool now ${((Number(L) / sp2 / 1e18) / ((Number(L) * sp2) / 1e8)).toFixed(5)} ETH/zZEC`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
