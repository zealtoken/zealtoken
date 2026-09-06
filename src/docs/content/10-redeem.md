---
title: Redeeming zZEC for ZEC
group: Using it
---
# Redeeming zZEC for native ZEC

> **In one breath.** Put your zZEC into the Redemption Desk with a transparent Zcash address. An automatic payer sends you real ZEC, usually within minutes, records the Zcash transaction on chain, and only then is your zZEC burned. If a payout ever failed, the contract lets you take your zZEC back yourself. No permission, no pause, ever. Opens **September 6, 2026**.

## Status

The desk is deployed and verified. New requests are paused on chain until **2026-09-06 at 17:00 UTC**, when automatic payouts from a hot float wallet go live alongside it. Fulfil and reclaim are never pausable; the pause only gates new requests.

## Why escrow first

{{viz:redeemstates}}

The zZEC contract's own `requestRedeem` burns first and trusts the operator to pay. That is the failure mode every wrapper is remembered for. The desk inverts the order: your tokens sit in escrow, visible, until a payout is recorded. The operator cannot move escrowed zZEC anywhere except into the burn, and only by recording a Zcash transaction id against your request. If the operator disappears, `reclaim()` is yours after the window and nobody can block it.

## Step by step, as a holder

1. In the Redeem section, connect a wallet on Robinhood Chain.
2. Enter the amount (minimum 0.001 zZEC) and your **transparent** Zcash address (starts with `t1` or `t3`, 35 characters). Shielded addresses are refused because a payment to one cannot be shown to have happened.
3. Approve the desk to move your zZEC, then confirm the request. Your zZEC moves into the desk.
4. Watch your request in the list. When it shows **paid**, the Zcash transaction is linked. Shield the ZEC on the Zcash side if you want privacy.
5. If a payout ever failed and the request stayed **open**, a **reclaim** button appears and your zZEC returns to your wallet.

## Behind the scenes: the automatic payer

Payouts are automatic. Every five minutes the payer reads the desk, pays each open request from a hot float wallet within its limits, and fulfils on chain. Requests above the automatic limits are flagged to the operator with a pay-by time.

1. A hot float wallet, separate from the reserve key and funded from the operator's own ZEC, holds a small balance.
2. Every five minutes the payer pays each open request within its limits (0.05 ZEC per request, 0.25 ZEC per day by default), writing the ledger before it sends so a crash can never pay twice.
3. With the Zcash transaction id in hand it calls `fulfill(id, txid)`. The desk marks the request fulfilled, burns the escrow through ZZEC's `requestRedeem` (so it is recorded on the wrapper too), and stores the txid on chain.
4. Requests above the limits are flagged to the operator and paid by hand the same way.

The reserve then reimburses the float: each payout burns zZEC while the reserve stays put, so the reserve over-covers by the paid amount and the operator moves that excess to the float. The public coverage figure never dips.

## Fees and rounding

There is no redemption fee. The Zcash network fee for the payout is borne by the reserve. You receive exactly the amount you escrowed.

## The direct path

`requestRedeem` still exists on the ZZEC contract because a wrapper you cannot leave is not a wrapper. If you call it directly, the operator's watchdog flags it and pays it, but there is no escrow and no reclaim. The desk is the right door.

## Check it yourself

`requestCount()`, `summary(id)`, `zcashAddressOf(id)`, `reclaimableAt(id)`, `minAmount()`, `requestsPaused()` on `0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a`. `Requested`, `Fulfilled`, and `Reclaimed` are events. A fulfilled request's `zcashTxid` can be pasted into any Zcash explorer.
