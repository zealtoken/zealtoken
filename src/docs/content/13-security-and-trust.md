---
title: Security and trust
group: Running it
---
# Security and trust

> **In one breath.** The code guarantees the fee split, the supply cap, the exit, and the timelocks. A human guarantees that the Zcash balance is real and that payouts happen, and that human's work is checkable by anyone against a public address. The biggest risk is the owner key: it can pause, propose, and ignite, and its compromise would give an attacker 48 hours of visible runway. Nothing in the system lets any key withdraw funds from a contract.

## Guaranteed by code

- The Foundry's 60/25/15 split and its three sinks. No owner exists.
- The Tap's single exit. Every wei it claims goes to the Foundry in the same transaction.
- zZEC supply never exceeds the attested reserve, and never mints against a stale attestation.
- Redemption cannot be paused, gated, or rate-limited, on the wrapper or the desk. Reclaim on the desk is the holder's after 7 days, unconditionally.
- The Furnace's one door: $ZEAL to the dead address. Liquidity it holds can never be decreased.
- The hook's share and destination are immutable.
- Every role change waits 48 hours in public and emits an event first.

## Guaranteed by a person, checkable by anyone

- That `reserveZats` matches the balance at `t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw`. The site reads both.
- That redemptions get paid. The desk records each payout's Zcash txid on chain; the reclaim path covers the case where it does not.
- That wrap deposits get matched and minted. The desk records each mint's reason.

## Threats and what stands in the way

| Threat | Mitigation | Residual |
|---|---|---|
| Owner (deployer) key compromised | 48h timelock on every role change; watchdog alerts within 5 minutes; instant pause; redemption stays open so holders can leave | Attacker can pause minting and ignition, propose changes, and ignite within the Furnace's floor. Cannot withdraw anything. Key separation (cold owner, hot igniter) is the planned hardening |
| Attestor key compromised | Cannot mint; lies are visible against the public address; owner can pause and rotate | 48h of a false number on chain |
| Minter key compromised | Bounded by the honest attestation; owner can pause instantly | Mints up to headroom to an attacker address |
| Reserve (Zcash) key compromised | Nothing on chain; publicly visible | Total loss of reserve. This is the custody risk v1 accepts and Phase 04 removes |
| lightwalletd lies or breaks | Attest refuses sharp drops below supply; mints stop after 36h; three hosts | A wrong high reading for one cycle |
| Desk operator pays late | Fulfil tool refuses inside the last 12h; watchdog shows pay-by | Operator error against the tool's advice |
| Wrap request spam | Free to open; 99,999 lifetime tags | New wrap requests blocked until a v2 desk rotates in (48h). No funds at risk |
| Coverage drift from Zcash fees | Public coverage figure | Reserve slips a few zatoshi per payout unless topped up |
| Thin-pool manipulation | Furnace impact bound per leg; keeper caps and fair-value floors | Bad fills within the bounds |

## Review history

The Furnace was reviewed before deployment and eight findings were fixed (NFT griefing, uninitialised pools, square-root vs price basis points, owner-only position adoption, an instant pause, owner-set hook data, pool rotation, proposal expiry). The Tap's permissionless `sweep(0,0)` was shown not exploitable because the escrow only ever pays the Tap and the Tap only ever pays the Foundry. Both desks shipped with unit tests covering every state transition; 102 tests run on every push.

## What we will not claim

Not "audited" by a third party. Not "trustless". Not "insured". Not "risk-free". The site's Straight Answers section carries the same line.

## Responsible disclosure

Found something? Message the project on X or Telegram (links in the site footer) with the details. We publish what we learn on the [Incidents](#/incidents) page.
