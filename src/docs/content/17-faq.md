---
title: FAQ
group: Ahead
---
# Frequently asked questions

> **In one breath.** The short answers to what people ask most. Every one links to the page with the long version.

## Is zZEC trustless?

No. It is reserve-backed and checkable. A key the operator holds custodies the ZEC at a published transparent address; an attestor posts the balance on chain every six hours; the contract refuses to mint above it. Phase 04 replaces the custody. See [Security and trust](#/security-and-trust).

## Can I wrap my own ZEC?

After the WrapDesk role change and operator readiness checks are complete, open a request, send the exact deposit, receive zZEC 1:1 with no fee. See [Wrapping](#/wrap).

## Can I get my ZEC back?

Yes, through the Redemption Desk. Escrow zZEC with a t-address and an automatic payer sends native ZEC, usually within minutes. Live since September 6, 2026. See [Redeeming](#/redeem).

## Is $ZEAL a tax token?

No. The 1% is the standard Pons pool fee every token on the launchpad pays. What differs is where the creator share goes: a contract that splits it, with the largest share buying Zcash. See [The fee route](#/fee-route).

## Does holding $ZEAL give me a claim on the ZEC?

No. $ZEAL funds the reserve; zZEC is the exposure. $ZEAL holders get a supply that shrinks every time the wrapper is used.

## Why is the fee route "blocked"?

Pons credited the first fees to a recipient that cannot claim them, and only Pons can re-point it. The request is filed. See [Incidents](#/incidents).

## Who can burn $ZEAL?

Anyone can call `burn()` on the Furnace to send what it holds to the dead address. Converting held zZEC and ETH into $ZEAL first (`ignite`) is gated to the igniter because it needs a price-aware caller. See [The Furnace](#/furnace-and-hook).

## Why is zZEC sometimes not exactly the ZEC price?

The pool is small. A keeper trades it back toward fair value when it drifts more than 1%, but it has finite inventory. Size trades to the depth shown on the Market section. See [The market](#/market-and-keeper).

## Where is the code?

[github.com/zealtoken/zealtoken](https://github.com/zealtoken/zealtoken). Contracts, tests, operator, site, and these docs.

## Who runs this?

An operator working under the project's name, with keys that can each do one job and timelocks on every change of who holds them. See [Roles and keys](#/roles-and-keys).
