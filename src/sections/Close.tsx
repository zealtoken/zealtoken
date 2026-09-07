import { useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, PONS, PONS_V2, SPLIT, TOKEN, ZZEC_MARKET } from '../config'

// One $100 trade, walked to the cent. Everything derives from config.
const FEE_PER_100 = PONS.poolFeePct
const FOUNDRY_PER_100 = (FEE_PER_100 * PONS.creatorSharePct) / 100
const PONS_KEEP_PER_100 = FEE_PER_100 - FOUNDRY_PER_100
const SPLIT_PER_100 = SPLIT.map((x) => (FOUNDRY_PER_100 * x.pct) / 100)
// two decimals minimum, a third only when the number needs it ($0.175, 0.105%)
const trim = (n: number) => (Math.round(n * 1000) % 10 === 0 ? n.toFixed(2) : n.toFixed(3))
const money = (n: number) => `$${trim(n)}`
import { stagger } from '../useReveal'
import { ContractAddress } from './ContractAddress'

const PHASES = [
  {
    p: 'Community', t: `Launch $${TOKEN.symbol}`, s: 'live',
    d: `$${TOKEN.symbol} is live on ${PONS.launchpad}. Public contracts, documentation and a dated build log form the ecosystem’s foundation. Creator-fee routing remains a separate activation step; follow its live status in the ledger.`,
    href: LINKS.pons, label: `Explore $${TOKEN.symbol}`,
  },
  {
    p: 'Wrapped Zcash', t: 'Bring Zcash to Robinhood Chain', s: 'live',
    d: `${TOKEN.wrapper}, its public reserve, trading market and redemption desk are live. Public wrapping has its own activation checks: use the wrap desk’s current status before sending any ZEC.`,
    href: '#wrap', label: 'Check wrap and redemption availability',
  },
  {
    p: 'Liquidity', t: `Deepen ${TOKEN.wrapper} liquidity`, s: 'in progress',
    d: 'The liquidity desk and deposit preview are live. Next: easier funding, better position management and a funded provider-incentive program. Additional rewards are not live; any program will publish its budget, terms and dates before it starts.',
    href: '#liquidity', label: 'Provide liquidity',
  },
  {
    p: 'Launchpad', t: 'Launch zealz.fun', s: 'in progress',
    d: `A token launchpad built around ${TOKEN.wrapper} markets and $${TOKEN.symbol} buybacks and burns. Contracts and the interface are built, with lifecycle tests on a chain fork. Public launch still requires deployment, verification and operational readiness checks. No launch date is promised here.`,
    href: '/docs/#/launchpad', label: 'See what is built and what remains',
  },
  {
    p: 'Long-term foundation', t: 'Strengthen custody and resilience', s: 'planned',
    d: `Keep improving monitoring, reserve transparency and recovery procedures while evaluating custody with less operator dependence. ${TOKEN.wrapper} currently uses operator custody; any replacement needs review and a verified migration plan. Backing for outstanding ${TOKEN.wrapper} is not launchpad spending money.`,
    href: '/docs/#/security-and-trust', label: 'Understand the current trust model',
  },
]

const src = (addr: string) => `${CONTRACTS.explorer}/address/${addr}?tab=contract`

/** Dated, linkable, and only things that already happened. */
/** One line per build-log day, so a collapsed log still tells the story. */
const DAYS: Record<string, string> = {
  'Sep 03': 'Launch, the fee route, the wrapper deployed',
  'Sep 04': 'First ZEC in the reserve, first mint, the market opens, first burn',
  'Sep 05': 'Peg keeper, the burn hook, both desks deployed',
  'Sep 06': 'Redemption opens and pays, docs, the launchpad passes a fork',
  'Sep 07': 'Public wrapping, clearer deposit tracking and a shorter ecosystem homepage',
}

const LOG: { d: string; t: string; href?: string; label?: string }[] = [
  { d: 'Sep 03', t: `$${TOKEN.symbol} live on ${PONS.launchpad}. Graduated in under an hour.`, href: LINKS.pons, label: 'Pons' },
  { d: 'Sep 03', t: 'ZealFoundry deployed. 60/25/15 split, no owner, no admin. Source verified.', href: CONTRACTS.foundry ? src(CONTRACTS.foundry) : undefined, label: 'source' },
  { d: 'Sep 03', t: 'ZealTap deployed and verified. Pons V2 pays only a caller, so the Tap claims and hands everything to the Foundry.', href: src(PONS_V2.tapV1), label: 'source' },
  { d: 'Sep 03', t: 'ZealTapV2 deployed and verified. It can sweep its own pool and migrate itself, so fee routing never depends on anyone else again. Still one exit: the Foundry.', href: PONS_V2.tap ? src(PONS_V2.tap) : undefined, label: 'source' },
  { d: 'Sep 03', t: `${TOKEN.wrapper} contract written and tested, CI on every push.`, href: LINKS.repo ? `${LINKS.repo}/blob/main/contracts/contracts/ZZEC.sol` : undefined, label: 'ZZEC.sol' },
  { d: 'Sep 03', t: 'Reserve operator built: attest, mint, redemption watcher, ETH → ZEC sweep over Relay and NEAR Intents.', href: LINKS.repo ? `${LINKS.repo}/tree/main/ops` : undefined, label: 'ops/' },
  { d: 'Sep 03', t: 'Everything public: contracts, tests, operator, site.', href: LINKS.repo ?? undefined, label: 'github' },
  { d: 'Sep 03', t: 'Reserve address published. A transparent Zcash address anyone can watch, balance zero until the first conversion lands.', href: TOKEN.reserveAddress ? LINKS.zcashExplorer + TOKEN.reserveAddress : undefined, label: 'zcash' },
  { d: 'Sep 03', t: `${TOKEN.wrapper} deployed and verified. Supply zero. It cannot mint until the reserve is attested, and it can never stop redemptions.`, href: CONTRACTS.zzec ? src(CONTRACTS.zzec) : undefined, label: 'source' },
  { d: 'Sep 04', t: 'Live ZEC balance on the ledger, read from a Zcash node next to the attested number. Check either against the explorer.' },
  { d: 'Sep 04', t: 'The Furnace rebuilt for Uniswap v4: zZEC fees → ETH → $ZEAL → burn, LP fees collectable by anyone, liquidity itself untouchable. 9 new tests, 83 total.', href: LINKS.repo ? `${LINKS.repo}/blob/main/contracts/contracts/ZealFurnaceV4.sol` : undefined, label: 'source' },
  { d: 'Sep 04', t: 'First attestation posted by the attestor key, on a 6-hour schedule from here. Reserve 0, supply 0, coverage honest.', href: `${CONTRACTS.explorer}/tx/0x563e3ee4ac540c447ed0e8b61fc8e037233737f30508923058fcd92950b79786`, label: 'tx' },
  { d: 'Sep 04', t: 'Adversarial review pass over every contract, the operator, and the site. One real hole in the unreleased Furnace, plus operator and copy fixes. All closed. 84 tests.' },
  { d: 'Sep 04', t: 'First ZEC in the reserve, bought with ETH over NEAR Intents and attested on-chain a minute later. Both tiles agree.', href: `${CONTRACTS.explorer}/tx/0x8e2708905bf4b41809462165660b96bda0634d95f46683cea20373b93a6f1380`, label: 'tx' },
  { d: 'Sep 04', t: 'First mint: 0.11833344 zZEC against 0.11833344 ZEC. Coverage exactly 1.00.', href: `${CONTRACTS.explorer}/tx/0x5c6c2f230b8990e2501d44196955cd16f7f1cb5917a896d12aca995864b6b530`, label: 'tx' },
  { d: 'Sep 04', t: 'The zZEC/ETH market opens on Uniswap v4, initialized and seeded in one transaction. The first wrapped Zcash on Robinhood Chain is tradable.', href: `${CONTRACTS.explorer}/tx/0xa1251a34de6b4182ff9c04eabad724f520c7d28af925d1de38f64e97f29bf5de`, label: 'tx' },
  { d: 'Sep 04', t: 'The Furnace deploys, verified, with an instant pause, owner-set hook data, and timelocked pool rotation added from an outside reader\u2019s review the same day. Loop two is on chain.', href: CONTRACTS.furnace ? src(CONTRACTS.furnace) : undefined, label: 'source' },
  { d: 'Sep 04', t: 'First burn. zZEC trading fees collected, swapped to $ZEAL through the Furnace, and sent to the burn address. 571.8 $ZEAL gone. Loop two turns.', href: `${CONTRACTS.explorer}/tx/0x51a42aec6c299e78a187c3f8e62266b7a9872718dfd04e87b2160b16f1dd17a2`, label: 'tx' },
  { d: 'Sep 04', t: 'Reserve grows to 0.4263 ZEC, attested and minted the same evening. Second liquidity position: pool depth 3.6x, coverage still exactly 1.00.', href: `${CONTRACTS.explorer}/tx/0x5c13174ff89dc85e038cbb4f2ef195694753ba9ed871d4e995f8fe930b42524c`, label: 'tx' },
  { d: 'Sep 05', t: 'Peg keeper live. A dedicated wallet with zZEC and ETH inventory checks the pool every minute and trades it back to the ZEC price outside a 1.5% band. First automated trade: a 5.7% premium closed to 0.6%.', href: `${CONTRACTS.explorer}/tx/0xe2002317546ad5bd6fdb4d090b1caf26e8c0c55c4b5f0b9f9bfbbc4f8a8c11d6`, label: 'tx' },
  { d: 'Sep 05', t: 'The burn hook. A Uniswap v4 hook on the zZEC market takes 0.7% of every swap and hands it to the Furnace, whoever provides the liquidity. Proven on a fork of the live chain, then deployed.', href: `${CONTRACTS.explorer}/address/0x16642362837e2FDC02fF1ECF71f5629c094B0044`, label: 'hook' },
  { d: 'Sep 05', t: 'The zZEC market moves to the hooked pool: 0.3% to liquidity providers, 0.7% to the burn. Same 1% for traders, every trade now burns $ZEAL.', href: `${CONTRACTS.explorer}/tx/0x135a097770c63e6cf7b9d1a680e93d5ae13bbebcadca902e869548c2eb5eb538`, label: 'tx' },
  { d: 'Sep 05', t: 'Redemption desk deployed. Escrow zZEC with a transparent Zcash address; the operator pays native ZEC and records the Zcash transaction on chain before anything burns. If a payout ever failed, you reclaim it yourself. Nobody can stop that.', href: CONTRACTS.desk ? `${CONTRACTS.explorer}/address/${CONTRACTS.desk}` : undefined, label: 'desk' },
  { d: 'Sep 05', t: 'Redeem form on this page. Connect a wallet, approve, request, watch your own queue. Phase 03 is open.', href: '#redeem', label: 'redeem' },
  { d: 'Sep 05', t: 'WrapDesk deployed and verified: send ZEC to the reserve, receive zZEC 1:1. Each request carries a unique deposit tag so payments match without trusting anyone to say which is which. Every mint passes through the desk with its reason.', href: `${CONTRACTS.explorer}/address/0xb53E3CD58668D1fC9082b51a7d74879733e9E118`, label: 'desk' },
  { d: 'Sep 05', t: 'zZEC minter rotation proposed to the WrapDesk. The wrapper enforces a 48-hour timelock on role changes, so activation becomes eligible on Sep 07 at 19:16 UTC. The public wrap opening is scheduled for 23:16 UTC, after activation.', href: `${CONTRACTS.explorer}/tx/0x7e38dabb29bb3ca49acd7318c1b0c2178308ce40e6d16495403688b90d5cb3dc`, label: 'tx' },
  { d: 'Sep 06', t: 'Redemption opens. First redemption paid end to end: zZEC escrowed, native ZEC sent, the Zcash transaction recorded on chain, and only then the escrow burned.', href: CONTRACTS.desk ? src(CONTRACTS.desk) : undefined, label: 'source' },
  { d: 'Sep 06', t: 'Automatic payer live. Redemptions are paid from a hot float within minutes, capped per request and per day, and every payout is journalled before anything is burned. No human in the loop for ordinary amounts.' },
  { d: 'Sep 06', t: 'The Herd. A liquidity desk on this page: leaderboard, tiers, and a way to add zZEC depth without leaving the site.', href: '#liquidity', label: 'the herd' },
  { d: 'Sep 06', t: 'Docs. Seventeen chapters covering every process, every address, and every risk we know about.', href: '/docs/', label: 'docs' },
  { d: 'Sep 06', t: 'zealz.fun launchpad contracts pass a full lifecycle against a fork of this chain: capital-free launch, batch and instant openings, zZEC dividends to holders, compounding locks, and buying with ETH. Built, not deployed.', href: '/docs/#/launchpad', label: 'design' },
  { d: 'Sep 06', t: 'Adversarial review round. Sixteen independent reviews of the contracts, the operator and the site produced 139 findings. Eight launchpad design issues were fixed the same night, before anything was deployed.', href: '/docs/#/launchpad', label: 'what was fixed' },
  { d: 'Sep 07', t: 'zZEC traded up to twenty-one times par overnight. Nothing malfunctioned: a peg needs two arbitrage legs and only redemption was live, so supply was fixed and nobody could add more until the wrapper opened. Coverage never fell below 1.', href: '/docs/#/incidents', label: 'incidents' },
  { d: 'Sep 07', t: 'Peg defended with our own capital. ZEC added to the reserve, minted 1:1 against it, and sold back into the market by the keeper until the price returned to par. zZEC back to 0.484 ETH against a fair value of 0.485.' },
  { d: 'Sep 07', t: 'Reserve more than tripled overnight, from 0.99 to 3.39 ZEC, coverage 1.0018. Every zZEC still backed one for one.', href: TOKEN.reserveAddress ? LINKS.zcashExplorer + TOKEN.reserveAddress : undefined, label: 'reserve' },
  { d: 'Sep 07', t: 'Largest burn to date. 69,377 $ZEAL bought back and burned from that volume alone, nearly seven times everything burned before it, on a fee split nobody can switch off.', href: CONTRACTS.furnace ? src(CONTRACTS.furnace) : undefined, label: 'furnace' },
  { d: 'Sep 07', t: 'ZEAL homepage reorganized around the broader Zcash ecosystem. Buy $ZEAL remains primary; direct liquidity and zealz.fun preview links sit beside it. A launchpad overview explains benefits for ZEAL, zZEC, creators and traders, with preview status explicit.', href: '#launchpad', label: 'launchpad overview' },
  { d: 'Sep 07', t: 'Liquidity deposits can be previewed before connecting a wallet. Fee explanations and Uniswap position-management links added; misleading estimated historical earnings and price-impact figures removed. Exact decimal input validation and Permit2 allowance-expiry handling improved. This does not add ETH-only deposits or a public compounding program.', href: '#liquidity', label: 'liquidity desk' },
  { d: 'Sep 07', t: 'Roadmap expanded to cover community, wrapped Zcash, liquidity, zealz.fun and custody. FAQ expanded from four to sixteen questions with topic filters and supporting links. Desktop and mobile layouts, navigation and FAQ interactions checked; production builds passed.', href: '/docs/#/roadmap', label: 'roadmap and documentation' },
  { d: 'Sep 07', t: 'Launchpad overview now explains its central role in the ecosystem: creators launch against zZEC, trading gives the wrapper more uses, and fees support ZEAL buybacks and burns. Added a three-step flow and explained why zZEC/ETH depth matters to the planned ETH-buying route. Launchpad documentation updated; development status remains explicit.', href: '#launchpad', label: 'ecosystem connection' },
  { d: 'Sep 07', t: 'Wrapping readiness checked against on-chain roles and AWS services. Timelock eligibility does not mean activation: the minter change is uncommitted and the wrapping worker is not installed. Public wrapping remains pending. Added local operator regression checks and a deployed-contract fork test; no real deposit-to-mint test has been completed.', href: '/docs/#/wrap', label: 'wrapping readiness' },
  { d: 'Sep 07', t: 'Wrap deposit accounting protections deployed to AWS: pending, duplicate and cancelled-request payments stay reserved from other minting and reserve spending. Wrapping worker installed behind a disabled activation gate. Added confirmation recovery, older request history and cancellation warnings to the website. Owner activation and a real deposit-to-mint test remain outstanding; public wrapping is still closed.', href: '/docs/#/wrap', label: 'readiness and remaining limits' },
  { d: 'Sep 07', t: 'Launchpad overview now includes a clickable token-page preview beside the introduction. Based on zealz.fun’s Zebra Foundry sample, it shows the chart, locked liquidity and ZEAL-burn presentation with sample status explicit. Responsive layout stacks the preview below the introduction on mobile.', href: '#launchpad', label: 'see the preview' },
  { d: 'Sep 07', t: 'WrapDesk minter activation confirmed on-chain. AWS wrapping worker and timer enabled; the first no-deposit pass completed successfully. The public form remains gated until a real minimum-size deposit-to-mint test is reconciled.', href: `${CONTRACTS.explorer}/tx/0x7661cd225a5f0cf4f171e8e11e51870c8cacecba377a0c81707f508e57160c04`, label: 'activation transaction' },
  { d: 'Sep 07', t: 'Fixed overlapping heading and fee description in the zealz.fun token preview’s “Where every trade goes” section. The explanation now sits below the heading, left-aligned, with room to wrap on smaller screens.', href: 'https://zealz.fun/#/t/0x1111111111111111111111111111111111111111', label: 'token preview' },
  { d: 'Sep 07', t: 'Wrapping redesign started after an exact-amount test mismatch. Public wrapping stays closed; the legacy matcher is paused and the claimed test output is reserved for reconciliation. Built and locally tested a replacement contract with permanent recipient-bound deposit addresses and one-time credit per Zcash output. Dedicated custody, cloud integration and a new minter migration remain.', href: '/docs/#/wrap', label: 'unique-address migration' },
  { d: 'Sep 07', t: 'Unique-address WrapDeskV2 deployed fully paused. Deployment bytecode and custody configuration checked; the dedicated deposit wallet is prepared locally. Public wrapping remains closed while cloud integration, off-device backup verification, the minter timelock and end-to-end tests are completed. Minter proposal tooling now guards the network, deployed code and existing proposals.', href: `${CONTRACTS.explorer}/tx/0x0ed9febfaa6e51341c4ed0fb1e139a8980761f721a7feaaab653938c3ffb141d`, label: 'paused deployment' },
  { d: 'Sep 07', t: 'Temporary wrapping path under development through the existing minter, avoiding a new role delay for that path. Prepared secure cloud custody upload, a reserve-only deposit signer and initial receipt checks; 8 signer tests and 61 operator tests pass. Public wrapping remains closed until integration and real end-to-end verification pass.', href: '/docs/#/wrap', label: 'temporary path status' },
  { d: 'Sep 07', t: 'Deposit custody staged in AWS with a restore-tested off-device encrypted backup. An isolated cloud wallet check passed; the reserve-only Linux signer passed 8 tests and is installed. No deposit worker is activated. Accounting, restart recovery, the user flow and a real deposit-to-mint test remain opening requirements.', href: '/docs/#/wrap', label: 'custody and launch status' },
  { d: 'Sep 07', t: 'V2 minter proposal confirmed, eligible September 9 at 20:16:37 UTC. Deployed a worker restricted to the owner’s test route, assigned its deposit address and verified idle/reserve checks. Added durable pre-broadcast records and consolidation accounting safeguards. Public wrapping stays closed pending the funded end-to-end test and release checks.', href: `${CONTRACTS.explorer}/tx/0x3d34544d26cb076eb7175725dee91067797ef9c046b1626fa51f424238ec8a4f`, label: 'upgrade proposal' },
  { d: 'Sep 07', t: 'A test transfer sent to the legacy reserve was held separately for reconciliation, without minting or crediting the unique-address route. Added clearer destination checks and recovery guidance. The funded unique-address test remains pending.', href: '/docs/#/wrap', label: 'deposit destination guidance' },
  { d: 'Sep 07', t: 'First funded unique-address wrapping test completed: 0.00207 ZEC credited as 0.00207 zZEC through the existing minter. Verified confirmed reserve consolidation, project-paid network fee, exact mint receipt, protected backing and a fresh worker run with no duplicate mint. Public wrapping stays closed while automation, the user flow and broader recovery checks are completed.', href: `${CONTRACTS.explorer}/tx/0xabfde9fbb8cb36c28750f784452b584daa4238cc6c8f0359f4e1ed44b172abf1`, label: 'verified test mint' },
  { d: 'Sep 07', t: 'Automatic dedicated-address worker deployed in AWS with off-device checkpoint recovery, fresh status reporting and alerts. Published the wallet request, deposit-address and receipt UI; verified stale-status and account-switch safeguards and mobile layout. Public requests remain gated by the final owner opening transaction. V2 credits stay paused.', href: '/docs/#/wrap', label: 'public wrapping flow and safeguards' },
  { d: 'Sep 07', t: 'Added a wallet-opening help popup with the selected ZEC amount, copyable deposit address and manual sending instructions. It explains what to do when a browser cannot open a Zcash wallet without falsely claiming to detect installed apps. Wallet changes or unavailable deposit status close the popup.', href: '/docs/#/wrap', label: 'wallet-opening help' },
  { d: 'Sep 07', t: 'Wrapping now shows a prominent payment-progress card, advances from sending to receiving, and announces status changes in-page. Confirmed mints display their receipt; pending deposits take priority over older completed tests. Recorded history stays visible during temporary status outages, while new sending instructions remain gated. Updated wrapping guidance.', href: '/docs/#/wrap', label: 'deposit progress' },
  { d: 'Sep 07', t: 'Wallet reconnection now shows an explicit loading state until address and deposit-history checks finish. Empty-history messages require fresh, matching account data; failed or incomplete checks show an automatic retry message and manual retry button instead of implying deposits are missing.', href: '/docs/#/wrap', label: 'reconnection loading states' },
  { d: 'Sep 07', t: 'Reduced routine keeper funding notifications: warning threshold is now below 0.2 ETH, while the separate 1 ETH-plus-gas refill preservation rule remains unchanged. The exact planned V2 minter proposal stays quiet until eligibility; unexpected changes, low gas, backing, payout and service failures still alert.', href: '/docs/#/market-and-keeper', label: 'funding notifications' },
  { d: 'next', t: 'Pons routes $ZEAL fees to the Tap, and loop one turns too.' },
  { d: 'Sep 07', t: 'Homepage simplified: liquidity moves earlier, wrapping and redemption share a tabbed desk, and calculators, diagrams and the full build archive expand on demand. The ecosystem overview includes zealz.fun and its planned zZEC markets and ZEAL fee benefits, clearly labeled in development. Header links and dropdowns now share consistent sizing, spacing and readable solid backgrounds. The footer lists both token contracts with separate copy and explorer controls in compact rows. Hero action buttons and the contract-address bar use opaque backgrounds for readability over the animation. Transaction behavior and payout limits are unchanged.', href: '/docs/#/overview', label: 'Using the homepage' },
  { d: 'Sep 07', t: 'Fixed automatic reserve reimbursement’s access to the public wrapping checkpoint while keeping credentials private. Added the reimbursement service to cloud health alerts; prior confirmed transfers remain credited, with existing backing protections and transfer limits unchanged.', href: '/docs/#/operations-runbook', label: 'reimbursement monitoring' },
  { d: 'Sep 07', t: 'Reduced alert flapping: routine cloud service failures now require five minutes of persistence, with five minutes of stable recovery before a recovery email. Funding and safety alerts remain immediate; transaction safeguards and six-hour reminders are unchanged.', href: '/docs/#/operations-runbook', label: 'alert timing' },
]

const FAQ = [
  { group: 'ZEAL & the ecosystem', q: `What is the difference between $${TOKEN.symbol}, ${TOKEN.wrapper} and ZEC?`,
    a: `ZEC is native Zcash. ${TOKEN.wrapper} is the reserve-backed token representing ZEC on Robinhood Chain. $${TOKEN.symbol} is the ecosystem’s community token. Buying $${TOKEN.symbol}, holding ${TOKEN.wrapper} and providing liquidity are different activities with different risks.`, href: '#participate', label: 'Compare ways to participate' },
  { group: 'ZEAL & the ecosystem', q: `Does holding $${TOKEN.symbol} earn fees or give me a claim on the reserve?`,
    a: `No. Holding $${TOKEN.symbol} does not give you a claim on the ZEC reserve, LP fees or guaranteed income. The Furnace uses fees it receives to buy back and burn $${TOKEN.symbol}; burns do not guarantee a higher market price. LP fees belong to liquidity positions.`, href: '#furnace', label: 'How the Furnace works' },
  { group: 'ZEAL & the ecosystem', q: 'Where do ZEAL trading fees go?',
    a: `The intended route for a $100 trade is: ${money(FEE_PER_100)} in Pons pool fees, with ${money(PONS_KEEP_PER_100)} retained by Pons and ${money(FOUNDRY_PER_100)} allocated to the Foundry. The Foundry splits that into ${money(SPLIT_PER_100[0])} for ZEC reserves, ${money(SPLIT_PER_100[1])} for liquidity and ${money(SPLIT_PER_100[2])} for operations, before conversion costs. Fee routing is awaiting Pons activation. Accrued or credited fees are not the same as funds already received by the reserve.`, href: '#ledger', label: 'Check the live fee route' },
  { group: 'ZEAL & the ecosystem', q: 'Is ZEAL officially affiliated with Robinhood or Zcash?',
    a: 'No. ZEAL is an independent project on Robinhood Chain. It is not affiliated with, endorsed by or sponsored by Robinhood Markets, the Electric Coin Company or the Zcash Foundation. Robinhood Chain refers to the blockchain, not a listing in the brokerage app.', href: '/docs/', label: 'Read the project documentation' },
  { group: 'zZEC & redemption', q: `What backs ${TOKEN.wrapper}, and who controls it?`,
    a: `Native ZEC is held at the published reserve address, and an attestor reports the reserve balance on chain. The operator controls the reserve signing keys. This makes ${TOKEN.wrapper} reserve-backed and publicly checkable, not trustless. Compare live reserves, the last attestation and outstanding supply in the ledger.`, href: '#ledger', label: 'Check reserve backing' },
  { group: 'zZEC & redemption', q: `Can I wrap my ZEC into ${TOKEN.wrapper}?`,
    a: 'Yes, the wrap desk is live. Connect your Robinhood Chain wallet, get your wallet’s own Zcash deposit address and send native ZEC there (0.001–1 ZEC per payment). The actual received amount determines your credit; no special trailing digits are required. The desk waits for confirmations and processing before minting. Never send a deposit based only on a preview or a roadmap entry.', href: '#wrap', label: 'Open the wrap desk' },
  { group: 'zZEC & redemption', q: `How do I redeem ${TOKEN.wrapper} for native ZEC?`,
    a: `Use the redemption desk with a supported Zcash address. Your ${TOKEN.wrapper} is escrowed, the operator sends native ZEC, and the payout is recorded before the escrow is burned. Processing is subject to the desk’s current per-request and daily limits, available payout funds and network conditions. If a request remains unpaid, the contract’s reclaim path becomes available after its waiting period.`, href: '#redeem', label: 'Check redemption limits and requests' },
  { group: 'zZEC & redemption', q: `Why can ${TOKEN.wrapper} trade above or below ZEC?`,
    a: 'Backing and market price are different. Trades move the pool price, especially when liquidity is shallow. The keeper trades toward the reference ZEC price, but has finite inventory and operating limits. Wrapping and redemption also take time. A 1:1 backing target is not a promise of an exact market price or an instant payout.', href: '#market', label: 'View the market' },
  { group: 'zZEC & redemption', q: `Are ${TOKEN.wrapper} transactions private?`,
    a: `${TOKEN.wrapper} is a transparent token on Robinhood Chain: EVM transfers are publicly visible. It does not make your wallet activity shielded. Native Zcash has separate shielding capabilities; check which address types the redemption desk currently supports.`, href: '/docs/#/security-and-trust', label: 'Read the privacy and custody limits' },
  { group: 'Providing liquidity', q: `What do I need to provide liquidity?`,
    a: `You need ${TOKEN.wrapper} and ETH on Robinhood Chain, plus ETH for gas. The preview shows the matching ${TOKEN.wrapper} amount in addition to your ETH contribution. Buying $${TOKEN.symbol} does not create a liquidity position. First-time deposits may require two approvals and the deposit transaction.`, href: '#liquidity', label: 'Preview your deposit' },
  { group: 'Providing liquidity', q: 'How much do liquidity providers earn?',
    a: `The pool’s ${ZZEC_MARKET.lpFeePct}% LP trading fee is shared among active liquidity providers. Earnings depend on volume, your active share and how long you provide liquidity. This is a fee on trades, not a daily yield or guaranteed return. The separate ${ZZEC_MARKET.hookFeePct}% hook charge funds the Furnace; it is not another LP reward.`, href: '#liquidity', label: 'See fees and deposit details' },
  { group: 'Providing liquidity', q: 'Can I withdraw, and will I get the same assets back?',
    a: 'The standard liquidity desk creates a position held in your wallet. You can remove its current assets through Uniswap, subject to network execution. The quantities and dollar value can differ from your original deposit as prices change. Fees may not offset losses, and contract and reserve custody risks also apply.', href: 'https://app.uniswap.org/positions', label: 'Manage positions on Uniswap' },
  { group: 'Providing liquidity', q: 'Are extra rewards or automatic compounding available?',
    a: 'No public bonus-reward or automatic-compounding program is being offered here today. Trading fees are the current provider incentive. Team-managed position automation does not automatically apply to your wallet. Any additional program must publish its funding, eligibility and terms before it starts.', href: '#phases', label: 'See liquidity development plans' },
  { group: 'zealz.fun & what’s next', q: 'What is zealz.fun, and is it live?',
    a: `zealz.fun is the launchpad being developed for the ecosystem, with token markets paired against ${TOKEN.wrapper} and a fee design that supports $${TOKEN.symbol} buybacks and burns. The interface and contracts are built and lifecycle-tested on a chain fork. That is not the same as a public mainnet launch; deployment and readiness work remain.`, href: '/docs/#/launchpad', label: 'Read the launchpad status and design' },
  { group: 'zealz.fun & what’s next', q: 'Will the launchpad spend the ZEC backing zZEC?',
    a: `ZEC needed to back outstanding ${TOKEN.wrapper} is not available project funding. Launchpad development, incentives and operations need separately available funds. Growth in total reserves alone does not mean there is more spendable capital: outstanding ${TOKEN.wrapper} liabilities must be accounted for.`, href: '#ledger', label: 'Compare reserves and supply' },
  { group: 'zealz.fun & what’s next', q: 'Where can I verify progress and launch dates?',
    a: 'The roadmap separates live features, work in progress and plans. Multiple workstreams can advance together. Use the dated build log, linked source and documentation to check evidence. Planned features and dates can change; contract tests and a preview interface are not proof that a service is publicly active.', href: '#phases', label: 'Read the roadmap and build log' },
]

function Faq() {
  const [open, setOpen] = useState<string | null>(null)
  const [all, setAll] = useState(false)
  const [category, setCategory] = useState('All questions')
  const categories = ['All questions', ...new Set(FAQ.map((f) => f.group))]
  return (
    <div className="faq-content">
      <div className="faq-filters" role="group" aria-label="Filter questions by topic">
        {categories.map((name) => <button type="button" key={name} aria-pressed={category === name} onClick={() => { setCategory(name); setOpen(null) }}>{name}</button>)}
      </div>
      <ul className="faq">
        {FAQ.map((f, i) => (all || category !== 'All questions' || i < 6) && (category === 'All questions' || category === f.group) && (
          <li key={f.q} data-open={open === f.q}>
            <button type="button" id={`faq-question-${i}`} onClick={() => setOpen(open === f.q ? null : f.q)} aria-expanded={open === f.q} aria-controls={`faq-answer-${i}`}>
              <span>{f.q}</span><i aria-hidden="true" />
            </button>
            <div className="faq-answer" id={`faq-answer-${i}`} aria-labelledby={`faq-question-${i}`} hidden={open !== f.q}>
              <p>{f.a}</p>
              <a href={f.href} {...(f.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}>{f.label} →</a>
            </div>
          </li>
        ))}
      </ul>
      {category === 'All questions' && <button className="btn btn-ghost" onClick={() => setAll(!all)}>{all ? 'Show fewer questions' : 'See all questions'}</button>}
    </div>
  )
}

export function Close() {
  const [openDay, setOpenDay] = useState<string | null>('')
  return (
    <>
      {/* ---------------- roadmap ---------------- */}
      <section className="band band-tint" id="phases">
        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              Roadmap
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              Built so far.
              <br />
              What comes next.
            </h2>
          </div>
          <p className="roadmap-intro">A roadmap for the whole ZEAL ecosystem. These workstreams can progress together; planned features are not live services or promised launch dates.</p>
          <div className="phases">
            {PHASES.map((p, i) => (
              <article className="phase" key={p.p} data-reveal="left" style={stagger(i, 90)}>
                <div className="phase-rail">
                  <span className="phase-dot" />
                </div>
                <div className="phase-body">
                  <div className="phase-head">
                    <span className="mono">{p.p}</span>
                    <span className={`tag ${p.s === 'live' ? 'tag-live' : 'tag-wait'}`}>
                      <span className="dot" />
                      {p.s}
                    </span>
                  </div>
                  <h3 className="h3">{p.t}</h3>
                  <p>{p.d}</p>
                  <a className="roadmap-link" href={p.href} {...(p.href.startsWith('https:') ? { target: '_blank', rel: 'noreferrer' } : {})}>{p.label} →</a>
                </div>
              </article>
            ))}
          </div>

          <div className="log" data-reveal>
            <div className="log-head">
              <p className="eyebrow">Build log</p>
              <p className="log-note mono">{LOG.filter((l) => l.d !== 'next').length} entries · dated · linked · nothing here is a promise</p>
            </div>
            <div className="latest-updates">{LOG.filter(l => l.d !== 'next').slice(-3).reverse().map((l, i) => <article key={i}><span className="mono">{l.d}</span><p>{l.t}</p>{l.href && <a href={l.href}>{l.label} →</a>}</article>)}</div>
            <details className="home-more"><summary>Full build archive · every update</summary>
            {(() => {
              const days: { d: string; rows: typeof LOG }[] = []
              for (const l of LOG) {
                const last = days[days.length - 1]
                if (last && last.d === l.d) last.rows.push(l)
                else days.push({ d: l.d, rows: [l] })
              }
              const dated = days.filter((g) => g.d !== 'next').reverse() // newest first
              const next = days.find((g) => g.d === 'next')
              return (
                <>
                  {dated.map((g, gi) => {
                    const open = openDay === null ? gi === 0 : openDay === g.d
                    return (
                      <div className={`log-day ${open ? 'is-open' : ''}`} key={g.d}>
                        <button className="log-day-head" onClick={() => setOpenDay(open ? '' : g.d)} aria-expanded={open}>
                          <span className="log-date mono">{g.d}</span>
                          <span className="log-day-title">{DAYS[g.d] ?? `${g.rows.length} entries`}</span>
                          <span className="log-day-n mono">{g.rows.length}</span>
                          <span className="log-day-caret" aria-hidden>&#8964;</span>
                        </button>
                        <div className="log-day-body"><div className="log-day-inner">
                          {[...g.rows].reverse().map((l, i) => (
                            <div className="log-row" key={i}>
                              <span className="log-bullet" aria-hidden />
                              <span className="log-text">{l.t}</span>
                              {l.href ? (
                                <a className="log-link mono" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
                              ) : (
                                <span />
                              )}
                            </div>
                          ))}
                        </div></div>
                      </div>
                    )
                  })}
                  {next && next.rows.map((l, i) => (
                    <div className="log-row log-next" key={`n${i}`}>
                      <span className="log-date mono">next</span>
                      <span className="log-text">{l.t}</span>
                      <span />
                    </div>
                  ))}
                </>
              )
            })()}</details>
          </div>
        </div>
      </section>

      {/* ---------------- faq ---------------- */}
      <section className="band" id="faq">
        <div className="wrap split faq-split">
          <div>
            <p className="eyebrow" data-reveal>
              Questions
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              Ask the
              <br />
              hard ones.
            </h2>
            <p className="faq-intro">Clear answers about the tokens, your funds, trading fees and what we’re building next.</p>
          </div>
          <Faq />
        </div>
      </section>

      {/* ---------------- cta ---------------- */}
      <section className="band band-ink band-cta">
        <div className="wrap-narrow cta-in">
          <img className="cta-mark" src="/img/zeal-mark.png" alt="" width={96} height={96} />
          <h2 className="display" data-reveal>
            Put Zcash
            <br />
            on the chain.
          </h2>
          <p className="lede" data-reveal style={stagger(1)}>
            Join the ZEAL community. Explore zZEC, provide liquidity, and follow the ecosystem as it grows.
          </p>
          <div className="hero-btns" data-reveal style={stagger(2)}>
            <a className="btn btn-primary" href={LINKS.pons} target="_blank" rel="noreferrer">
              Buy ${TOKEN.symbol} on Pons
            </a>
            <a className="btn btn-ghost" href={LINKS.x} target="_blank" rel="noreferrer">
              Follow @ZealTheMascot
            </a>
            <a className="btn btn-ghost" href={LINKS.telegram} target="_blank" rel="noreferrer">
              Join the Telegram
            </a>
          </div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="foot">
        <div className="wrap">
          <div className="foot-top">
            <a className="brand" href="#top">
              <img src="/img/zeal-mark.png" alt="" width={38} height={38} />
              <span>ZEAL</span>
            </a>
            <nav className="foot-links">
              <a href="#foundry">The Foundry</a>
              <a href="#furnace">The Furnace</a>
              <a href="#proof">Proof</a>
              <a href="#phases">Roadmap</a>
              <a href={LINKS.zealz} target="_blank" rel="noreferrer">zealz.fun</a>
              <a href="#lore">Lore</a>
              <a href={LINKS.x} target="_blank" rel="noreferrer">X</a>
              <a href={LINKS.telegram} target="_blank" rel="noreferrer">Telegram</a>
              <a href={PONS.docsUrl} target="_blank" rel="noreferrer">Pons docs</a>
              <a href={LINKS.zcash} target="_blank" rel="noreferrer">Zcash</a>
            </nav>
          </div>
          <hr className="rule" />
          <div className="foot-meta">
            <p className="mono">
              {CHAIN.name} · chain id {CHAIN.id}
            </p>
            <div className="footer-contracts" aria-label="Token contracts on Robinhood Chain"><ContractAddress compact /><ContractAddress compact wrapper /></div>
            <p className="foot-legal">
              ${TOKEN.symbol} is a community token with no intrinsic value and no expectation of
              financial return. Nothing here is investment advice, an offer, or a solicitation.
              {' '}{TOKEN.wrapper} is reserve-backed and carries custody and smart-contract risk.
              Zeal is not affiliated with, endorsed by, or sponsored by Robinhood Markets, Inc.,
              the Electric Coin Company, or the Zcash Foundation. Do your own research and never
              risk what you cannot lose.
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}
