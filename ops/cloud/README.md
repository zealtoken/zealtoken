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

## Wrapping worker staged — September 7, 2026

`zeal-wrap.service` and its 15-second-after-completion timer are installed but disabled. Both the existing ACTIVE gate and a separate `/etc/zeal/WRAP_ACTIVE` gate are required. The runner supplies only minter and attestor credentials. Requests remain disabled on the website, and the owner must still commit the minter role before any fulfilment can succeed.

Production minting and reserve reimbursement now reserve exact-tag wrap deposits, including duplicates and payments on cancelled/rejected requests. The persistent `launchd/wrap-obligations.json` journal releases a payment only after its matching on-chain fulfilment. A disappeared protected output stops issuance and spending for manual reconciliation. Do not delete this journal to clear an alert. Wrong amounts and refunds need an individually verified recovery; automatic rejection is disabled. Two regional endpoints from the same zec.rocks provider must agree; this is redundancy, not independent consensus verification.

Worker evidence uses three or more confirmations, exact single-output matching, post-request block timestamps, on-chain consumed transaction IDs, rechecks immediately before sending, managed transaction reconciliation, atomic journals and bounded gRPC calls. All financial jobs share the issuance lock. The existing backup includes launchd journals. Once WRAP_ACTIVE is set, the health monitor also checks worker completion; the timer runs after each completed pass, never overlaps passes, and has a five-minute runtime bound.

Before activation: confirm request count/roles, test the owner-only minter transaction on a fork, finish the actual owner transaction, start the worker, complete a small real request/deposit/mint, reconcile backing and recipient credit, then enable the website and publish the launch announcement. Reconcile any pending wallet transaction before retries. The deployed desk still has finite lifetime request capacity; the operator stops scanning above 10,000 requests. That remaining denial-of-service limitation requires contract/indexing work and is not cured by these worker changes.

### Activation confirmed

Owner transaction `0x7661cd225a5f0cf4f171e8e11e51870c8cacecba377a0c81707f508e57160c04` confirmed in block 57087557 on September 7. WrapDesk is now the minter. The cloud preflight verified the expected operator, unpaused minting/requests, reserve accounting and zero requests. WRAP_ACTIVE was then created and zeal-wrap.timer enabled; the initial no-deposit run succeeded. Public submissions remain gated pending a real payment test.

The contracts package now includes `npm run wrap:smoke` (read-only by default). `ACTION=request npm run wrap:smoke` asks for the existing local owner-keystore password, opens the minimum 0.001 zZEC request and prints the exact tagged deposit amount. The signed request hash is persisted before broadcast; an unresolved transaction blocks another request. The script reuses an existing test request and never sends native ZEC. Send its printed amount once from the Zcash wallet, then reconcile fulfilment, recipient balance and reserve obligations before public access. If already funded, never send again because a status command prints the address.

### Superseded by unique-address migration

The legacy wrapping timer has since been disabled and WRAP_ACTIVE removed after the test payment exposed amount-tag fragility. Public wrapping remains closed. See [WRAP-V2.md](WRAP-V2.md) for the new contract, local custody-preparation command, tests and remaining integration work. Do not re-enable the legacy service or fund its preview to work around a mismatched amount.

## Dedicated-address public wrapping

The automatic interim worker is deployed behind the owner request switch. See [WRAP-PUBLIC.md](WRAP-PUBLIC.md) for limits, opening and checkpoint recovery; legacy exact-amount wrapping remains disabled.

### Routine alert policy — September 7, 2026
`cloud/alert-policy.py` filters only the recognized keeper funding notice at balances >=0.2 ETH and the exact known V2 minter/ETA before September 9 20:16:37 UTC. It is applied before both the health metric and email delivery. Below 0.2 ETH, routine funding warnings resume; the independent 0.004 ETH gas warning remains. Refill still preserves 1 ETH plus gas. Unknown message formats and other failures remain actionable. Expected-proposal filtering expires at eligibility; no automatic role commit is implied. Existing six-hour reminders for actionable issues remain unchanged.
