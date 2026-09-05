---
title: Wrapping ZEC into zZEC
group: Using it
---
# Wrapping ZEC into zZEC

> **In one breath.** Open a request on the WrapDesk for the amount you want. It hands you an exact deposit figure whose last digits are unique to your request. Send exactly that much ZEC from any Zcash wallet to the reserve address. After three confirmations the operator records your Zcash transaction on chain and the desk mints your zZEC, one for one, with no fee. If you change your mind before sending, cancel; nothing was held.

## Status

The WrapDesk is deployed at `0xb53E3CD58668D1fC9082b51a7d74879733e9E118`. It becomes the zZEC minter when the 48-hour role timelock commits on **2026-09-07 at 19:16 UTC**. The wrap form on the site opens then. Requests opened before that moment could not be fulfilled, so the form stays closed until the commit.

## Why a desk, not a bridge

Zcash is not an EVM chain, so no contract on Robinhood Chain can see a Zcash payment. Someone has to look. The desk makes that someone accountable: every mint passes through it and carries a reason, either a wrap request a holder opened and funded, or an operator mint against fee-route reserve growth tagged with a reference. There is no third kind of mint once the desk is the minter.

## How matching works without trusting anyone's word

Zcash transparent outputs cannot carry a memo, so the desk encodes the request into the **amount**. Amounts are in steps of 0.001 ZEC, and each request gets a deposit of `amount + (id + 1)` zatoshi. Request 0 for 1 ZEC asks for exactly 1.00000001 ZEC, request 1 asks for 1.00000002, and so on. A payment of that exact value to the reserve address can only belong to that request. The extra zatoshi stay in the reserve as coverage.

The operator's tool scans the reserve address's unspent outputs (via lightwalletd's `GetAddressUtxos`), keeps only outputs at least as recent as the request, and matches on value. Three confirmations are required.

## Step by step, as a user

1. Connect a wallet on Robinhood Chain in the Wrap section of the site.
2. Enter an amount in steps of 0.001 ZEC (minimum 0.001) and confirm the request transaction. Gas only.
3. The site shows your deposit line: **send exactly X.XXXXXXXX ZEC to t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw**. Copy both. Send in one payment from any Zcash wallet, shielded or transparent.
4. Wait for 3 confirmations (about 4 minutes) and the next operator run. Your zZEC arrives in the wallet that opened the request. The request shows as **minted** with a link to the Zcash transaction.

If you sent the wrong amount, the operator cannot match it and will reject the request. Contact us; the ZEC is in the reserve and will be returned.

## Step by step, as the operator

```
npm run wrap                   # list open requests and their matches
WRAP_FULFILL=1 npm run wrap    # attest if headroom is short, then fulfil every confirmed match
WRAP_ID=3 ZEC_TXID=0x… npm run wrap   # manual fulfil of one request
WRAP_REJECT=3 REASON="sent 0.9" npm run wrap
```

The tool nets in-flight redemption payouts before minting, re-attests if the attested reserve does not cover supply plus the new mints, and journals every fulfilment. The watchdog notifies the operator the moment a funded request has three confirmations.

## Limits worth knowing

- Requests are free to open (gas only) and the desk supports 99,999 requests for life. A determined spammer could exhaust that, which would stop new wrap requests until a redeployed desk becomes minter 48 hours later. Nothing held would be lost. A v2 will recycle closed tags.
- Mints are still bounded by ZZEC: a fresh attestation must cover supply plus your amount. That is why the operator attests before fulfilling.
- The deposit tag adds up to 0.00099999 ZEC to your payment. It is not a fee; it is coverage.

## Check it yourself

`requestCount()`, `summary(id)` (requester, amount, requestedAt, status, zcashTxid, deposit), `depositZats(id)`, `minAmount()`, `requestsPaused()` on the desk. Every mint emits `Fulfilled` or `ReserveMint` with its reference.
