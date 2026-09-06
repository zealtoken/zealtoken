---
title: zealz.fun, the launchpad
group: Ahead
---
# zealz.fun: launch a token on Zcash rails

> **In one breath.** zealz.fun lets anyone launch a token that trades against zZEC. One transaction creates the token, puts its entire supply into a Uniswap v4 pool, and locks that liquidity in a contract nobody can withdraw from. The creator receives no tokens and earns a share of every trade instead. Every trade also pays 1% into the Furnace, so every launch burns $ZEAL whether or not the token does well. No bonding curve, no graduation, no creator allocation, no rug. Status: contracts written and mostly tested, one math fix outstanding, interface built on a preview link, not yet live.

{{viz:launchflow}}

## Why it exists

Every other launchpad prices tokens in the chain's gas coin. zealz.fun prices them in Zcash. That does three things at once: it gives every buyer a reason to hold zZEC, it locks zZEC permanently inside pools, and it routes a slice of every trade into the $ZEAL burn. The launchpad is not a side business. It is a demand engine for the wrapper and a burn engine for $ZEAL, and it happens to be a fair place to launch a token.

## The four contracts

| Contract | Job | Trust it needs |
|---|---|---|
| **ZealzToken** | A plain ERC-20 with a fixed supply of 1,000,000,000, minted once to the factory. No owner, no mint function, no tax, no hooks. | None. It is the simplest token that can exist. |
| **ZealzFactory** | Creates the token, opens the zZEC pool, seeds it, hands the position to the locker, records the launch. | None after deployment. Anyone may call `launch()`. |
| **ZealzHook** | Runs after every swap in a launched pool and takes 2% of the output. On the zZEC side: 1% to the Furnace, 0.5% to the creator, 0.5% to treasury. On the token side: creator and treasury split it. | Immutable percentages and destinations. Only the factory can register pools. |
| **ZealzLocker** | Holds every launch's position NFT. Can collect the position's fees. Cannot decrease liquidity, transfer the NFT, or be upgraded. | None. It has no owner. |

All four live in the public repository under `contracts/contracts/zealz/`.

## A launch, step by step

1. **The creator fills in a form.** Name, ticker, one line, an image, and social links. The image and text become the token's metadata URI, recorded on chain in the `Launched` event.
2. **One transaction.** The creator pays the launch fee and confirms. Inside that transaction the factory mints the token, creates a Uniswap v4 pool for token/zZEC with the zealz hook attached, adds the full supply as liquidity, and transfers the resulting position NFT to the locker. The locker refuses any NFT that did not come from the factory.
3. **The pool is live.** The token appears on zealz.fun's feed and is tradeable on Uniswap immediately. There is no waiting period, no target to hit, and no second phase.
4. **Trading.** Buyers swap zZEC for the token. The pool's 0.3% LP fee accrues to the locked position. The hook takes its 2% on every swap and delivers it in the same transaction.
5. **Forever.** The position never leaves the locker. Anyone can trigger a fee collection from it at any time, which pays the accrued LP fees out without touching the liquidity.

{{viz:launchfees}}

## The money, on a 1 zZEC buy

Someone buys with 1 zZEC. The pool's LP fee takes 0.003 zZEC into the locked position. The remaining 0.997 zZEC buys tokens. The hook then takes 2% of the tokens that come out: half to the creator, half to treasury. On the way back, when someone sells tokens for zZEC, the hook takes 2% of the zZEC output: 1% to the Furnace, 0.5% to the creator, 0.5% to treasury.

So over a round trip of 1 zZEC in and roughly 1 zZEC out:

| Destination | Amount | Why |
|---|---|---|
| Locked position (LP fee) | ~0.006 zZEC | 0.3% each way; accrues to whoever collects fees on the locked position |
| Furnace, burns $ZEAL | ~0.01 zZEC | 1% of the zZEC output on the sell leg |
| Creator | ~0.005 zZEC + 1% of the tokens bought | 0.5% of zZEC out, half of the token-side cut |
| Treasury | ~0.005 zZEC + 1% of the tokens bought | the other halves |

The trader's total cost is about 2.3% per leg, in the same range as any launchpad, but where it goes is fixed in code.

## What the creator gets

- **0.5% of every zZEC leaving the pool, and 1% of every token leaving it, forever.** Paid to the creator address recorded at launch, on every swap, with no claim step.
- **No allocation.** The creator holds zero tokens at launch. There is nothing to dump, so there is no reason for holders to fear the creator's wallet. A creator who wants exposure buys like everyone else.
- **A page.** Every launch gets a token page on zealz.fun with a live chart, the lock proof, and the fee flow, read from chain.

Whether the locked position's LP fees also go to the creator, or to treasury, is one of the open decisions below.

## What a buyer gets

- A token whose liquidity cannot be pulled. The position is in a contract with no withdraw function, verifiable on the explorer.
- A price denominated in Zcash, on Uniswap, with normal slippage controls.
- The knowledge that the creator has no bag and earns only if the token keeps trading.

## What $ZEAL gets

- **1% of every sell of every launched token**, converted to $ZEAL and burned by the Furnace on the next ignition.
- **zZEC demand.** Every buyer needs zZEC, which means buying it on the market or wrapping ZEC, both of which pull ZEC into the reserve.
- **Permanently locked zZEC.** The zZEC that buyers spend accumulates inside locked positions and never comes out.

## The two ways to seed a pool

The code today requires the creator to bring some zZEC to seed the pool alongside the tokens (`minZzecIn`). Every launch then opens with two-sided liquidity and a real starting price.

The alternative under consideration is **capital-free launches**: the pool opens with tokens only, positioned in a price range above the starting price, and the first buyers' zZEC fills the locked position. Creators need nothing but the launch fee. The locking, the hook, and the burn are identical; the difference is who funds the first zZEC.

## Open decisions

| Decision | Options | Effect |
|---|---|---|
| Starting liquidity | creator brings zZEC, or capital-free single-sided tokens | who can launch, and whether launch day has two-sided depth |
| Locked position's LP fees | creator, or treasury | the size of the creator's permanent incentive |
| Launch fee | ETH or zZEC, and how much | a zZEC fee forces creators to wrap first, feeding the reserve |
| Anti-snipe | none, or a per-wallet cap in the first block | limits a creator buying their own launch with a second wallet |

## What is built, what is not

| Piece | State |
|---|---|
| ZealzToken, ZealzHook, ZealzLocker | written, unit-tested |
| ZealzFactory | written, compiles, one bug: the initial-price calculation loses precision when a billion tokens meet a fraction of a zZEC, so the first swap on a fork reverted. Needs Q64.96 fixed-point math, then a full lifecycle test on a fork. |
| Hook deployment | needs a mined address (Uniswap v4 encodes hook permissions in the address) |
| zealz.fun interface | built: feed, token pages, launch form with live preview, explainer. On a preview link with clearly labelled sample data until the factory deploys. |
| Docs | this page |

## Risks, honestly

- **A launched token can still go to zero.** Locked liquidity means nobody can pull the floor out; it does not mean the price holds. Most memecoins go to zero. The burn to $ZEAL happens either way.
- **The creator can buy first.** Fair launch with no allocation still lets a creator buy their own token with another wallet. The optional first-block cap narrows this and cannot eliminate it.
- **Contract risk.** Uniswap v4, the hook, the locker, and the factory are code. The zealz contracts are unit-tested and will be fork-tested; they are not audited.
- **Everything is priced in zZEC.** A launched token inherits zZEC's own trust model: reserve-backed, operator custody, checkable. See [Security and trust](#/security-and-trust).

## Check it yourself, once live

`launchCount()` and `launches(i)` on the factory return each token, creator, pool id, and locked position id. `ownerOf(positionId)` on Uniswap's PositionManager must return the locker. `FeeTaken` events on the hook show every cut with its three destinations. The addresses will be listed on this page and in the site footer the day the factory deploys.
