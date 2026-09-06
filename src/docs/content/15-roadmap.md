---
title: Roadmap and what comes next
group: Ahead
---
# Roadmap and what comes next

> **In one breath.** Phases 00 through 03 are live: launch, reserve, mint, redemption. The wrap desk opens on Sep 7. Phase 04 is the hard one, moving custody of the ZEC off a single key. Around it: a fee-route fix that depends on Pons, liquidity incentives paid in zZEC, a listing on up.only's DEX for depth, and zealz.fun, a launchpad for tokens paired with zZEC where every trade burns $ZEAL.

## Phases

| Phase | State | What it means |
|---|---|---|
| 00 Launch | live | $ZEAL on Pons, Foundry and Tap deployed and verified |
| 01 Reserve opens | live | First ZEC at the published address, first attestation, first mint |
| 02 zZEC mints | live | Wrapper and Furnace deployed, market on the hooked pool, burns running |
| 03 Redemption | Sep 6 | Redemption Desk: escrow, automatic payout, txid recorded, then burn |
| 03b Wrap | Sep 7 | WrapDesk becomes minter; send ZEC, get zZEC |
| 04 Hand off custody | the goal | Reserve moves to trust-minimized custody: a Zcash multisig first, then MPC such as NEAR Chain Signatures, or red·bridge when it ships |

## Near term

- **Sep 7, 16:04 UTC:** Furnace pool rotation commits; hook-delivered zZEC starts converting.
- **Sep 7, 19:16 UTC:** WrapDesk becomes the zZEC minter; the wrap form opens.
- **Pons fee re-point:** filed with Pons; unblocks the Foundry's 60/25/15 flow for every future fee.
- **Key separation:** cold owner key, hot igniter, so a compromise of the operator machine cannot reach ownership.
- **Both desks verified** on Blockscout and Sourcify.

## Incentives under consideration

The reserve and the pool are the same ZEC, since no zZEC exists without ZEC behind it. So rewards should be paid in zZEC, which forces the rewards budget itself to be wrapped ZEC. Candidates: a weekly zZEC rewards program for pool positions, pro rata to liquidity over time; a bonus for positions funded with freshly wrapped zZEC; gauge emissions on up.only once zZEC is whitelisted there. Fee-route mints become protocol-owned liquidity as soon as the route unblocks.

## zealz.fun

A launchpad for tokens paired with zZEC instead of ETH. Design decisions so far: liquidity is locked forever in a locker contract at launch; tokens go straight into a Uniswap v4 pool with a zealz hook (no bonding curve); fair launch with no creator allocation; the hook splits 2% of output, on the zZEC side 1% to the Furnace, 0.5% to the creator, 0.5% to treasury. Contracts are written and unit-tested except for the factory's initial-price math, which needs Q64.96 fixed-point work before deployment. [zealz.fun](https://zealz.fun) shows the coming-soon page. The full design is on [zealz.fun, the launchpad](#/launchpad).

## up.only

up33.xyz is a ve(3,3) DEX on Robinhood Chain (a Velodrome and Slipstream fork, audited by Shieldify). Its gauges can subsidise zZEC depth with emissions, but it is not Uniswap v4, so the burn hook cannot ride on it. Plan: the hooked pool stays the canonical burn market; up.only adds depth once governance whitelists zZEC.
