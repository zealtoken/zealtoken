---
title: zealz.fun, the launchpad
group: Ahead
---
# zealz.fun: launch a token on Zcash rails

> **In one breath.** zealz.fun lets anyone launch a token that trades against zZEC. One transaction creates the token, puts its entire supply into a Uniswap v4 pool, and locks that liquidity in a contract nobody can withdraw from. The creator receives no tokens and earns a share of every trade instead. Every trade also pays at least 0.5% of its zZEC to the Furnace, so every launch burns $ZEAL whether or not the token does well. The bonding curve lives inside the locked pool, so there is no graduation and no creator allocation. zZEC is the trust root: a launched token is only as sound as the reserve behind zZEC, which is attested on chain and can be checked by anyone. Status: contracts written and passing a full lifecycle on a chain fork, interface built on a preview link, not yet deployed.

{{viz:launchflow}}

## Why it exists

Every other launchpad prices tokens in the chain's gas coin. zealz.fun prices them in Zcash. That does three things at once: it gives every buyer a reason to hold zZEC, it locks zZEC permanently inside pools, and it routes a slice of every trade into the $ZEAL burn. The launchpad is not a side business. It is a demand engine for the wrapper and a burn engine for $ZEAL, and it happens to be a fair place to launch a token.

## The four contracts

| Contract | Job | Trust it needs |
|---|---|---|
| **ZealzToken** | A plain ERC-20 with a fixed supply of 1,000,000,000, minted once to the factory. No owner, no mint function, no tax, no hooks. | None. It is the simplest token that can exist. |
| **ZealzFactory** | Creates the token, opens the zZEC pool at the bottom of a single-sided range that holds the entire supply, hands the position to the locker, records the launch. The creator brings no capital. | None after deployment. Anyone may call `launch()`. |
| **ZealzHook** | Two jobs. On a batch launch, for the first ten minutes every buy is a bid: the hook holds the zZEC, the pool is untouched, sells are refused, and when the window closes one swap executes for the whole batch so everyone in it pays the same price. On an instant launch there is no window and trading starts in the first block. After that (or from the start) it takes the creator's fee, anywhere from 0.5% to 5%, from the zZEC side of every swap and splits it the way the creator chose at launch: at least 0.5% to the Furnace, at most 0.5% to the creator, 0.5% to the platform, and whatever is left paid to the token's holders as claimable zZEC dividends. The fee is always taken from the zZEC leg, so a buy pays it from the zZEC going in and a sell from the zZEC coming out. Nobody is ever paid in the launched token. | The fee range, the platform share, the minimum burn, the creator cap and the window length are constants. Each pool's fee, split and opening type are fixed at launch and cannot be changed. Only the factory can register pools. The only funds it ever holds are open bids and unclaimed batch tokens, movable only by their owners. |
| **ZealzLocker** | Holds every launch's position NFT forever. Anyone can call `compound()`: it collects the position's LP fees and adds them straight back as liquidity in the same range, so the floor only rises. Cannot decrease liquidity, transfer the NFT, or be upgraded. | None. It has no owner. |

All four live in the public repository under `contracts/contracts/zealz/`.

## A launch, step by step

1. **The creator fills in a form.** Name, ticker, one line, an image, and social links. The image and text become the token's metadata URI, recorded on chain in the `Launched` event.
2. **One transaction.** The creator pays the launch fee and confirms. Inside that transaction the factory mints the token, creates a Uniswap v4 pool for token/zZEC with the zealz hook attached, adds the full supply as liquidity, and transfers the resulting position NFT to the locker. The locker refuses any NFT that did not come from the factory.
3. **The pool is live.** The token appears on zealz.fun's feed and is tradeable on Uniswap immediately. There is no waiting period, no target to hit, and no second phase.
4. **Trading.** Buyers swap zZEC for the token. The pool's 0.3% LP fee accrues to the locked position. The hook takes its 2% of the zZEC leg on every swap and delivers every share in the same transaction, except the holders' share, which lands in the token's dividend ledger for them to claim.
5. **Forever.** The position never leaves the locker. Anyone can trigger a fee collection from it at any time, which pays the accrued LP fees out without touching the liquidity.



## The fee and the split, chosen by the creator

The hook takes a fee from the zZEC side of every trade. The creator sets it at launch, anywhere from 1% to 5%, and chooses how it is divided, within these rules:

| Share | Rule | Why |
|---|---|---|
| Total fee | 1% to 5% | 1% is the two minimums added up; 5% is the ceiling above which routers start refusing the pool and a token reads as a honeypot |
| Furnace (buys back and burns $ZEAL) | at least 0.5% | every launched token must feed the burn, at least as much as it pays the platform |
| Creator | at most 0.5%, whatever the total | a bigger fee buys more burn or more dividends, never a bigger creator cut |
| Platform | exactly 0.5%, whatever the total | runs zealz.fun, fixed in the hook; below what pump.fun keeps on its curve and what Clanker keeps of LP fees |
| Holders (dividends) | whatever is left | claimable in zZEC by every wallet holding the token, pro rata |

So a 2% token might be 0.5 burn, 0.5 creator, 0.5 platform, 0.5 holders. A 5% dividend token is 0.5 burn, no creator cut, 0.5 platform and 4% to holders. A 5% burn token sends 4% of every trade to the Furnace. The launch form offers those as presets (Balanced, Max burn, Dividend token, Burn token, Lean) and shows the trader's round-trip cost next to them: a 5% token costs about 5.3% per leg with the pool's LP fee, and the token page says so. Once set, the fee and split are written into the hook for that pool and can never change.

{{viz:launchfees}}

## The money, on a 1 zZEC buy with the Balanced split

Someone buys with 1 zZEC. The hook first takes 2% of it: 0.005 zZEC to the Furnace, 0.005 to the creator, 0.005 to the platform, and 0.005 into the token's dividend ledger. The pool's LP fee then takes 0.3% of the remaining 0.98 zZEC into the locked position, and the rest buys tokens. When someone sells tokens for zZEC, the same 2% comes off the zZEC coming out.

So over a round trip of 1 zZEC in and roughly 1 zZEC out:

| Destination | Amount | Why |
|---|---|---|
| Locked position (LP fee) | ~0.006 zZEC | 0.3% each way; compounds into the lock |
| Furnace, buys back and burns $ZEAL | ~0.01 zZEC | 0.5% of the zZEC leg each way |
| Holders, in zZEC | ~0.01 zZEC | 0.5% each way, claimable from the token |
| Creator | ~0.01 zZEC | 0.5% each way, paid on the spot |
| Platform | ~0.01 zZEC | 0.5% each way |

The trader's total cost is about 2.3% per leg, in the same range as any launchpad, but where it goes is fixed in code and shown on the token page.

## Buying with ETH

Nobody needs zZEC in their wallet to buy. The token page takes ETH by default and routes it through our own ETH/zZEC market and into the token in one transaction, using the Universal Router's multi-hop swap. During a batch opening the same route lands as a bid credited to the sender. Proven on the fork: an ETH buy of an instant launch, and an ETH bid into an opening.

Two things follow. Every ETH buy on any launched token is first a zZEC buy on our market, so it pays that market's 0.7% burn hook and pushes zZEC above its peg, which arbitrage closes by wrapping more ZEC into the reserve. And the ETH/zZEC market's depth is the ceiling on how comfortably anyone can ape: every ETH buy on every token passes through it, and the token page shows the price impact of that hop separately so nobody is surprised. Deepening that market is what the Herd desk is for.

## Dividends: holders paid in Zcash

Every launched token carries a small ledger. When the hook sends it zZEC, the token spreads that amount across every eligible token in circulation, and each wallet's claimable balance grows in proportion to what it holds. Holders call one function to claim; nothing is pushed, nothing is taxed on transfers, and balances are tracked exactly across every transfer.

Three addresses never earn dividends: the pool itself (which holds most of the supply), the hook (which holds unclaimed batch tokens) and the factory. That is what makes the number meaningful: dividends only go to people. They are plain claimable balances, not a rebase: your token balance never changes, your zZEC balance does when you claim. Distributions are held back until at least 1,000 tokens are in wallets, so the maths stays exact on the very first trades.

## What the creator gets

- **Up to 0.5% of every trade's zZEC, forever.** Paid to the creator address recorded at launch, on every swap, with no claim step. A creator who takes less sends the difference to the burn or to holders.
- **No allocation.** The creator holds zero tokens at launch. There is nothing to dump, so there is no reason for holders to fear the creator's wallet. A creator who wants exposure buys like everyone else.
- **A page.** Every launch gets a token page on zealz.fun with a live chart, the lock proof, the split, and the fee flow, read from chain.

## What a buyer gets

- A token whose liquidity cannot be pulled. The position is in a contract with no withdraw function, verifiable on the explorer.
- A price denominated in Zcash, on Uniswap, with normal slippage controls.
- The knowledge that the creator has no bag and earns only if the token keeps trading.
- A share of every trade, in zZEC, for as long as they hold, on any token whose creator left something for holders.

## What $ZEAL gets

- **At least 0.5% and up to 4% of every trade of every launched token**, converted to $ZEAL and burned by the Furnace on the next ignition. The creator sets the number.
- **zZEC demand.** Every buyer needs zZEC, which means buying it on the market or wrapping ZEC, both of which pull ZEC into the reserve.
- **Permanently locked liquidity.** The positions that buyers trade into can never be withdrawn, and they grow with every compound.

## Where the liquidity comes from: the curve is the pool

The liquidity is the supply. At launch the factory puts all one billion tokens (less a rounding dust of about 0.01%, which goes to treasury) into one locked Uniswap v4 position whose price range sits entirely above the opening price, so it holds only the token. The first buyer's zZEC enters that position and takes tokens out of the bottom of the range; every buy walks the price up the range and leaves more zZEC locked behind it; sells walk it back down. That is a bonding curve, except it lives inside the locked position from the first second: no curve contract, no graduation, no moment where anyone holds the funds. Two shapes: gentle (a wide range, price rises slowly per zZEC) and steep.

## Two openings, the creator chooses

At launch the creator picks how the first ten minutes work, and the choice is written into the hook for that pool forever:

| Opening | What happens in the first ten minutes | When to pick it |
|---|---|---|
| **Batch** | Every buy is a bid held by the hook. Nothing touches the pool, sells are refused, and one swap settles the whole batch at one price when the window closes. | A launch that will be sniped: everyone in the window pays the same price, so being first is worth nothing. |
| **Instant** | Nothing special. Trading starts in the block the pool opens. First come, first priced. | A community that is already waiting, a creator who wants the simple and familiar path, or a small launch where a window is more ceremony than protection. |

Everything else is identical between the two: the whole supply goes into the locked position, the fees are the same 2%, the lock compounds the same way, and neither gives the creator any tokens.

### The batch opening in detail

One point to understand before bidding: the settlement is one swap for the whole batch, so a large opening walks up the curve and everyone pays the average price along it, not the opening price. It is the same price for every bidder, and the interface will show the settlement price the batch would close at right now.

Sniping is the first-block problem every launchpad pretends to solve. With a batch opening the first ten minutes are not a race. Every buy in that window is a bid: the hook takes the zZEC, nothing touches the pool, and sells are refused. When the window closes, anyone calls settle and the hook executes one swap for the entire batch. Every bidder then claims tokens pro rata to their bid, at one shared price. A bot that is first by a millisecond gets exactly the price of the person who bid nine minutes later.

## Liquidity never falls

The pool's 0.3% LP fee accrues to the locked position. Anyone can call `compound()` on the locker: it collects those fees and adds them back as liquidity in the same range. Fees sit uncollected until someone compounds, so depth rises with every compound rather than every trade; the burner job will call it daily for every launched pool once the contracts deploy. It can never fall: the locker has no withdraw. The hard floor is the bottom tick of the range, fixed at launch. What ratchets upward is the zZEC the pool offers at every price level above it.

To be clear about what this is and is not: a graduated pump.fun token sits in a constant-product pool whose LP fees also stay in the pool, so its liquidity grows the same way. Concentrated-liquidity launchpads such as Clanker and Zora pay their LP fees out instead, so those positions never grow. Compounding is how our lock behaves, not something no one else has; the parts of this launchpad that are genuinely different are the Zcash pair, zZEC dividends to holders, the creator's split, the batch opening and, next, shielded buys.

## Open decisions

| Decision | Options | Effect |
|---|---|---|
| Launch fee | decided: 0.005 zZEC to treasury | forces every creator to wrap first, feeding the reserve |

## What is built, what is not

| Piece | State |
|---|---|
| ZealzToken, ZealzHook, ZealzLocker, ZealzFactory | written and unit-tested; the full lifecycle passes on a fork of Robinhood Chain: capital-free launch, buy and sell through the real Universal Router with the hook paying the creator and the Furnace, then a compound that raised the locked liquidity |
| Batch opening | built into the hook and passing on the fork: two bids, one settlement swap that pays the same 2% as any buy, pro-rata claims, sells refused during the window |
| Instant opening | passing on the fork: a second launch with the instant flag trades in its first block with no bids and no settlement |
| Variable fee | passing on the fork: a 5% token pays 0.5% to the Furnace, 0.5% to the platform and 4% to holders |
| Buying with ETH | passing on the fork: ETH to zZEC to token in one router transaction, and the same route as a bid during an opening; the site's calldata builder is byte-checked against ethers |
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
