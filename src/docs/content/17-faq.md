---
title: FAQ
group: Ahead
---
# Frequently asked questions

> **In one breath.** The short answers to what people ask most. Every one links to the page with the long version.

## Is zZEC trustless?

No. It is reserve-backed and checkable. A key the operator holds custodies the ZEC at a published transparent address; an attestor posts the balance on chain every six hours; the contract refuses to mint above it. Reducing operator dependence is a roadmap goal; no migration is promised on a fixed date. See [Security and trust](#/security-and-trust).

## Can I wrap my own ZEC?

Use the wrap desk’s live availability. When open, connect your receiving wallet, request its permanent deposit address and send native ZEC there. The worker credits the actual received amount after confirmations and reserve processing; no exact trailing digits are required. The initial range is 0.001–1 ZEC per payment. See [Wrapping](#/wrap).

## Can I get my ZEC back?

Yes, through the Redemption Desk. Escrow zZEC with a t-address and an automatic payer sends native ZEC, usually within minutes. Live since September 6, 2026. See [Redeeming](#/redeem).

## Is $ZEAL a tax token?

No. The 1% is the standard Pons pool fee every token on the launchpad pays. What differs is where the creator share goes: a contract that splits it, with the largest share buying Zcash. See [The fee route](#/fee-route).

## Does holding $ZEAL give me a claim on the ZEC?

No. Holding $ZEAL does not confer a claim on the reserve, LP fees or guaranteed income. The Furnace uses fees it receives for buybacks and burns, which do not guarantee a higher price.

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

## What do I need to provide liquidity?

Both zZEC and ETH on Robinhood Chain, plus ETH for gas. The [liquidity desk](https://zealtoken.com/#liquidity) previews the matching zZEC amount in addition to the ETH entered. First-time deposits may require two approvals and a deposit transaction. It is not an ETH-only deposit service.

## How much do liquidity providers earn?

The 0.3% LP fee is shared among active providers. Earnings depend on volume, active share and time; this is not a daily yield. The separate 0.7% hook charge funds the Furnace, not an extra LP reward. Historical per-wallet earnings estimates based on current share were removed from the site because they were not actual fee accounting.

## Can I withdraw my liquidity?

The standard desk creates a position held in your wallet; manage it through [Uniswap positions](https://app.uniswap.org/positions). Withdrawing returns the position’s current assets, which can differ in quantity and value from the deposit. Fees may not offset losses. Launchpad-created locked positions are a separate product.

## Are bonus rewards or public auto-compounding live?

No public bonus-reward or auto-compounding program is offered by the desk today. Team position automation does not apply automatically to other wallets. A future program must publish funding and terms before starting.

## What is zealz.fun, and what does it do for ZEAL and zZEC?

The upcoming launchpad pairs launched tokens with zZEC. Its fee design supports $ZEAL buybacks and burns, and its ETH purchase route would create another use for the ETH/zZEC market. The [preview](https://zealz.fun) contains sample launches; contracts and interface are built and fork-tested, with public deployment and readiness checks still ahead. See [launchpad design](#/launchpad).

## Can the launchpad spend the ZEC backing zZEC?

Backing required for outstanding zZEC is not available project funding. Development and incentives need separately available funds. A larger reserve does not automatically mean a larger spendable budget: outstanding token liabilities must be accounted for.

## Are zZEC transfers private?

No. zZEC is a transparent token on Robinhood Chain. Native Zcash has separate shielding capabilities; check supported redemption address types before requesting a payout.

## Is ZEAL affiliated with Robinhood or Zcash?

ZEAL is independent and is not affiliated with, endorsed by or sponsored by Robinhood Markets, the Electric Coin Company or the Zcash Foundation. Robinhood Chain means the blockchain, not a brokerage listing.

## How are the build log and docs maintained?

Meaningful ecosystem changes must update both the dated [public build log](https://zealtoken.com/#phases) and the relevant documentation in the same work. Entries distinguish implementation, testing, preview, deployment and activation; plans are not recorded as completed features.
