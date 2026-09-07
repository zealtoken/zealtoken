# Redemption and daily burn migration — 2026-09-07

The core worker is `i-00c95b5a0ed0a8ec4` in us-east-2. The remaining migration uses the same worker and alert topic. No reserve seed or owner private key is uploaded.

## Dedicated burner

The Furnace is `0x72C2f71dC3c0058974fd59039F9A79397bf87E70`. The new igniter is `0x0fe2b211102132E9BA047ed5d348A2F964785DEc`, funded to 0.01 ETH for gas. Proposal transaction: `0xed69fa2494f3942714a6370b37513eb2277ad2578e02b81f580264504f8b2bfd`. Funding transaction: `0xc2c9c1b5ad826bfe0949e67663dd7d47e195a1422b6fd6e539c29eff560e7730`.

The contract's 48-hour timelock permits commitment starting **2026-09-09 07:04:43 UTC / 02:04:43 America/Cancun**. Proposal expires seven days later. The owner must commit locally; the cloud has only the dedicated operational burner key.

After that time, run on the Mac:

```sh
cd ~/zeal-ops
npm run cloud:finish-burn
```

The command checks the contract and staged cloud service, commits with the local owner key, fences/disables the Mac burn job, enables and verifies the cloud burner, removes the laptop heartbeat alarm through a narrowly checked CloudFormation change set, and retires the Mac monitor. Retry is supported if a later handoff stage fails. It refuses before the timelock expires. The cloud monitor emails when this action becomes eligible.

Until that command succeeds, the laptop must still run the existing daily burn job. The cloud burn schedule is daily at 19:00 UTC (14:00 Cancún), with Persistent=true for missed runs. It ignites Furnace funds; owner LP collection remains disabled. Undeployed launchpad compound/dividend scripts are currently no-ops and are not deployed by this migration.

## Payout wallet

Payouts use the existing fulfiller `0xb652b03500440dF569a231F82f87E735930a5dE6` and the separate Zcash hot float. Automatic caps stay 0.05 ZEC/request and 0.25 ZEC/rolling day. Jobs run 300 seconds after the previous run completes. A wallet lock serializes payout, balance checks and backups. PENDING ledger entries halt automatic payouts for reconciliation; they are never retried blindly. EVM fulfill transactions now use the persisted nonce/hash manager.

Linux Zingo is built from exactly the Mac Cargo-installed commit `3a0f5a7e5cf917389d184ff4c9d76d906b31dd2e`, Rust 1.98.1, locked dependencies, `--no-default-features --features clearnet-test-mode`. The CLI version flag misleadingly says 0.1.1; the Cargo package is 0.4.0. Network calls explicitly select the existing lightwallet server. Wallet identity, spendability and ledger fingerprints must pass before activation.

Cloud files: `/var/lib/zeal/runtime/.float/zingo-wallet.dat` and `/var/lib/zeal/runtime/launchd/desk-ledger.json`. The native reserve wallet is unchanged. Services are `zeal-desk-pay`, `zeal-float-health`; both require `/etc/zeal/PAYOUT_ACTIVE`. The burner separately requires `/etc/zeal/BURN_ACTIVE`.

Encrypted EBS protects the active wallet. Backups encrypt a consistent wallet/ledger archive with AES-256-GCM before S3 upload, under `backups/*-wallet.enc`. Its separate 256-bit key is held in Secrets Manager (`FloatWalletSecret`) and loaded root-only into `/run/zeal/float-backup`. No plaintext wallet enters SSM command text or S3. Ledger-only backups remain separate. The encrypted backup and its key are both necessary for recovery.

For recovery, stop both payer instances, remove PAYOUT_ACTIVE, download the latest authenticated wallet backup with an administrator, inspect existing state, and use `cloud/float-archive.py restore <ciphertext>` only when no wallet exists. It refuses overwrite. Reconcile Zcash transactions, OPEN desk requests, PENDING entries and EVM nonce records before enabling any payer. Never run restored old wallet state simultaneously with the surviving worker. A lost host does not automatically restore an old wallet.

Verification status and live cutover evidence are appended after the handoff. No artificial redemption will be sent solely to test migration.

## Worker capacity

CPU credits reached zero during the Linux build. CloudFormation now sets the existing t3a.small worker to Unlimited credits, without replacement or restart. Sustained above-baseline CPU usage can incur surplus-credit charges. A 2 GiB swap file on encrypted EBS is configured in fstab; it remains available for wallet proving. The temporary build runs as an unprivileged account with one CPU, 950 MiB resident memory and 2 GiB swap limits, and cannot access the instance metadata endpoint.

## Verified payout cutover — 2026-09-07 07:32 UTC

Redemption payouts are now active on AWS. The Mac fulfiller is disabled and fenced, with matching confirmed/pending EVM nonce 1 at handoff. Its standalone `npm run desk:pay` was tested and correctly refused local signing. The remaining Mac email monitor checks only daily burns.

Both cloud wallet addresses match the Mac. The float top-up address is `t1cS6wHSvxJat1zuayeFYSU8QmzQYutvuUK`. It has 0.09662 ZEC confirmed shielded funds; Zingo's fee-aware sendability check reported 0.09647 ZEC. An additional 0.002 ZEC is transparent and will be shielded by the payer when needed. The first cloud payer run at 07:32:31 UTC found no unpaid requests (one already fulfilled entry), and completed successfully. No artificial payout was submitted; live Zcash broadcast from this host awaits the next eligible real request.

Initial wallet and payout-ledger SHA-256 fingerprints matched byte-for-byte before the cloud sync. The downloaded cloud backup `backups/20260907T073236Z-wallet.enc` authenticated successfully and contained the 221626-byte wallet, connectivity consent and the exact current payout ledger. Payout, balance-check and backup timers are enabled; the keeper, replenisher, payer and health service report successful runs. The native reserve wallet was not migrated or spent.

Linux binary SHA-256: `2b88497e4a37ba9ec6986b63c8b1d17de9f5a51e21ade65626875c7fd2ba4c45`. Reusable artifact: `s3://zeal-operator-artifacts-z0jy5fu8vvsh/releases/zingo-cli-3a0f5a7-linux-x64`. Install only after verifying that hash. Temporary compiler workspace/account were removed after successful installation and wallet verification.

All 23 TypeScript tests pass. Cloud TypeScript checks, systemd unit verification, environment-override checks, both operational signer/role checks, and four Python email/encryption tests pass. A complete host reboot was not performed during live operations; boot dependencies, credential loading and wallet-lock recreation are configured and verified individually.

The only remaining routine laptop dependency is daily burns, until `npm run cloud:finish-burn` succeeds after September 9 07:04:43 UTC. Owner-only administration remains local by design.
