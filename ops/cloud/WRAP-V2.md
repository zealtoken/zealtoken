# Unique-address wrapping migration — September 7, 2026

Status: WrapDeskV2 **deployed fully paused**, not activated. Deployment `0x0ed9febfaa6e51341c4ed0fb1e139a8980761f721a7feaaab653938c3ffb141d`, address `0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379`, block 57103151. Creation bytecode and constructor arguments match the local artifact. Owner, operator, token and fingerprint match expected configuration; both pause flags are true and request count is zero. No V2 minter proposal existed at verification. Dedicated custody was prepared and both encrypted local copies were restore-tested. Legacy public wrapping remains closed and its matching timer is disabled during replacement. Keeper, redemption and reserve reimbursement are separate services.

## Design

One permanent route per Robinhood Chain wallet. The recipient opens it; an operator assigns the Zcash mainnet P2PKH address derived at that route ID from a new dedicated public derivation branch. The full public branch key's hash is immutable in the new contract. The worker must verify every assigned address against that key, including restored historical routes. Addresses and recipients cannot be reassigned; repeat deposits use the same route. The registry has no amount-tag allocation or 99,999 lifetime slot limit. Derivation uses the non-hardened 31-bit BIP32 index domain.

Deposit identity is native transaction ID plus output index, globally consumed once on-chain. Actual output amount determines minting; requested/quoted amounts do not authorize credit. Initially 0.001–1 ZEC per output; smaller/larger outputs remain held for manual review. No unsafe fee tolerance or shared-address nearest-amount matcher. Sender identity is not needed for new routes because the destination binds the recipient.

ZEC must be confirmed, swept into the published reserve, confirmed there and attested before minting. This preserves the existing token's fixed reserve-address accounting. Project pays consolidation fees only from verified unencumbered excess; insufficient margin holds the deposit rather than reducing holder backing. Gross pending liabilities stay reserved until a successful mint is independently reconciled. A signed/uncertain sweep or mint cannot be blindly repeated. Destination-address derivation, transaction bytes, input ownership, outputs, fees, confirmations and receipts must be independently checked before state advancement. Both current RPC endpoints share one provider; they are not independent consensus validation.

## Implemented

- WrapDeskV2.sol: immutable routes, operator-only assignment/credit, actual-value minting, outpoint deduplication, credit/request pause, keeper-compatible operatorMint. Starts fully paused. Ten contract tests pass.
- wrap-v2-policy.ts: public-only deterministic address derivation, route consistency, matching evidence across sources, confirmation/amount checks, immutable deposit identity, pending gross liabilities and consolidation/backing gate. Policy tests pass.
- wrapv2:prepare: local hidden-password creation of a NEW dedicated encrypted HD deposit wallet, restore-tested duplicate local backup, public derivation config. No network/upload/transfer. No existing wallet seed requested.
- wrapv2:deploy: public-only config validation and paused deployment with signed tx hash recorded before broadcast. No role proposal or activation.

## Still required before opening

Dedicated deposit custody is uploaded, the off-device encrypted backup is restore-tested, and a one-time AWS decrypt/fingerprint check passes. A scoped deposit-secret read policy is installed; no deposit worker is activated. Implement/integrate and test the offline deposit sweeper, bounded route index, persistent observer/state reconciliation, central-reserve liability integration and frontend address flow. Verify cloud restoration, node disagreement/reorg handling, outstanding deposit recovery and health alerts. Propose the verified paused contract as minter and observe the mandatory 48-hour role delay. Reconcile legacy deposits before switching accounting to v2. End-to-end real deposits (including a changed bridge payout amount and repeat payment) must pass before opening. Do not send to example addresses from preparation.

## Legacy request #0

Claimed native output `ed6000fe29b4f264644715404e3971db37420c8a512f00822aef201037bca17b:0` is 107001 zats versus request deposit100001. Both regional nodes agree on the output. NEAR public masked receipt displays100001 and does not expose the corresponding native txid. The user claims this is their test transfer. It is held in the existing wrap-obligations journal and a separate review record; no credit, refund, source-attribution assertion or tolerance bypass was performed. Reconcile as a documented individual recovery, not evidence that legacy automatic matching works.

## Interim path

A temporary worker through the existing legacy operatorMint is now being built; see [WRAP-INTERIM.md](WRAP-INTERIM.md). This can avoid a minter-role change for the temporary service, but it is not activated. The 48-hour delay remains mandatory for V2 to become the minter. Cross-mode duplicate-credit reconciliation is required before switching.

## Controlled test deployment — September 7

V2 minter proposal `0x3d34544d26cb076eb7175725dee91067797ef9c046b1626fa51f424238ec8a4f` is confirmed. Commit eligibility is September 9, 2026 at 20:16:37 UTC; neither commit nor public opening is automatic. Registry requests and V2 credits are both paused. Owner route 0 was created and its dedicated derived address assigned in `0xa6583f2da10c3997a3b0cc7c08a2a975787144fccfc23443e999c72b72988fc6` (block 57116562).

Controlled worker deployed to AWS under `/etc/zeal/WRAP_INTERIM_TEST`, not public activation. It runs one transition per manual operator invocation of `python3 cloud/run-interim-test.py`; no timer is installed. Only route 0, recipient 0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03, at most three payments, each 0.001–0.01 ZEC, can be processed. The signer remains fixed to the published central reserve. Deposit records and wallet hashes are flushed to disk before broadcast. Uncertain sweeps/mints stop rather than auto-resend. Mint receipts need 12 EVM confirmations; native deposit/sweep confirmations need three.

Shared accounting now protects pending gross credits and excludes known consolidation outputs from legacy amount-tag detection. Local regression checks and cloud typecheck pass. Assignment and idle worker runs succeeded. Latest live reserve accounting leaves 399313 zats unencumbered, with zero other in-flight payouts; sweep fee is 10000 zats per test payment. A real funded test remains required; no test native sweep or mint has occurred yet.

Financial timers were briefly paused during the controlled code installation and restored; keeper stayed active. Existing keeper-funding alert remains (approximately 0.78 ETH below the existing 1 ETH refill floor). No floor was lowered.

Public-worker automation, frontend integration, comprehensive restart/backup recovery and migration-wide replay reconciliation remain release requirements. This test deployment is not a claim that public wrapping is live.
