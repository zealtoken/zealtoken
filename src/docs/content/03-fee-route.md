---
title: The fee route (Foundry, Pons, Tap)
group: The machine
---
# The fee route: how $ZEAL trades become ZEC

> **In one breath.** Every $ZEAL trade on Pons pays a 1% fee. Pons keeps 30% of it and credits 70% to the token's creator-fee recipient. Ours is a contract, the Tap, whose only exit is the Foundry, another contract that splits everything 60% to buy ZEC, 25% to zZEC liquidity, 15% to operations. Nothing in the path has a withdraw function. Today the route is partly blocked: Pons credited the first fees to an older recipient that cannot claim them, and we are waiting on Pons to re-point it.

## The path, station by station

1. **Trade.** Someone buys or sells $ZEAL on the Pons V2 pool (a Uniswap v4 pool with Pons's own hook attached, pool id `0x95f9…caf0`).
2. **Fee.** Pons's hook takes 1% of the trade. 30% stays with Pons for running the launchpad; 70% is the creator share.
3. **Escrow.** Pons does not push the creator share anywhere. It credits it inside its `V2FeeEscrow` contract (`0xd3AF…Ac9e`) under the current creator-fee recipient's address. Only that address can claim, because the escrow pays `msg.sender`.
4. **The Tap.** ZealTapV2 (`0x9F5b…bB47`) is designed to be that recipient. Anyone can call `sweep()` or `pull()` on it. It claims from the escrow and forwards every wei to the Foundry in the same transaction. It has no owner and no withdraw.
5. **The Foundry.** ZealFoundry (`0xa1C1…85a6`) receives ETH and splits it 60 / 25 / 15 to three fixed sinks. The split and the sinks are immutable; there is no owner at all.
6. **ZEC.** The reserve share is converted to native ZEC (over NEAR Intents, ETH → ZEC) and lands at the published reserve address, where the attestor picks it up.

## The worked example

A $100 trade pays $1.00 in fees. Pons keeps $0.30. The creator share is $0.70. The Foundry sends $0.42 to buy ZEC, $0.175 to zZEC liquidity, and $0.105 to operations. So 0.42% of every $ZEAL trade becomes Zcash in the reserve.

## What the Tap can do that the first version could not

When Pons points a token's creator fees at an address, its hook also records that address as the pool's `creator`. The creator may sweep the pool's pending fees itself (`sweepPoolFees`) and may move the recipient again without asking Pons (`transferCreatorFeeRecipient`, behind the Tap's own 48-hour migration timelock). The first Tap (`0xA0dA…E655`) could do neither, so it was superseded before ever becoming the recipient.

## What is blocked, and why

At launch the creator-fee recipient was set to the Foundry itself. The Foundry has no `claim()` call and the escrow pays only `msg.sender`, so every fee credited under the Foundry's address is **stranded**: nobody, including us and including Pons, can move it. The ledger shows it as "fees generated" but not as "claimable". Only Pons can re-point the recipient to the Tap (the factory's `transferCreatorFeeRecipient` is gated to the current recipient, which is a contract that cannot call it). We filed Pons's community-takeover request naming the Tap as the new recipient and are waiting. Once it lands, every fee from that moment on is claimable by anyone through the Tap. The stranded credit stays stranded; that money is gone, and we say so.

See [Incidents](#/incidents) for the full account.

## What anyone can do

- Call `pull()` on the Tap to claim its escrow credit and route it, any time it holds any.
- Call `sweep(0, 0)` on the Tap to sweep the pool's pending fees into the escrow first. If the pending fees are held in $ZEAL rather than ETH the Pons operator's conversion is needed and the call reverts harmlessly.
- Call `routeNative()` on the Foundry if ETH is sitting there un-split.

## Check it yourself

- Escrow credit under the Tap and under the Foundry: `balanceOf(address)` on `0xd3AF…Ac9e`.
- Pending fees in the hook: `pendingFees(poolId, address(0))` on `0xE5e7…e044`.
- Current creator: `launches(poolId)` on the hook, word 4.
- Pending recipient change: `pendingCreatorFeeRecipient(token)` on the factory `0x7eD5…C7e`.
