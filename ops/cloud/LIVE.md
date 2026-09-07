Current follow-on status: redemption payouts are now live on AWS; daily burns await the dedicated-igniter timelock. See [FINAL-MIGRATION.md](FINAL-MIGRATION.md). The core handoff evidence below is historical.

# Core cloud handoff complete — 2026-09-07

Core services are active on AWS `zeal-operator`, instance `i-00c95b5a0ed0a8ec4`, us-east-2. The CloudFormation stack is UPDATE_COMPLETE. Both host and process alarms are OK and use the existing OENBOT operational alarm topic. Existing OENBOT workloads were unchanged; its trading host remains stopped.

## Verified handoff

The three operational secrets were uploaded by the user and successfully decrypted on the cloud worker, with addresses checked against the keeper and current on-chain attestor/minter roles. No owner/deployer, Zcash reserve, or hot-float wallet was copied.

The Mac's refill and keeper locks were acquired before stopping the background refill and disabling/unloading keeper, attest, watch-roles and desk-watch. The attestor transaction lock was also held during shutdown. There were no incomplete sweeps/refills and no pending nonces for keeper (95), attestor (33) or minter (8) at the handoff boundary.

Five live ledger files were copied and verified by SHA-256. Local sweeps.json was mapped to cloud launchd/sweeps.json, preserving the prior 0.5 ETH conversion and its budget history. PID locks, signing secrets, price caches and the local migration marker were not copied. The cloud /etc/zeal directory is traversable (0755) so the unprivileged job can check ACTIVE; cloud.json remains root-only (0600).

## Live proof

All five core services completed successfully after activation at 06:43:50 UTC:
- Keeper sold 0.09030622 zZEC and returned the pool from 0.60737 to 0.48514 ETH/zZEC; reference was 0.48417. Transaction `0xd489858f6c028b175ab88e3e8631b77cd07a0bea2bd9a9f67d5d7ca576502465` confirmed successfully at block 56,629,276.
- Attestation transaction `0x51f356e2ed03bc22e866659170d0cbc18142282023b9b74d18ccaffaf3157be4` confirmed successfully at block 56,629,279; reserve 3.3874423 ZEC, supply 3.38146917 zZEC.
- Replenisher validated credentials and correctly reported no refill needed. A full cloud conversion-to-mint cycle was not forced for testing.
- Role and desk watchers completed successfully, with no open desk work.

Seven timers are enabled: keeper, attest, replenish, roles, desk-watch, health and backup. Timers are scheduled after each job completes, so the keeper's 10-second interval is in addition to job runtime. Credentials load automatically from Secrets Manager on boot. A full instance reboot was not performed during this handoff.

First cloud ledger backup: `s3://zeal-operator-artifacts-z0jy5fu8vvsh/backups/20260907T064458Z.tar.gz`. Downloaded and inspected: readable, completed 0.5 ETH sweep history preserved, no secret files. Heartbeat reports healthy; checks include failed jobs, stale completions, hung runs and backup health. Both CloudWatch alarms were verified OK.

Source typecheck and all 23 tests pass. Cloud runtime typecheck and original 21 operator tests passed during staging. The additional SDK upload tests apply to the local helper. Local `replenish:background` was tested after fencing and correctly refuses to restart.

## Remaining laptop dependencies

Only com.zealtoken.burn and com.zealtoken.desk-pay remain loaded on the Mac. Burns require owner/deployer and LP ownership; redemption payment requires the Zingo hot float. Those still require the Mac until separately migrated. Public wrap fulfillment and committing contract role changes are not newly automated by this handoff.

## Recovery and maintenance

The authoritative transaction records are now on the cloud host. Do not copy old Mac ledgers back over them. The Mac's launchd/cloud-migrated.json fence blocks keeper/attestor/minter role signing and refill startup; the installer skips migrated LaunchAgents. Restoring local signing requires first stopping and verifying cloud signing, reconciling current cloud/chain records, then explicitly removing the fence and re-enabling local services.

See README.md for recovery. The deployed base artifact remains operator-v2.tar.gz from STAGING.md; activation changed ledgers and the ACTIVE marker, and health.py received the source-tracked hung-run/backup-health improvement. The new CloudFormation ProcessAlarm was applied through reviewed change set process-health.
