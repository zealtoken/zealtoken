---
title: The zZEC wrapper
group: The machine
---
# The zZEC wrapper

> **In one breath.** zZEC is an ERC-20 with 8 decimals, so one unit is one zatoshi and one zZEC is one ZEC. It can only be minted up to the last attested balance of the reserve, and only while that attestation is fresh. Anyone can burn it and ask for native ZEC, and nobody can pause that. Minting can be paused instantly by the owner; changing who attests or mints takes 48 hours in public.

## The guarantees, in code

- `totalSupply()` can never exceed `reserveZats`, the last attested balance. `mint()` reverts otherwise.
- `mint()` also reverts if the attestation is older than `maxAttestationAge`, currently 36 hours. The attest job runs every 6 hours, so a dead scheduler stops minting long before it could matter.
- The reserve address is set at deployment and has no setter.
- `requestRedeem(amount, zcashAddress)` burns and emits `RedemptionRequested`. It has no pause, no role check, and no minimum.
- The attestor and the minter are separate roles, each behind a 48-hour propose-and-commit timelock.

## What the contract cannot guarantee

That the attested number matches the real Zcash balance, and that a redemption is paid. Both legs cross to a chain the EVM cannot read. The first is checkable by anyone against the transparent reserve address; the site reads it live next to the attested figure. The second is why the [Redemption Desk](#/redeem) exists: it inverts the order so the holder is never left with nothing.

## Attestations and coverage

{{viz:coverage}}

`attest(reserveZats, proofRef)` records the balance and the block hash it was read at. It is allowed to report a reserve **below** supply, because blocking honest bad news would be worse than publishing it. In that case the contract emits `CoverageBreach` and `coverageBps()` reads under 10,000. The ledger shows coverage on every poll.

## Why 8 decimals

Zcash is denominated in zatoshi (10^-8 ZEC). Matching it makes the peg a literal integer relationship: no scaling, no rounding, one unit in equals one unit out.

## Roles today

| Role | Holder | Notes |
|---|---|---|
| Owner | deployer `0x1C08…bF03` | Ownable2Step; can pause minting instantly |
| Attestor | `0xD395…67Db` | Attest job, every 6 hours |
| Minter | `0xc678…F513` today | Rotation to the WrapDesk proposed; commits 2026-09-07 19:16 UTC |
| Max attestation age | 36 hours | Owner-settable between 1 hour and 7 days |

## The two ways out

1. **Through the desk (recommended).** Escrow zZEC with a t-address, get paid, the desk burns it only after recording the Zcash transaction, or reclaim after 7 days. See [Redeem](#/redeem).
2. **Directly on the contract.** Call `requestRedeem` yourself. It burns first and trusts the operator to pay. The operator watches for these and pays them, but there is no escrow and no reclaim. Use the desk.

## Check it yourself

`reserveZats()`, `totalSupply()`, `coverageBps()`, `lastAttestationAt()`, `attestationIsFresh()`, `minter()`, `attestor()`, `pendingMinter()`, `pendingAttestor()`, `mintingPaused()` are all public views on `0x0b151Ff7a7c5250130EC16C275790961d558E402`. The [Verify it yourself](#/verify-yourself) page shows the raw calls.
