---
title: Redeeming zZEC for ZEC
group: Using it
---
# Redeeming zZEC for native ZEC

On the homepage, choose **Redeem zZEC → ZEC** in the shared Zcash desk. The Wrap tab is the opposite direction. Switching tabs preserves the form and does not submit or cancel a redemption; return to Redeem to review your requests.

> **In one breath.** Put your zZEC into the Redemption Desk with a transparent Zcash address. An automatic payer sends you real ZEC, usually within minutes, records the Zcash transaction on chain, and only then is your zZEC burned. If a request remains unpaid for seven days, you can reclaim your zZEC yourself. Open since **September 6, 2026**.

## Status

Live since 2026-09-06 16:20 UTC. The first redemption went through end to end the same hour: request #0, 0.002 zZEC, paid automatically ([Zcash tx](https://mainnet.zcashexplorer.app/transactions/c9ebc77343ddf7e1a581c75992ca158d27834d838ffe8894d5f55177f57d8631)), then fulfilled and burned on chain ([tx](https://robinhoodchain.blockscout.com/tx/0xcac7757e70c71830cb5f27b1dd400de4ae234b0b32d1d936f0fec37445db88d6)). Fulfil and reclaim are never pausable; the owner can only pause new requests.

## Why escrow first

{{viz:redeemstates}}

The zZEC contract's own `requestRedeem` burns first and trusts the operator to pay. That is the failure mode every wrapper is remembered for. The desk inverts the order: your tokens sit in escrow, visible, until a payout is recorded. The operator cannot move escrowed zZEC anywhere except into the burn, and only by recording a Zcash transaction id against your request. If the operator disappears, `reclaim()` is yours after the window and nobody can block it.

## Step by step, as a holder

1. In the Redeem section, connect a wallet on Robinhood Chain.
2. Enter the amount (0.001–0.05 zZEC for automatic payouts) and your **transparent** Zcash address (starts with `t1` or `t3`, 35 characters). Shielded addresses are refused because a payment to one cannot be shown to have happened.
3. Approve the desk to move your zZEC, then confirm the request. Your zZEC moves into the desk.
4. Watch your request in the list. When it shows **paid**, the Zcash transaction is linked. Shield the ZEC on the Zcash side if you want privacy.
5. If the request remains **open** and unpaid after seven days, a **reclaim** button appears and your zZEC returns to your wallet.

## Behind the scenes: the automatic payer

Payouts are automatic. Every five minutes the payer reads the desk, pays each open request from a hot float wallet within its limits, and fulfils on chain. Requests above the automatic limits are flagged to the operator with a pay-by time.

1. A hot float wallet, separate from the reserve key and funded from the operator's own ZEC, holds a small balance.
2. Every five minutes the payer pays each open request within its limits (0.05 ZEC per request, 0.25 ZEC per day by default), writing the ledger before it sends so a crash can never pay twice.
3. With the Zcash transaction id in hand it calls `fulfill(id, txid)`. The desk marks the request fulfilled, burns the escrow through ZZEC's `requestRedeem` (so it is recorded on the wrapper too), and stores the txid on chain.
4. Requests above the limits are flagged to the operator and paid by hand the same way.

AWS checks every minute to reimburse completed redemptions from the reserve. Outstanding reimbursement debt remains excluded from mint capacity until the transfer has three verified confirmations. Fees use excess backing; the process stops if its required margin is unavailable.

## Fees and rounding

There is no redemption fee. The Zcash network fee for the payout is borne by the reserve. You receive exactly the amount you escrowed.

## The direct path

`requestRedeem` still exists on the ZZEC contract because a wrapper you cannot leave is not a wrapper. If you call it directly, the operator's watchdog flags it and pays it, but there is no escrow and no reclaim. The desk is the right door.

## Check it yourself

`requestCount()`, `summary(id)`, `zcashAddressOf(id)`, `reclaimableAt(id)`, `minAmount()`, `requestsPaused()` on `0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a`. `Requested`, `Fulfilled`, and `Reclaimed` are events. A fulfilled request's `zcashTxid` can be pasted into any Zcash explorer.
