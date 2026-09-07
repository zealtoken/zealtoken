# Public unique-address wrapping

September 7, 2026: automatic worker and status API deployed; frontend published and production API/browser checks passed. Registry requests remain paused until the owner runs the opening command. V2 credits stay paused. This uses the legacy minter; it does not skip or reset the pending V2 role delay.

## Operation

- `zeal-wrap-public.timer` schedules a pass 15 seconds after completion; `zeal-wrap-public.service` runs the root checkpoint coordinator, which starts an isolated User=zeal signing step with scoped systemd credentials. No laptop dependency.
- Gates: existing ACTIVE plus WRAP_INTERIM_ACTIVE. The old controlled-test gate and legacy wrap gate are absent. No other financial-service limits were changed.
- Each permanent registry route is checked against the pinned public derivation key. Confirmed actual native outputs of 0.001–1 ZEC are observed. Below/above-range or pre-route deposits stay outside automatic consolidation and are reported for review.
- One state transition per run, across all indexed routes. Pending unconfirmed sweeps do not prevent other routes from progressing. Three native deposit confirmations, three sweep confirmations, exact canonical mint receipt with at least 12 EVM confirmations. The project covers the fixed 10000-zat network fee only from unencumbered backing.
- Initial route observation cap: 1000. New deposit instructions close at capacity; the first 1000 routes continue processing. The journal guard is 10000 payments. Expanding capacity needs indexing and performance review. These are software limits, not smart-contract limits.
- A private S3 checkpoint is compared with the local journal before every run, claimed with an ETag conditional write, marked running before the worker, then updated on normal completion. Interrupted runs and uncertain signed-state changes require manual reconciliation. Transient failures without signed progress may retry; unsigned observations are preserved.
- Other issuance and reserve reimbursement require a fresh matching checkpoint marker. A reboot cannot silently use a stale restored journal. Missing checkpoint access closes processing rather than guessing.
- `zeal-wrap-status` Lambda can only read the single sanitized status object. It has no wallet, signing, secret, checkpoint-write or reserve permissions. Website `/api/wrap-status` proxies read-only status. Only the selected public wallet route is returned; no private credentials are published.
- UI checks the on-chain route recipient and address, minter, credit pause, request pause and status freshness. New instructions disappear if status is stale/unhealthy, funding is insufficient or the wallet changes. Known transactions remain identifiable by their receipts.
- Existing ZEAL health/email monitoring includes worker failure/staleness, consolidation fee funding, review deposits and route capacity.

## Opening

Once the deployed UI/API and fresh cloud runs are verified, the registry owner runs:

```sh
cd ~/zeal/zealtoken.com/contracts
ACTION=open npm run wrap:public:open
```

The command performs public preflight before asking for the local owner keystore password. It enables requests only (`setPaused(false,true)`), keeps V2 credits paused, persists the signed transaction hash before broadcast and verifies the result. It does not change the minter, move ZEC or mint. Return its public output for the final cloud/UI check. Default invocation without ACTION=open is read-only.

## Stop and recovery

1. Stop the wrapping timer and let any active worker finish. If an emergency interruption is required, expect a dirty checkpoint and mandatory reconciliation. Never clear a dirty checkpoint just to make the timer run.
2. Close registry requests using the owner if stopping onboarding. The UI also closes on stale/failed status, but already-copied addresses remain controlled liabilities.
3. For a running/review checkpoint, inspect native deposit and signed sweep receipts plus legacy ReserveMint history and the saved mint hash. Verify exact amounts, recipient and reference. Never infer nonpayment solely from an empty UTXO set or an old local snapshot.
4. Use the latest versioned S3 checkpoint ledger and retained volume as evidence. Restore only a reconciled ledger; compare hashes. Do not automatically fall back to an earlier checkpoint version. Confirm the old host is stopped before failover.
5. Rebuild derivative on-chain history if necessary, retaining known interim references. Only after explicit reconciliation may an operator repair a ready checkpoint with a conditional write, recreate the matching runtime marker and restart.
6. Before V2 minter activation, exclude every interim-credited outpoint. Its fresh creditedOutputs mapping does not know legacy credits. Do not automatically commit the proposal when the delay expires.

## Verification

The earlier funded test minted 207000 zats at transaction 0xabfde9fbb8cb36c28750f784452b584daa4238cc6c8f0359f4e1ed44b172abf1. Automatic public-worker runs reconcile it without issuing again while requests remain paused. Operator tests: 59 pass; legacy and V2 contract tests: 15 pass; checkpoint crash/stale/corruption/unsigned-retry tests: 6 pass; UI address ABI/binding/freshness/amount tests: 4 pass. Simulated-wallet browser checks cover one request, assignment, stale status, account change and responsive overflow. Tests are not a third-party audit.

Production deployment: dpl_74i39ucKXUGXqUo5wNBqnyiG82Ho, aliased to https://zealtoken.com. Public API returns workerReady=true, requestsPaused=true, accepting=false; invalid account input returns 400. Owner read-only opening preflight passed. Final owner signature is still outstanding.

## September 7 — reimbursement checkpoint permissions

The public checkpoint marker now lives in `/run/zeal-status/wrap-checkpoint-ready.json`, in a root-owned 0755 directory with a 0644 marker. It contains only the ledger hash and timestamp. The private `/run/zeal` credential directory remains restricted. The coordinator creates the status directory on each start, including after reboot. Non-root accounting readers still require a matching, fresh checkpoint; no backing or settlement checks are bypassed.

Health monitoring now includes `zeal-reserve-reimburse.service` whenever RESERVE_ACTIVE is present, with a ten-minute completion/stall window and immediate nonzero-exit detection. The operator-approved suppression of routine keeper and planned-minter notices does not suppress reimbursement failures.
