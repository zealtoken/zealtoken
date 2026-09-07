---
title: Overview
group: Start here
---
# What ZEAL is, in one page

> **In one breath.** ZEAL is building a home for Zcash on Robinhood Chain. $ZEAL is the community token; zZEC is reserve-backed wrapped Zcash; the liquidity desk supports its market; zealz.fun is the upcoming launchpad. Buying $ZEAL does not confer a claim on the ZEC reserve or LP fees.

## Ways to participate

- **Buy $ZEAL:** exposure to the community token’s market price, with no guaranteed return.
- **Provide zZEC + ETH:** own a liquidity position and share the pool’s 0.3% LP fees while active. Preview both amounts before connecting; manage the position through Uniswap. Fees may not offset losses.
- **Explore zealz.fun:** preview the launchpad interface and sample launches. The planned token markets use zZEC and route fees toward $ZEAL buybacks and burns. The preview is not a public mainnet launch.

The homepage links directly to all three paths. Read the [ecosystem roadmap](#/roadmap), [launchpad design](#/launchpad) and [FAQ](#/faq).

## Finding your way around the homepage

The solid header keeps Liquidity and Launchpad directly accessible. Use zZEC groups wrapping, redemption and trading; How it works and Proof organize the explanations and verification links. Dropdown buttons and direct links use consistent sizing, with visible expanded states and keyboard focus. On smaller screens, open the menu and select a group to reveal its links.

The hero keeps Buy ZEAL as its green primary action; liquidity and launchpad buttons use solid light backgrounds to stay readable over the animation. The contract-address bar also has an opaque background. The footer lists the full ZEAL and zZEC contracts on Robinhood Chain in separate labeled rows, each with its own Copy and Explorer controls. These are token contracts, not native Zcash deposit addresses.

The ecosystem overview introduces four connected parts: ZEAL, zZEC, the Herd’s liquidity and zealz.fun. The launchpad is in development: its planned token markets pair with zZEC and use trading fees to support ZEAL buybacks and burns.

The homepage puts liquidity near the top, followed by one **Zcash desk** with **Wrap ZEC → zZEC** and **Redeem zZEC → ZEC** tabs. Switching tabs preserves the mounted forms and their progress; it does not submit, cancel or reverse a transaction. Each direction still has its own connection and status checks. Existing wrap and redeem links select the matching tab.

Wrapping assigns a Zcash deposit address to your Robinhood Chain recipient. Redemption escrows zZEC before an operator pays native ZEC. Their networks, limits and confirmation requirements differ: read the selected form before sending. This layout update changes no financial limits or transaction behavior.

Launchpad information follows the desk. Fee calculators, detailed diagrams, live reserve accounting and contract verification expand on demand. Calculators model assumptions, not promised earnings; Foundry fee routing still awaits Pons activation. The roadmap and latest three build updates stay visible, with every historical update available in the full archive. FAQ topic filters and “See all questions” expose the remaining answers.

## The two loops

{{viz:machine3d}}

**Loop 01, the Foundry.** $ZEAL launched on the Pons launchpad. Pons charges a 1% fee on every $ZEAL trade and pays 70% of it to the token's creator-fee recipient. The intended recipient is the Tap, forwarding to the Foundry. Routing is awaiting Pons activation; credited fees are not yet available reserve funding. Once routed, the Foundry splits receipts 60 / 25 / 15: sixty percent becomes native ZEC in the reserve, twenty-five percent seeds zZEC liquidity, fifteen percent runs operations. No wallet in that path can redirect a cent. See [The fee route](#/fee-route).

**Loop 02, the Furnace.** zZEC trades on a Uniswap v4 pool against ETH. A hook attached to that pool takes 0.7% of every swap and hands it to the Furnace. The Furnace can do exactly one thing with what it holds: sell it for ETH, buy $ZEAL, and send that $ZEAL to the burn address. See [The Furnace and the burn hook](#/furnace-and-hook).

Between them sits zZEC itself: a plain ERC-20 with 8 decimals whose supply can never exceed the last attested ZEC balance of the reserve. See [The zZEC wrapper](#/zzec).

## What $ZEAL gets out of it

The live zZEC hook directs its 0.7% charge to the Furnace. The planned zealz.fun design would add at least 0.5% of each launched-token trade’s zZEC leg. Buybacks and burns depend on activity and execution and do not guarantee a higher token price. The full case is on [Why this is good for $ZEAL](#/why-zeal).

## What is live today

{{viz:coverage}}

| Piece | What it does | Address |
|---|---|---|
| $ZEAL token | The memecoin, launched on Pons V2 | `0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC` |
| ZealFoundry | Immutable 60/25/15 splitter, no owner | `0xa1C1Fb281cCC47C587565a01700bF61a03D885a6` |
| ZealTapV2 | Intended Pons recipient; fee-routing activation pending | `0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47` |
| ZZEC | Wrapped Zcash, 1:1, attest → mint cap | `0x0b151Ff7a7c5250130EC16C275790961d558E402` |
| Reserve | Transparent Zcash address holding the ZEC | `t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw` |
| ZealFurnaceV4 | Fees → ETH → $ZEAL → burn | `0x72C2f71dC3c0058974fd59039F9A79397bf87E70` |
| ZealBurnHook | 0.7% of every zZEC swap to the Furnace | `0x16642362837e2FDC02fF1ECF71f5629c094B0044` |
| RedemptionDesk | Escrow zZEC, get native ZEC automatically · live | `0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a` |
| Deposit registry | Permanent wallet-bound Zcash addresses · public request switch gates opening | `0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379` |
| WrapDesk (interim minter) | Mints confirmed unique-address deposits · check live desk availability | `0xb53E3CD58668D1fC9082b51a7d74879733e9E118` |
| zZEC/ETH pool | Uniswap v4, 0.3% LP fee, tick spacing 60, hooked | pool id `0xa6d4…db84` |

Every contract's source is verified, on Blockscout or Sourcify, and every one is linked from the [Verify it yourself](#/verify-yourself) page.

## Who does what

There is no company here, there is an operator. A handful of keys do specific jobs and nothing else, and every powerful change sits behind a 48-hour public timelock. The [Roles and keys](#/roles-and-keys) page lists each key, what it can do, and what it cannot.

## What is honest to say about it

zZEC v1 is **reserve-backed, not trustless**. The contracts guarantee the fee split, the supply cap, and the exit. A key the operator holds custodies the ZEC, at a published transparent address anyone can watch, and an attestor key reports its balance on chain every six hours. That is a real trust assumption and the site says so on every relevant page. Reducing operator dependence is a roadmap goal, subject to review and a verified migration plan. See [Security and trust](#/security-and-trust).

## How to read these docs

Every page starts with the plain-English version in the green box. Below it comes the mechanism, then the step-by-step, then what can go wrong, then how to check it yourself. If you only read the green boxes you will understand the system. If you read the rest you will be able to audit it.
