# ZEAL AWS operator

Current status: core cloud services are live. See [LIVE.md](LIVE.md) for handoff evidence and remaining laptop dependencies. Wallet-owned LP fee reinvestment is documented in [LP-REINVEST.md](LP-REINVEST.md). The follow-on burn/payout work is documented in [FINAL-MIGRATION.md](FINAL-MIGRATION.md).

Stack `zeal-operator`, region `us-east-2`, in the existing OENBOT VPC. The OENBOT trading host remains stopped. Infrastructure is defined in `stack.json`; the dedicated host has no ingress, requires IMDSv2, and has encrypted persistent storage. Its IAM role only reads the scoped ZEAL operational and float-backup secrets, downloads releases, writes backups, and publishes ZEAL metrics in addition to SSM management access. It has no OENBOT signing or secret permissions.

## Staging and activation

Staging installs code and disabled systemd timers. It does not stop the Mac, copy owner keys, or activate trading. Run `npm run cloud:unlock` from the Mac's `~/zeal-ops` to validate the keeper, attestor and minter and upload their encrypted keystores and passphrases directly to the dedicated Secrets Manager secrets. Secret values are sent directly over HTTPS using the AWS JavaScript SDK; they are not placed in subprocess arguments, stdin, or temporary files. This command does not activate the worker. The cloud necessarily gains the ability to sign with these three keys; software budgets do not reduce their on-chain authority.

Before activation, verify the cloud release and public configuration, read-only market access, Zcash endpoints, and service configuration. Stop/unload the Mac's keeper, attest, role watcher and desk watcher; stop the background refill only at an idle boundary with no active conversions. Reconcile pending transactions and all non-complete refill/sweep entries. Copy the final runtime ledgers, never stale source-checkout state. Map the Mac sweeps.json to cloud launchd/sweeps.json, the SWEEP_LEDGER path. Verify hashes of the copied ledgers. Do not migrate PID locks or price caches. Then create `/etc/zeal/ACTIVE`, start `zeal-secrets`, and enable the attest, replenish, roles and desk-watch timers plus zeal-keeper.service (the keeper timer stays disabled). Check actual service results and transaction states, not just timer activation. Enable external stale-heartbeat alarms after activation.

A root boot service retrieves operational secrets into `/run/zeal`, with mode 0600. systemd LoadCredential supplies only required passphrases to each job. Encrypted keystores are stored separately; owner/deployer and Zcash reserve keys are not included. There is no automatic signing-key rotation: changing on-chain roles requires a separate coordinated operation. KMS encryption-key rotation is enabled.

## Remaining services

A dedicated burner key is now proposed on the Furnace. The default burn path does not require LP ownership; it requires the igniter role. The owner-only commit becomes available after the 48-hour delay. The Zcash payer is now active on AWS after verified wallet, ledger and backup handoff. See FINAL-MIGRATION.md for the latest cutover evidence and the final command. The owner/deployer and native reserve keys remain outside the cloud worker.

## Recovery

To stop cloud signing: disable and stop all ZEAL timers, let an active conversion settle if possible, stop ZEAL signing services, and remove `/etc/zeal/ACTIVE`. Never restart Mac signing while cloud signing might still run. For a failed cloud job, inspect transaction hashes and persistent ledgers before retrying. If the cloud is unreachable, stop the EC2 instance and confirm stopped before any failover. Restore ledgers from the latest snapshot and reconcile on-chain events before allowing new transfers. An ambiguous ledger must block automation.

The encrypted root volume is retained on termination; the artifact bucket is private and versioned. Retaining a volume is not a backup. Backup and heartbeat scripts and disabled timers are installed. Activation must enable and verify backups and configure the external stale-heartbeat alarm. Initial staging is not a completed migration.

## Persistent keeper (September 7, 2026)

The keeper now retains its unlocked signing wallet in process memory and waits two seconds between completed passes. It never overlaps ticks or bypasses managed transaction reconciliation. Price feeds retain their existing 20-second cache; pool reads use a fresh block on each pass. The 1% live trigger, 0.2% target, 0.1 ETH cap and output floors are unchanged. Detection is faster, but this does not guarantee a two-second fill or exact parity.

Install the core units followed by `python3 cloud/install-keeper-daemon.py`. Disable `zeal-keeper.timer`, let any active one-shot finish, then enable/start `zeal-keeper.service`. The service restarts on failure and drains an active tick on SIGTERM (systemd's 120-second stop limit remains a fallback; reconcile any unresolved transaction after a forced stop). The monitor checks service state and a heartbeat written only after a successful price/pool/inventory pass. Missing or stale heartbeats after 120 seconds trigger the existing alert path. Stop the service as well as timers before failover. Removing ACTIVE prevents subsequent signing passes; it cannot cancel a transaction already submitted.

Verified deployment: release SHA-256 `5ad48475367c47c744fc415c38442ef21907d1c6fe932207cb23b66010dca36b`; first successful daemon checks September 7 at 07:44 UTC. Observed median interval 2.111 seconds across the initial eight checks (maximum 6.637 seconds, so not a guaranteed two-second cadence). Service enabled/running with zero restarts; timer disabled; live health job exited successfully. Typecheck, seven trade-math tests, three loop tests, and fresh/stale/stopped heartbeat checks passed. No synthetic financial trade was submitted for testing.

First natural market correction verified in daemon logs: 07:44:17.577 UTC detected -1.91%; bought with 0.003512030239827803 ETH, transaction `0x6f0c80443f9846220cd2313532ba137d13ed252948e31dee41a8bd6761c10800`; next check 07:44:24.214 UTC showed -0.20%. Thus observed correction within 6.637 seconds of detection (including post-trade delay), not an SLA. Live health reported healthy.
