---
title: Redeeming zZEC for ZEC
group: Using it
---
# Redeeming zZEC for native ZEC

> **In one breath.** Put your zZEC into the Redemption Desk with a transparent Zcash address. The operator pays you real ZEC from the reserve, then records the Zcash transaction on chain, and only then is your zZEC burned. If nothing has arrived after 7 days, you take your zZEC back yourself. No permission, no pause, ever.

## Why escrow first

{{viz:redeemstates}}

The zZEC contract's own `requestRedeem` burns first and trusts the operator to pay. That is the failure mode every wrapper is remembered for. The desk inverts the order: your tokens sit in escrow, visible, until a payout is recorded. The operator cannot move escrowed zZEC anywhere except into the burn, and only by recording a Zcash transaction id against your request. If the operator disappears, `reclaim()` is yours after the window and nobody can block it.

## Step by step, as a holder

1. In the Redeem section, connect a wallet on Robinhood Chain.
2. Enter the amount (minimum 0.001 zZEC) and your **transparent** Zcash address (starts with `t1` or `t3`, 35 characters). Shielded addresses are refused because a payment to one cannot be shown to have happened.
3. Approve the desk to move your zZEC, then confirm the request. Your zZEC moves into the desk.
4. Watch your request in the list. When it shows **paid**, the Zcash transaction is linked. Shield the ZEC on the Zcash side if you want privacy.
5. If it still shows **open** after 7 days, press **reclaim**. Your zZEC returns to your wallet.

## Step by step, as the operator

The watchdog notifies the operator of every open request with a **pay-by** time (7 days after the request, minus a 12-hour safety margin).

1. Pay the exact amount in native ZEC from the reserve wallet to the requester's t-address.
2. Wait for the Zcash transaction id.
3. Record it: `FULFILL_ID=<id> ZEC_TXID=<txid> npm run desk`. The desk marks the request fulfilled, burns the escrow through ZZEC's `requestRedeem` (so it is recorded on the wrapper too), and stores the txid.

The tool refuses to record inside the last 12 hours of the window. Paying ZEC and then losing the escrow to a reclaim is the one double-spend this design permits, and the guard exists so it never happens by accident.

## Fees and rounding

There is no redemption fee. The Zcash network fee for the payout is borne by the reserve. You receive exactly the amount you escrowed.

## The direct path

`requestRedeem` still exists on the ZZEC contract because a wrapper you cannot leave is not a wrapper. If you call it directly, the operator's watchdog flags it and pays it, but there is no escrow and no reclaim. The desk is the right door.

## Check it yourself

`requestCount()`, `summary(id)`, `zcashAddressOf(id)`, `reclaimableAt(id)`, `minAmount()`, `requestsPaused()` on `0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a`. `Requested`, `Fulfilled`, and `Reclaimed` are events. A fulfilled request's `zcashTxid` can be pasted into any Zcash explorer.
