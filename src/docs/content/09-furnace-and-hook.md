---
title: The Furnace and the burn hook
group: The machine
---
# The Furnace and the burn hook

> **In one breath.** The burn hook sits on the zZEC pool and hands 0.7% of every swap to the Furnace. The Furnace has exactly one door out: it can sell what it holds for ETH, buy $ZEAL, and send that $ZEAL to the dead address. No withdraw, no rescue, no owner path to any balance. A daily job triggers it; anyone can trigger the final burn step at any time.

## The hook

ZealBurnHook (`0x16642362837e2FDC02fF1ECF71f5629c094B0044`) is a Uniswap v4 hook with only `afterSwap` enabled. After each swap it computes 0.7% (70 bps) of the swap's unspecified side and `take`s it from the PoolManager straight to the Furnace. It never holds funds, has no owner, and no setters: share and destination are immutable. Swaps where the Furnace itself is the sender are exempt, so the burn does not tax itself. Lifetime takes are public as `totalTaken0` (ETH) and `totalTaken1` (zZEC).

Because the hook is part of the pool's identity, **whoever** provides liquidity, every trade burns. Liquidity from strangers is as good for $ZEAL as our own.

## The Furnace

ZealFurnaceV4 (`0x72C2f71dC3c0058974fd59039F9A79397bf87E70`) holds ETH and zZEC delivered by the hook.

- `ignite(minZealOut)`: igniter only. Two swap legs inside one PoolManager unlock: sell all zZEC held for ETH on the zZEC pool, then spend all ETH held on $ZEAL on the Pons pool. Each leg stops when the pool's square-root price has moved 2.5% (about 5% in price), so a thin pool cannot be drained into a terrible fill; the remainder waits for the next ignite. Reverts if total $ZEAL out is under the caller's floor. Then burns.
- `burn()`: anyone. Sends every $ZEAL the Furnace holds to `0x000…dEaD` and increments the public counters.
- `collectFees()`: anyone. If the Furnace holds LP positions, pull their fees in. Liquidity itself can never be decreased. Today it holds none; the operator keeps the LP fees, the hook feeds the burn.
- Owner controls: instant `setIgnitePaused`, `setZealHookData` (data forwarded to Pons's hook, never caller-chosen), and 48-hour timelocked rotation of the igniter and of the two pool keys, with 7-day expiry. `renounceOwnership` is disabled so a lost igniter can always be rotated.

## The daily job

Every day at 14:00 local the burn job dry-runs `ignite` and, if it would produce $ZEAL, sends it with a floor at 85% of the naive expectation (or 97% of the dry-run figure for dust amounts). Until the pool rotation commits on Sep 7, the Furnace's zZEC pool is the drained original, so zZEC it holds converts to nothing and the job skips with a clear line. Nothing is lost; it waits.

## Why route through ETH

The zZEC pool is zZEC/ETH and the $ZEAL pool is $ZEAL/ETH. ETH is the common leg. Both pools are quoted in native ETH, which is also why the Furnace can insist that `currency0` is ETH in both keys.

## Numbers so far

Two burns totalling about 9,752 $ZEAL, from the first LP fees and the migration. The counters on the ledger are `totalZealBurned`, `burnCount`, `totalEthConsumed`, and `totalZzecConsumed`, all public.

## Check it yourself

The dead address's $ZEAL balance on the explorer equals `totalZealBurned()` plus anything others have sent there. Every `Ignited` and `Burned` event carries amounts and the caller.
