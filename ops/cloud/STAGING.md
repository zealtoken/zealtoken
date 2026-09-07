# Staging result — 2026-09-07

AWS stack: `zeal-operator`, `us-east-2`, `CREATE_COMPLETE`.
Worker: `i-00c95b5a0ed0a8ec4`, Ubuntu 24.04, t3a.small.
OENBOT trading server remains stopped. OENBOT website and scraper were not changed.

Installed release SHA-256: `8c2126c3f193d96f90e5db17f4f286589cf1d37bc46dfd16cab5dfdbf54c0fdf`.
S3 versioned artifact: `s3://zeal-operator-artifacts-z0jy5fu8vvsh/releases/operator-v2.tar.gz`.
Validation SSM command: `55ffd485-baf2-4ae4-a266-a29941edcdca`, Success.

Verified on the actual worker:
- Node v22.23.2, downloaded archive checksum checked against Node's published SHA-256.
- TypeScript typecheck and all 21 tests pass.
- systemd service and timer definitions pass verification.
- Coinbase and Kraken respond successfully from AWS.
- Read-only keeper preview reads pool and wallet balances; no transactions sent.
- NA and EU Zcash endpoints agree on mainnet block 3,474,776.
- Unprivileged worker can atomically write state; root credential loader is not writable.
- All seven timers are disabled; no ACTIVE marker or signing credentials installed.

Infrastructure checks: cfn-lint passes, AWS template validation passes, change set lists only new ZEAL resources, AWS pre-deployment failure events empty. Explicit checks pass for IMDSv2, encrypted EBS, no inbound access, private versioned S3, retained secrets, and KMS rotation. The installed guardpycfn package exposed a placeholder rather than a working Guard engine, so this was not a cfn-guard validation.

The Mac remains authoritative and running. Cloud ledgers currently contain staging placeholders: do not activate them. Preserve every live sweep, refill, pending-transaction and watcher ledger at cutover; map local sweeps.json to cloud launchd/sweeps.json. Never infer rolling spend from the empty staging ledger.

Next required local action: `cd ~/zeal-ops && npm run cloud:unlock`. It validates and uploads keeper, attestor and minter secrets without activating anything. Then finish the handoff procedure in README.md, configure and verify heartbeat alarms and backups, and observe actual cloud executions. No cloud secret retrieval/signature or restart recovery has yet been tested with real keys.

Burn and redemption payment remain local and require separate signer / Zingo wallet migration. This is staging, not completion of the full laptop-independent migration.
