# Temporary unique-address wrapping path

Current deployment and recovery instructions: [Public wrapping](WRAP-PUBLIC.md). The sections below preserve implementation history. Public opening still requires the owner request switch.

The deployed legacy WrapDesk remains the token minter. Its operatorMint method can issue to a recipient against fresh attested backing without a minter-role change. The proposed temporary worker uses V2 only as a permanent recipient/address registry and records actual native-output references in legacy ReserveMint events. V2 credits must stay paused while using this route.

The token's 48-hour role delay is unchanged. The V2 proposal is now confirmed; its commit eligibility is September 9, 2026 at 20:16:37 UTC. A later upgrade is eligible 48 hours after an owner proposal, not 48 hours after deployment or this document. Activation is separate and requires reconciliation and testing.

## Implemented and checked

- User staged the dedicated deposit credential and successfully restore-tested a downloaded off-device encrypted backup. AWS current-version metadata matches the backup hash. Scoped EC2-role read access was added only for this deposit secret. A one-time isolated AWS process successfully decrypted the wallet and checked its deployed fingerprint; its temporary credential was removed. No service activation.
- wrapv2:cloud-unlock: hidden local password; verifies the deployed fingerprint, restores the dedicated wallet, uploads an encrypted S3 backup, downloads/decrypt-tests it, then stages credential material in Secrets Manager. Never prints secret data. No signing or service activation.
- Independent offline deposit signer: one native input of 0.001–1 ZEC, fixed 0.0001 ZEC network fee and a single output to the existing central reserve. Cannot redirect funds or spend the central reserve address. Eight Rust tests pass both locally and on Linux. The Linux binary is installed but no active deposit service uses it; SHA-256 d4b0aee977f7c7d6c58394e5468308209d6d941345ec8090ea24192acd40e935.
- Interim policy and receipt checks: gross actual amount, project-funded fee margin, output-bound references, ledger validation and exact mint recipient/amount/calldata/event verification. All 61 operator tests pass and TypeScript checking passes.
- Public read-only preflight checks the registry fingerprint, matching operators and legacy minter, then inspects one assigned route against both regional nodes. Latest result: both V2 pauses true, zero routes.
- Settlement helpers prepare but do not broadcast sweeps and check raw native deposit/settlement bytes. These helpers still require integration and end-to-end testing.

## Required before public opening

Custody staging and one-time cloud restore verification are complete. Finish the persistent observer and issuance state machine, including signed-hash-before-broadcast handling, historical ReserveMint reconciliation, restart/backup recovery and canonical receipt checks. Protect gross pending liabilities in every mint and reimbursement path before any sweep can reach the central reserve. Implement the user address/status flow. Enable registry requests only as part of controlled activation. Run a real deposit/consolidation/attestation/mint test and duplicate/restart tests before enabling the public interface. No example address should be funded.

Duplicate protection in this temporary path is an operator responsibility: legacy operatorMint has no native-output consumption mapping. ReserveMint references provide an on-chain audit trail, not on-chain replay prevention. Before V2 crediting is enabled, explicitly exclude every interim-credited native output; V2's fresh creditedOutputs mapping does not know those outputs. Keep the permanent route mapping unchanged. Do not simply switch workers after the timer expires.

The user-claimed legacy 107001-zatoshi transfer remains a separate held recovery item. No arbitrary amount tolerance or automatic ownership inference was introduced.

## Latest implementation progress

Local accounting integration now retains interim gross liabilities and reserves sweep outputs until exact canonical mint receipts have at least 12 EVM confirmations; missing active ledgers fail closed. Local on-chain mint-history indexing is bounded and restarts after a canonical hash change. These additions have not been deployed to financial workers. The owner staging command can start/preserve the V2 proposal, create a test route for the owner by briefly enabling requests, and pause requests again. Only its read-only preflight has run; owner signing and the route test remain outstanding.

## Controlled test deployment — September 7

V2 minter proposal `0x3d34544d26cb076eb7175725dee91067797ef9c046b1626fa51f424238ec8a4f` is confirmed. Commit eligibility is September 9, 2026 at 20:16:37 UTC; neither commit nor public opening is automatic. Registry requests and V2 credits are both paused. Owner route 0 was created and its dedicated derived address assigned in `0xa6583f2da10c3997a3b0cc7c08a2a975787144fccfc23443e999c72b72988fc6` (block 57116562).

Controlled worker deployed to AWS under `/etc/zeal/WRAP_INTERIM_TEST`, not public activation. It runs one transition per manual operator invocation of `python3 cloud/run-interim-test.py`; no timer is installed. Only route 0, recipient 0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03, at most three payments, each 0.001–0.01 ZEC, can be processed. The signer remains fixed to the published central reserve. Deposit records and wallet hashes are flushed to disk before broadcast. Uncertain sweeps/mints stop rather than auto-resend. Mint receipts need 12 EVM confirmations; native deposit/sweep confirmations need three.

Shared accounting now protects pending gross credits and excludes known consolidation outputs from legacy amount-tag detection. Local regression checks and cloud typecheck pass. Assignment and idle worker runs succeeded. Latest live reserve accounting leaves 399313 zats unencumbered, with zero other in-flight payouts; sweep fee is 10000 zats per test payment. A real funded test remains required; no test native sweep or mint has occurred yet.

Financial timers were briefly paused during the controlled code installation and restored; keeper stayed active. Existing keeper-funding alert remains (approximately 0.78 ETH below the existing 1 ETH refill floor). No floor was lowered.

Public-worker automation, frontend integration, comprehensive restart/backup recovery and migration-wide replay reconciliation remain release requirements. This test deployment is not a claim that public wrapping is live.

## First funded test completed — September 7

Route 0 received 207000 zats at native outpoint 498797fe18bc6722b21767b7550b3e017e3a4ecc499f4ada150ab5e6a2ceb547:0 (height 3475457). After confirmation, the worker signed and broadcast de7005ae732db0ee0600a80a174fe006198566c105db6cc2a3e3626ee6006b1d: a single 197000-zat output to the central reserve, with 10000 zats paid as the project-funded network fee. Both regional nodes confirmed it at height 3475464; minting waited for three confirmations.

Mint 0xabfde9fbb8cb36c28750f784452b584daa4238cc6c8f0359f4e1ed44b172abf1 succeeded at EVM block 57135048, issuing exactly 207000 zats to route recipient 0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03. Exact calldata, event and canonical receipt reconciled after more than 12 confirmations. Existing attestation was fresh and sufficient; no new attestation was required. A fresh worker process returned no pending action without a duplicate mint.

Post-settlement accounting: confirmed reserve 436376069 zats; supply 435672755; separate legacy holds 314001; reimbursement debt 0; pending direct payouts 0; unencumbered margin 389313. Test ledger is minted and its pending liability released. The two earlier misdirected payments remain held, not credited or refunded. Keeper, replenishment and reserve-reimbursement services remained enabled; the temporary deposit credential was removed after execution.

One controlled payment is now proven. Public wrapping stays closed, both V2 pauses stay true, and no public timer is installed. Broader restart/backup recovery, public observation/issuance, frontend integration and cross-version replay reconciliation still require completion. Earlier progress sections above describe historical stages, not current readiness.
