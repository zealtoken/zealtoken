---
title: Overview
group: Start here
---
# What ZEAL is, in one page

> **In one breath.** $ZEAL is a memecoin on Robinhood Chain whose trading fees buy real Zcash into a public reserve. That reserve backs zZEC, a 1:1 wrapped ZEC you can trade on Uniswap, wrap into, and redeem out of for native ZEC. Every zZEC trade pays a small cut into a contract called the Furnace, which buys $ZEAL and burns it. Two loops, one machine: $ZEAL trades grow the reserve, zZEC trades shrink the $ZEAL supply.

## The two loops

{{viz:machine3d}}

**Loop 01, the Foundry.** $ZEAL launched on the Pons launchpad. Pons charges a 1% fee on every $ZEAL trade and pays 70% of it to the token's creator-fee recipient. Our recipient is a contract with one exit, and that exit is the Foundry, which splits everything 60 / 25 / 15: sixty percent becomes native ZEC in the reserve, twenty-five percent seeds zZEC liquidity, fifteen percent runs operations. No wallet in that path can redirect a cent. See [The fee route](#/fee-route).

**Loop 02, the Furnace.** zZEC trades on a Uniswap v4 pool against ETH. A hook attached to that pool takes 0.7% of every swap and hands it to the Furnace. The Furnace can do exactly one thing with what it holds: sell it for ETH, buy $ZEAL, and send that $ZEAL to the burn address. See [The Furnace and the burn hook](#/furnace-and-hook).

Between them sits zZEC itself: a plain ERC-20 with 8 decimals whose supply can never exceed the last attested ZEC balance of the reserve. See [The zZEC wrapper](#/zzec).

## What $ZEAL gets out of it

A supply that shrinks with every unit of activity: 0.7% of every zZEC trade and at least 0.5% of every zealz.fun trade buy back and burn $ZEAL, and no one can switch that off. The full case is on [Why this is good for $ZEAL](#/why-zeal).

## What is live today

{{viz:coverage}}

| Piece | What it does | Address |
|---|---|---|
| $ZEAL token | The memecoin, launched on Pons V2 | `0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC` |
| ZealFoundry | Immutable 60/25/15 splitter, no owner | `0xa1C1Fb281cCC47C587565a01700bF61a03D885a6` |
| ZealTapV2 | Pons creator-fee recipient, one door to the Foundry | `0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47` |
| ZZEC | Wrapped Zcash, 1:1, attest → mint cap | `0x0b151Ff7a7c5250130EC16C275790961d558E402` |
| Reserve | Transparent Zcash address holding the ZEC | `t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw` |
| ZealFurnaceV4 | Fees → ETH → $ZEAL → burn | `0x72C2f71dC3c0058974fd59039F9A79397bf87E70` |
| ZealBurnHook | 0.7% of every zZEC swap to the Furnace | `0x16642362837e2FDC02fF1ECF71f5629c094B0044` |
| RedemptionDesk | Escrow zZEC, get native ZEC automatically · live | `0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a` |
| WrapDesk | Send ZEC, get zZEC 1:1 · opens Sep 7 | `0xb53E3CD58668D1fC9082b51a7d74879733e9E118` |
| zZEC/ETH pool | Uniswap v4, 0.3% LP fee, tick spacing 60, hooked | pool id `0xa6d4…db84` |

Every contract's source is verified, on Blockscout or Sourcify, and every one is linked from the [Verify it yourself](#/verify-yourself) page.

## Who does what

There is no company here, there is an operator. A handful of keys do specific jobs and nothing else, and every powerful change sits behind a 48-hour public timelock. The [Roles and keys](#/roles-and-keys) page lists each key, what it can do, and what it cannot.

## What is honest to say about it

zZEC v1 is **reserve-backed, not trustless**. The contracts guarantee the fee split, the supply cap, and the exit. A key the operator holds custodies the ZEC, at a published transparent address anyone can watch, and an attestor key reports its balance on chain every six hours. That is a real trust assumption and the site says so on every relevant page. Phase 04 replaces it with trust-minimized custody. See [Security and trust](#/security-and-trust).

## How to read these docs

Every page starts with the plain-English version in the green box. Below it comes the mechanism, then the step-by-step, then what can go wrong, then how to check it yourself. If you only read the green boxes you will understand the system. If you read the rest you will be able to audit it.
