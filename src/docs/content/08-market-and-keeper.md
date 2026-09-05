---
title: The zZEC market and the peg keeper
group: Using it
---
# The zZEC market and the peg keeper

> **In one breath.** zZEC trades against ETH on a Uniswap v4 pool on Robinhood Chain. Every trade pays 1%: 0.3% to liquidity providers and 0.7% to the Furnace through a hook. A keeper wallet with its own zZEC and ETH inventory checks the pool every minute and trades it back toward the ZEC price whenever it drifts more than 1% away, so small buyers pay roughly what ZEC costs. Anyone can provide liquidity and earn the 0.3%.

## The pool

| Parameter | Value |
|---|---|
| Pool id | `0xa6d41767e205c89fe05d7ad78354af7bb98cbe9b0c3c60f8371b05e7087fdb84` |
| Currencies | native ETH (currency0) / zZEC (currency1) |
| LP fee | 0.3% (3000) |
| Tick spacing | 60 |
| Hook | ZealBurnHook `0x1664…0044`, 0.7% of output to the Furnace |
| PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| PositionManager | `0x58daec3116aae6d93017baaea7749052e8a04fa7` |

The first pool (1% fee, spacing 200, no hook) was drained when liquidity migrated to the hooked pool on Sep 5. The Furnace's own pool reference rotates to the hooked pool when its 48-hour proposal commits on **2026-09-07 at 16:04 UTC**.

## Buying and selling

Open [Uniswap on Robinhood Chain](https://app.uniswap.org/swap?chain=robinhood&inputCurrency=NATIVE&outputCurrency=0x0b151Ff7a7c5250130EC16C275790961d558E402) and swap ETH for zZEC. The site's Market section shows the current price against Coinbase's ZEC price and the pool's depth. Size to the depth: the pool is small and large trades move it.

One quirk of the hook: on **exact-output** swaps (you name how much zZEC you want) the 0.7% comes off the input side, so the quote shows slightly more ETH than the LP fee alone would imply. Exact-input swaps take it from the output. Either way the total cost is 1%.

## Providing liquidity

Hold zZEC and ETH in equal value and [add both to the hooked pool](https://app.uniswap.org/positions/create/v4?currencyA=NATIVE&currencyB=0x0b151Ff7a7c5250130EC16C275790961d558E402&chain=robinhood&feeTier=3000&tickSpacing=60&hook=0x16642362837e2FDC02fF1ECF71f5629c094B0044). You earn 0.3% of every trade pro rata and can withdraw any time. The hook takes nothing from LPs; its cut comes from traders.

Because zZEC can only exist against ZEC in the reserve, adding zZEC liquidity is the same act as adding reserves. The [WrapDesk](#/wrap) is how you turn ZEC into pool-ready zZEC.

## The keeper

A dedicated wallet (`0x19ce…9738`) holds zZEC and ETH and runs every 60 seconds:

1. Read the pool's price from `StateView.getSlot0` and its liquidity.
2. Read fair value: ZEC/USD divided by ETH/USD, from Coinbase with CoinGecko as fallback and retries. If both feeds are down the tick is skipped quietly.
3. If the pool is more than **1%** from fair, plan a trade that brings it back to within **0.2%**, capped at **0.1 ETH** per run and by the keeper's inventory.
4. Never sell zZEC below fair, never buy above it: the minimum output is derived from fair value, so a bad quote reverts instead of filling.
5. Execute through the Uniswap Universal Router, journal the trade, notify.

The keeper is a market maker, not a peg guarantee. It has finite inventory. Its first trade closed a 5.7% premium to 0.6%; on quiet days it does nothing. Its depth math assumes the price stays inside the pool's liquidity range, and its per-run cap bounds any mis-sizing.

## Check it yourself

`getSlot0(poolId)` and `getLiquidity(poolId)` on StateView `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b`. Price in ETH per zZEC is `(sqrtPriceX96 / 2^96)^2 / 1e10` inverted. The keeper's trades are ordinary transactions from its address.
