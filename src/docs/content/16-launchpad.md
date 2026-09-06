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
| **ZealzFactory** | Creates the token, opens the zZEC pool at the bottom of a single-sided range that holds the entire supply, hands the position to the locker, records the launch. The creator brings no capital. | None after deployment. Anyone may call `launch()`. |
| **ZealzHook** | Two jobs. On a batch launch, for the first ten minutes every buy is a bid: the hook holds the zZEC, the pool is untouched, sells are refused, and when the window closes one swap executes for the whole batch so everyone in it pays the same price. On an instant launch there is no window and trading starts in the first block. After that (or from the start) it takes 2% of every swap's output: on the zZEC side 1% to the Furnace, 0.5% to the creator, 0.5% to treasury; on the token side creator and treasury split it. | Immutable percentages and window length. The opening type is fixed per pool at launch and cannot be changed. Only the factory can register pools. The only funds it ever holds are open bids and unclaimed batch tokens, movable only by their owners. |
| **ZealzLocker** | Holds every launch's position NFT forever. Anyone can call `compound()`: it collects the position's LP fees and adds them straight back as liquidity in the same range, so the floor only rises. Cannot decrease liquidity, transfer the NFT, or be upgraded. | None. It has no owner. |

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

## Where the liquidity comes from with no bonding curve

The liquidity is the supply. At launch the factory puts all one billion tokens into one locked Uniswap v4 position whose price range sits entirely above the opening price, so it holds only the token. The first buyer's zZEC enters that position and takes tokens out of the bottom of the range; every buy walks the price up the range and leaves more zZEC locked behind it; sells walk it back down. That is a bonding curve, except it lives inside the locked position from the first second: no curve contract, no graduation, no moment where anyone holds the funds. Two shapes: gentle (a wide range, price rises slowly per zZEC) and steep.

## Two openings, the creator chooses

At launch the creator picks how the first ten minutes work, and the choice is written into the hook for that pool forever:

| Opening | What happens in the first ten minutes | When to pick it |
|---|---|---|
| **Batch** | Every buy is a bid held by the hook. Nothing touches the pool, sells are refused, and one swap settles the whole batch at one price when the window closes. | A launch that will be sniped: everyone in the window pays the same price, so being first is worth nothing. |
| **Instant** | Nothing special. Trading starts in the block the pool opens. First come, first priced. | A community that is already waiting, a creator who wants the simple and familiar path, or a small launch where a window is more ceremony than protection. |

Everything else is identical between the two: the whole supply goes into the locked position, the fees are the same 2%, the lock compounds the same way, and neither gives the creator any tokens.

### The batch opening in detail

Sniping is the first-block problem every launchpad pretends to solve. With a batch opening the first ten minutes are not a race. Every buy in that window is a bid: the hook takes the zZEC, nothing touches the pool, and sells are refused. When the window closes, anyone calls settle and the hook executes one swap for the entire batch. Every bidder then claims tokens pro rata to their bid, at one shared price. A bot that is first by a millisecond gets exactly the price of the person who bid nine minutes later.

## The floor only goes up

The pool's 0.3% LP fee accrues to the locked position. Anyone can call `compound()` on the locker: it collects those fees and adds them back as liquidity in the same range. Depth rises with every trade and can never fall, so a token's worst-case exit price ratchets upward over its life.

## Open decisions

| Decision | Options | Effect |
|---|---|---|
| Launch fee | ETH or zZEC, and how much | a zZEC fee forces creators to wrap first, feeding the reserve |

## What is built, what is not

| Piece | State |
|---|---|
| ZealzToken, ZealzHook, ZealzLocker, ZealzFactory | written and unit-tested; the full lifecycle passes on a fork of Robinhood Chain: capital-free launch, buy and sell through the real Universal Router with the hook paying the creator and the Furnace, then a compound that raised the locked liquidity |
| Batch opening | built into the hook and passing on the fork: two bids, one settlement swap, pro-rata claims, sells refused during the window |
| Instant opening | passing on the fork: a second launch with the instant flag trades in its first block with no bids and no settlement |
| Shielded buys and memo launches | next: both ride the wrap desk's tagged-deposit path |
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
