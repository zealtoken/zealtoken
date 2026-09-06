---
title: Why this is good for $ZEAL
group: Start here
---
# Why this is good for $ZEAL

> **In one breath.** $ZEAL is a memecoin whose supply shrinks every time the wrapper is used. Every zZEC trade hands 0.7% to the Furnace, which buys $ZEAL and burns it. Every token launched on zealz.fun pays at least 0.25% of every trade into the same Furnace, and the creator can send up to 4.25%. The reserve, the market, the launchpad: all of it exists to give $ZEAL a permanent, mechanical bid and a permanently shrinking supply. Burns scale with usage, so they start small and grow with the machine.

{{viz:flywheel}}

## The four ways value reaches $ZEAL

**1. The burn hook on the zZEC market.** Every swap in the zZEC/ETH pool pays 1%. Liquidity providers keep 0.3%. The other 0.7% is taken by the hook and sent to the Furnace, whoever provided the liquidity and whoever made the trade. The Furnace turns it into $ZEAL and sends it to the dead address. This is protocol revenue that can only ever be spent one way.

**2. Every launch on [zealz.fun](#/launchpad).** Tokens launched there trade against zZEC, and their hook sends at least 0.25% of the zZEC side of every trade to the same Furnace, up to 4.25% if the creator chooses. A hundred launched tokens are a hundred pools feeding the burn, and the burn does not care whether any of them succeed.

**3. The Foundry's 25% liquidity bucket.** Once Pons re-points the creator-fee recipient to the Tap, a quarter of every $ZEAL fee becomes zZEC liquidity the protocol owns. Protocol-owned liquidity hosts trades, and every trade it hosts burns.

**4. The reserve itself.** No zZEC exists without ZEC in the reserve. Every ZEC that gets wrapped is more zZEC in circulation, more that can be traded, more depth for the keeper to hold the peg, and so more volume through the hook. Reserve growth is upstream of every burn.

{{viz:burns}}

## What burns do to supply

$ZEAL has a fixed supply. Burned tokens go to `0x000…dEaD`, an address nobody controls, and never come back. The Furnace's `totalZealBurned` counter is public, every burn is an event, and the dead address's balance on the explorer is the proof. Supply only moves one way.

The honest framing: at today's volume the burns are small. The hook has taken a few thousandths of a zZEC so far. The design is not "big burns now"; it is "a burn on every unit of activity, forever, with no one able to switch it off". The Furnace has no withdraw, the hook has no owner, and the share is immutable. Growth in activity is growth in burn, and nothing in between can be captured.

## What $ZEAL is not

Not a claim on the reserve. Not equity. Not a share of fees paid to holders. Holding $ZEAL entitles you to nothing except a supply that shrinks as the machine runs. That is the whole proposition, and it is stated the same way on the site, in these docs, and in the contracts.

## What would make the burns larger

- **Volume on the zZEC market.** More trades, more hook takes. Depth attracts volume, which is why [providing liquidity](#/market-and-keeper) matters to $ZEAL holders even if they never touch zZEC.
- **Launches on zealz.fun.** Each one is a new pool paying between 0.25% and 4.25% of every trade to the Furnace.
- **The Pons re-point.** It unlocks the 25% bucket and turns future $ZEAL fees into protocol-owned depth.
- **Reserve growth.** More ZEC wrapped means more zZEC to trade. Wrap requests open on Sep 7.

{{viz:hook}}

## Check it yourself

`totalZealBurned()` and `burnCount()` on the Furnace, `totalTaken0()` / `totalTaken1()` on the hook, and the dead address's $ZEAL balance on the explorer. Every ignition is an `Ignited` event with amounts and the caller. The [Verify it yourself](#/verify-yourself) page has the selectors.
