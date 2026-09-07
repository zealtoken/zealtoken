---
title: Wrapping ZEC into zZEC
group: Using it
---
# Wrapping ZEC into zZEC

On the homepage, choose **Wrap ZEC → zZEC** in the shared Zcash desk. The Redeem tab is the opposite direction. Switching tabs keeps the wrap form mounted and does not cancel processing; return to Wrap to see your payment status.

## Availability

The dedicated-address interface and automatic AWS worker are deployed. **Public requests are enabled.** The [wrap desk](https://zealtoken.com/#wrap) checks that switch, the current minter and a fresh worker status before showing deposit instructions. “Deposits on hold” means do not send a new payment; it does not mean an existing payment has disappeared.

## Connect, get an address, send ZEC

1. Connect the Robinhood Chain wallet where you want your zZEC. Keep a little ETH for the request transaction.
2. Select **Get my deposit address** and confirm the request. Each wallet gets one permanent route. The worker assigns its Zcash address; no payment is needed while assignment is pending.
3. Send **native ZEC on Zcash** to that assigned address. The initial automatic range is **0.001–1 ZEC per payment**. There are no special trailing digits: the actual amount received determines the amount of zZEC.
4. Follow your payment in **Your deposits**. The worker waits for three deposit confirmations, consolidates into the central reserve, waits for three consolidation confirmations, checks backing and mints to your linked wallet. Receipts link the deposit, reserve transfer and mint.

Processing usually takes several minutes. Block times, workload, node availability and funding affect timing; there is no guaranteed completion time. The worker checks again 15 seconds after each completed pass. It runs in AWS without the operator’s laptop or terminal.

## If “Open Zcash wallet” does nothing

This button asks the browser to open a compatible wallet using a `zcash:` link with your address and selected amount. It does not send a payment. Browsers cannot reliably tell us whether a compatible wallet is installed.

A **Wallet didn’t open?** popup provides your deposit address, selected amount and a copy button. Open your Zcash wallet manually, choose Send and paste the address. If you already sent the payment, close the popup and follow Your deposits instead of sending again. Deposit details are hidden if your connected wallet changes or desk status becomes unavailable.

## Amounts, fees and repeat payments

The project currently covers the 0.0001 ZEC consolidation network fee from unencumbered backing, so 0.00207 ZEC received produces 0.00207 zZEC. Your sending wallet or bridge may charge its own fee or deliver a different amount. Check the actual destination and delivered amount. If spare backing cannot cover consolidation fees, new deposit instructions are held and the operator is alerted.

Your address stays linked to the same recipient wallet. Later payments can be processed separately; the worker identifies each transaction output to prevent duplicate credit. Do not resend to speed up an existing payment. Payments outside the automatic range or before route creation need individual review and remain outside automated consolidation. Never use the published main reserve address as a substitute for your assigned address.

The initial worker indexes up to 1,000 routes and has a 10,000-payment journal guard. At the route threshold, new deposit instructions are held while existing indexed routes continue processing. Capacity changes require review; the underlying registry can contain more routes than this initial worker indexes.

## How backing and recovery are protected

Pending deposits remain gross liabilities. They cannot become spare backing for keeper mints or redemption-wallet reimbursements. A credit is settled only after the exact recipient, amount, reference and canonical mint receipt have been verified with at least 12 EVM confirmations.

Before each worker run, an off-device checkpoint must match the local payment journal. The checkpoint is marked in progress before execution. An interrupted run, stale restored ledger or uncertain financial submission stops for reconciliation; it is not automatically retried as a new payment. Confirmed normal runs update the checkpoint and public status. Stale or unavailable status hides new deposit instructions in the UI.

Recovery is an operator process, not an automatic refund. Keep your receipt and native Zcash transaction ID. The two earlier misdirected test deposits remain held separately and have not been automatically credited or refunded.

## Temporary minter path and V2

Deposit routes are registered in `0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379`. The existing WrapDesk at `0xb53E3CD58668D1fC9082b51a7d74879733e9E118` still mints through its operator interface. V2 credits remain paused; its `creditedZats` field does not include these interim mints. Use the linked mint receipts for interim credit evidence.

The legacy contract does not enforce native-output replay protection itself. The worker’s durable journal, checkpoint and on-chain reference reconciliation provide that protection. This is operator-custodied wrapping, not a trustless bridge. Both Zcash regional checks currently use the same zec.rocks provider; they are redundancy, not independent consensus verification.

The V2 minter proposal becomes eligible **September 9, 2026 at 20:16:37 UTC**. The fixed 48-hour delay is unchanged. Migration is not automatic: all interim-credited outputs must be reconciled and excluded before V2 crediting is enabled. An empty V2 output map must never be treated as proof that an old payment is uncredited.

## Verified so far

A real 0.00207 ZEC deposit was consolidated and [minted as 0.00207 zZEC](https://robinhoodchain.blockscout.com/tx/0xabfde9fbb8cb36c28750f784452b584daa4238cc6c8f0359f4e1ed44b172abf1). Its receipt and backing were reconciled, and fresh worker runs produced no duplicate mint. The automatic worker publishes completed payment status, and public requests are now enabled.

Checks cover the existing operator policies, contract access and route behavior, interrupted/stale checkpoint rejection, and simulated wallet UI states. These checks are not an independent audit or a guarantee that no defects exist.

## Legacy exact-amount design — closed

The material below documents the deployed legacy desk for existing-request recovery. It is not an instruction to open or fund a new request.


> **In one breath.** Open a request on the WrapDesk for the amount you want. It hands you an exact deposit figure whose last digits are unique to your request. Send exactly that much ZEC from any Zcash wallet to the reserve address. After three confirmations the operator records your Zcash transaction on chain and the desk mints your zZEC, one for one, with no fee. If you change your mind before sending, cancel; nothing was held.

## Legacy deployment status

The WrapDesk is deployed at `0xb53E3CD58668D1fC9082b51a7d74879733e9E118`. The 48-hour role timelock makes activation eligible on **2026-09-07 at 19:16 UTC**; the owner committed the role change on September 7. There is no additional website countdown. The form stays closed until the on-chain role change and operator readiness checks are complete. Do not send a deposit before opening your own request.

## Why a desk, not a bridge

Zcash is not an EVM chain, so no contract on Robinhood Chain can see a Zcash payment. Someone has to look. The desk makes that someone accountable: every mint passes through it and carries a reason, either a wrap request a holder opened and funded, or an operator mint against fee-route reserve growth tagged with a reference. There is no third kind of mint once the desk is the minter.

## How matching works without trusting anyone's word

{{viz:wrapstates}}

Zcash transparent outputs cannot carry a memo, so the desk encodes the request into the **amount**. Amounts are in steps of 0.001 ZEC, and each request gets a deposit of `amount + (id + 1)` zatoshi. Request 0 for 1 ZEC asks for exactly 1.00000001 ZEC, request 1 asks for 1.00000002, and so on. A payment of that exact value to the reserve address can only belong to that request. The extra zatoshi stay in the reserve as coverage.

The operator's tool scans the reserve address's unspent outputs (via lightwalletd's `GetAddressUtxos`), keeps only outputs at least as recent as the request, and matches on value. Three confirmations are required.

## Archived legacy user flow — not for new deposits

1. Connect a wallet on Robinhood Chain in the Wrap section of the site.
2. Enter an amount in steps of 0.001 ZEC (minimum 0.001) and confirm the request transaction. Gas only.
3. The site shows your deposit line: **send exactly X.XXXXXXXX ZEC to t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw**. Copy both. Send in one payment from any Zcash wallet, shielded or transparent.
4. Wait for 3 confirmations (about 4 minutes) and the next operator run. Your zZEC arrives in the wallet that opened the request. The request shows as **minted** with a link to the Zcash transaction.

If you sent the wrong amount, sent twice, or cancelled after paying, automatic minting may stop. Contact the operator with the request ID and transaction ID. Recovery requires payment verification and manual reconciliation; do not send again or assume an automatic refund.

## Step by step, as the operator

```
npm run wrap                   # list open requests and their matches
WRAP_FULFILL=1 npm run wrap    # attest if headroom is short, then fulfil every confirmed match
WRAP_ID=3 ZEC_TXID=0x… npm run wrap   # inspect one request with the same evidence checks
```

Automatic rejection is disabled. The tool reserves other pending wrap payments and nets redemption reimbursement obligations before minting, re-attests if the attested reserve does not cover supply plus the new mints, and journals every fulfilment. The watchdog notifies the operator the moment a funded request has three confirmations.

## Limits worth knowing

- Requests are free to open (gas only) and the desk supports 99,999 requests for life. A determined spammer could exhaust that, which would stop new wrap requests until a redeployed desk becomes minter 48 hours later. Exhaustion stops new requests; recovery and any existing deposits still require operator handling. The worker also stops above 10,000 requests to bound scanning. Removing these availability limits requires additional contract and indexing work; it is not part of the deployed worker fix.
- Mints are still bounded by ZZEC: a fresh attestation must cover supply plus your amount. That is why the operator attests before fulfilling.
- The deposit tag adds up to 0.00099999 ZEC to your payment. It is not a fee; it is coverage.

## Check it yourself

`requestCount()`, `summary(id)` (requester, amount, requestedAt, status, zcashTxid, deposit), `depositZats(id)`, `minAmount()`, `requestsPaused()` on the desk. Every mint emits `Fulfilled` or `ReserveMint` with its reference.


## Following your deposit

Keep the wrapping page open with your receiving wallet connected. It refreshes every 15 seconds. A payment first appears after three Zcash confirmations; the page does not currently detect unconfirmed payments. The progress card then follows the reserve transfer, backing check and mint confirmation. These status changes are announced to assistive technology in the page; they are not background push notifications.

Once a deposit is detected, the stepper advances to **Receive** and the sending form is tucked away. **Make another deposit** opens it after completion; **Show deposit address** makes it available while processing. No second payment or wallet approval is needed to finish the original deposit. A completed card shows the actual zZEC minted and links to the mint receipt. The newest unfinished deposit takes priority over older completed receipts.

During a temporary status outage, the page retains the last recorded history for the connected wallet in memory and labels the progress as unavailable for live updates. New deposit instructions remain disabled until fresh checks pass. Refreshing the page clears this cached history, which reloads when service status recovers. An outage does not mean the payment failed: do not resend it.


When you reconnect your wallet, **Loading your deposits…** remains visible until the address and history checks finish. The desk only reports no confirmed deposits after a fresh, successful check matching your connected wallet and its route. Failed, stale or incomplete checks show a retry message instead, with automatic polling and a **Retry deposit check** button. New sending instructions stay disabled during the initial check.
