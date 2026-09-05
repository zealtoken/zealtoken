/**
 * Peg check: where zZEC trades versus ZEC, and the exact trade that closes the gap.
 *   npm run peg
 * Read-only. The operator is the arbitrageur until redemption opens: above peg,
 * mint against fresh ZEC and sell into the premium; below peg, buy the discount.
 */
import { ethers } from 'ethers'
import { CHAIN } from './config.js'

const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const POOL = '0xe90144f308b35e54356aaf0050c8734e85bea118eaf6c347a5c7701b7f545f8a'
const FEE = 0.01
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const sv = new ethers.Contract(STATE_VIEW, ['function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24 tick,uint24,uint24)', 'function getLiquidity(bytes32) view returns (uint128)'], provider)
const spot = async (p: string) => Number((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()).data.amount)

async function main() {
  const [s, L, zecUsd, ethUsd] = await Promise.all([sv.getSlot0(POOL), sv.getLiquidity(POOL), spot('ZEC-USD'), spot('ETH-USD')])
  const sp = Number(s.sqrtPriceX96) / 2 ** 96
  const x = Number(L) / sp / 1e18 // ETH side (virtual, full range)
  const y = (Number(L) * sp) / 1e8 // zZEC side
  const pool = x / y // ETH per zZEC
  const fair = zecUsd / ethUsd
  const prem = pool / fair - 1
  console.log(`\npool   1 zZEC = ${pool.toFixed(5)} ETH  ($${(pool * ethUsd).toFixed(2)})`)
  console.log(`ZEC    1 ZEC  = ${fair.toFixed(5)} ETH  ($${zecUsd.toFixed(2)})`)
  console.log(`gap    ${prem >= 0 ? '+' : ''}${(prem * 100).toFixed(2)}%  ${Math.abs(prem) < 0.02 ? '(within 2%: nothing to do)' : prem > 0 ? 'PREMIUM: mint and sell' : 'DISCOUNT: buy'}`)
  console.log(`depth  ${x.toFixed(4)} ETH + ${y.toFixed(4)} zZEC`)
  if (Math.abs(prem) < 0.02) return
  const k = x * y
  if (prem > 0) {
    // sell zZEC until price == fair (after fee the price lands slightly above fair, fine)
    const yT = Math.sqrt(k / fair), xT = k / yT
    const sell = (yT - y) / (1 - FEE), ethOut = x - xT
    console.log(`\nto restore the peg: sell ${sell.toFixed(5)} zZEC into the pool -> receive ~${ethOut.toFixed(5)} ETH ($${(ethOut * ethUsd).toFixed(2)})`)
    console.log(`that zZEC costs ${(sell * zecUsd).toFixed(2)} USD of ZEC to back; gross arb ~$${(ethOut * ethUsd - sell * zecUsd).toFixed(2)}`)
    console.log(`steps: buy ${sell.toFixed(4)} ZEC -> reserve address -> attest -> MINT_ZEC=${sell.toFixed(8)} to a wallet you can trade from -> sell zZEC for ETH on the Uniswap app`)
  } else {
    const yT = Math.sqrt(k / fair), xT = k / yT
    const buyEth = (xT - x) / (1 - FEE), zzecOut = y - yT
    console.log(`\nto restore the peg: buy ${zzecOut.toFixed(5)} zZEC with ~${buyEth.toFixed(5)} ETH ($${(buyEth * ethUsd).toFixed(2)}), worth $${(zzecOut * zecUsd).toFixed(2)} of ZEC`)
  }
  console.log()
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
