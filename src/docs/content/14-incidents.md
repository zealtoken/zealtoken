---
title: Incidents and lessons
group: Running it
---
# Incidents and lessons

> **In one breath.** Three things have gone wrong so far and all three are public. The first creator-fee recipient could not claim its fees and that credit is stranded for good. A thin pool let one buyer push zZEC to three times the ZEC price for a while, which is why the keeper exists. And a stale build artifact made a source verification fail until we compared bytecode lengths. Each one changed the design or the process.

## 1. Stranded creator fees on Pons (Sep 3, ongoing)

**What happened.** $ZEAL launched with the Foundry set as the Pons creator-fee recipient. Pons's escrow pays only `msg.sender` on `claim()`, and the Foundry has no `claim()`. Every fee credited under the Foundry's address is unclaimable by anyone. Pons's factory only lets the current recipient change the recipient, and the current recipient is a contract that cannot call it.

**Impact.** All creator fees since launch, growing with volume, are stranded. The ledger shows them as "fees generated", separately from "claimable fees", so the figure is honest.

**Response.** ZealTapV2 was deployed as the correct recipient: it can claim, sweep its own pool, and migrate itself through a 48-hour timelock. A takeover request naming the Tap was filed with Pons. Until Pons acts, no fee reaches the Foundry.

**Lesson.** A recipient must be able to act as `msg.sender`. Every later contract that receives value has an explicit claim path, and the site never says "live" for a flow whose last hop is not confirmed on chain.

## 2. The 3x premium (Sep 5)

**What happened.** With about 0.1 ETH of depth, a single buyer pushed zZEC to roughly three times the ZEC price. The premium later self-resolved, but for hours zZEC was not a peg.

**Response.** The peg keeper was built the same day: a dedicated inventory wallet that trades the pool back toward fair value every minute, capped per run, never selling below fair or buying above it. Its first trade closed a 5.7% gap to 0.6%. Liquidity was also deepened and migrated to the hooked pool.

**Lesson.** A wrapper without depth or a market maker is not pegged, whatever the reserve says. Depth and incentives for it are now a first-class goal.

## 3. Verification against the wrong build (Sep 5)

**What happened.** Source verification for the Redemption Desk was accepted by Blockscout and silently failed. The build directory held two compile outputs for the contract and the submission used the stale one, from before the thin-client views were added.

**Response.** Verification now picks the build whose creation bytecode length matches the on-chain deployment, and Sourcify is used alongside Blockscout because it reports mismatches explicitly.

**Lesson.** Compare bytecode before trusting a "started" response.

## Smaller things fixed along the way

- Uniswap quantities encoded with a leading-zero hex form produced opaque "missing revert data" errors; quantities now use canonical encoding.
- A pool seeding done as two transactions left a price window between them; it is now one atomic multicall with maxima derived from liquidity.
- A scheduled attestation failed during a 40x gas spike because the attestor had too little ETH; the watchdog now alerts on low role balances.
- The keeper sent 55 failure notifications in one day because a price API timed out; price fetches now retry across two sources and an outage is a quiet skip.
- The site claimed "multisig", "compound", and "independent review" in early copy. All removed. The Straight Answers section states exactly what is and is not guaranteed.
