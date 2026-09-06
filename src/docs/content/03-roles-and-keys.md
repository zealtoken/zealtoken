---
title: Roles and keys
group: Start here
---
# Roles and keys

> **In one breath.** Six keys run the machine and each one can do only its job. The attestor reports the Zcash balance. The minter issues zZEC up to that balance. The keeper trades the pool back to the ZEC price. The fulfiller records redemption payouts. The deployer owns the contracts and can pause minting instantly, but any change of who holds a role takes 48 hours in public. No key can withdraw from the Foundry, the Furnace, or either desk.

## The keys

| Role | Address | Can | Cannot |
|---|---|---|---|
| Deployer / owner | `0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03` | Own ZZEC, Furnace, both desks; pause minting or ignition instantly; propose role and pool changes; act as Furnace igniter; act as Tap steward | Withdraw from any contract; skip a timelock; change the reserve address (there is no setter) |
| Attestor | `0xD395C10CF6328dC703d69dFFE7BB7c34D13E67Db` | Post the reserve balance to ZZEC | Mint, burn, or move anything |
| Minter | `0xc678772403C67045fa0B2d882f04e24214f1F513` | Mint zZEC up to the attested reserve; operate the WrapDesk (fulfil wraps) | Mint above the attested reserve or against a stale attestation; touch the reserve |
| Keeper | `0x19cece80126b79F76D8b8297B876310a56349738` | Trade its own zZEC and ETH inventory on the pool | Anything with any contract role |
| Fulfiller | `0xb652b03500440dF569a231F82f87E735930a5dE6` | Record a redemption payout, which burns the escrow | Move escrowed zZEC anywhere except into the burn |
| Reserve key | Zcash `t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw` | Spend the reserve ZEC | Nothing on Robinhood Chain; it is a Zcash key held in the operator's wallet |

The deployer is the single most powerful key and the [Security and trust](#/security-and-trust) page treats it as the primary residual risk.

## Why attestor and minter are separate

A wrapper fails when one party can both **say** the reserve is big and **mint** against that claim. Splitting the two means a compromised attestor can lie, but cannot issue supply, and a compromised minter can issue supply, but only up to what an honest attestor reported. Both would have to fall together, and even then the reserve address is public, so the lie is visible to anyone watching the Zcash explorer.

## The 48-hour rule

Every role change on ZZEC (attestor, minter), the Furnace (igniter, pools), and the Tap (recipient migration) is a two-step: propose, then commit no sooner than 48 hours later. Proposals emit events and the [watchdog](#/operations-runbook) alerts on every pending one. The Furnace additionally expires a proposal that is not committed within 7 days of becoming executable.

The emergency brakes are deliberately **not** delayed: `setMintingPaused` on ZZEC and `setIgnitePaused` on the Furnace are instant, because the right response to a compromised key is "stop now, rotate over two days", not "wait two days while it is abused". Redemption is never pausable by anyone.

## Where the keys live

Each Robinhood Chain role key is a scrypt-encrypted JSON keystore in the operator's `ops/.keys/` directory, unlocked by a passphrase that comes from the macOS keychain for scheduled jobs or from an interactive prompt for manual ones. Raw private keys in environment variables are refused unless explicitly forced. The Zcash reserve key lives in a Zcash mobile wallet, not on the machine that runs the jobs.

## Gas

Each role wallet holds a little ETH for gas, around 0.01 ETH. The watchdog alerts when any drops below 0.004 ETH.
