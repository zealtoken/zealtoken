# Redemption backing protection — 2026-09-07

Deployed to AWS and synchronized to the Mac runtime. Four accounting tests and TypeScript checks passed locally and in AWS. Both mint.ts and wrap.ts use a shared issuance lock and independently read reimbursement obligations from the live RedemptionDesk at a pinned EVM block.

Completed desk payouts burn escrowed zZEC while leaving the public reserve unchanged. Their full amounts are now excluded from operational mint capacity until a verified reserve reimbursement workflow exists. Open requests remain included in ERC20 supply and are not deducted twice. Direct wrapper redemptions not represented by fulfilled desk requests halt minting for reconciliation. Raw on-chain reserve attestations and the website reserve balance continue to show the transparent address balance; they are not a measure of freely available mint capacity.

Verified snapshot: reserve 4.36075068 ZEC, supply 4.35465755 zZEC, completed desk reimbursement liability 0.002 ZEC, available capacity 0.00409313 ZEC. The accounting function uses live chain data, not these snapshot constants.

## Still required

Automatic reserve-to-float transfers are NOT enabled. The reserve signing wallet must be identified. The current Zingo flow shields transparent funds before spending, so it must not be aimed at the main reserve: that would remove the publicly attested transparent balance.

Before enabling reimbursements: implement a bounded signing path that preserves reserve change, fixes the recipient to the payout wallet, confirms destination outputs and reserve debits, records transaction identity before broadcast, and refuses duplicate or ambiguous sends. Reimbursement credits must be tied to verified transactions, not a manually editable total. Transfers, minting and attestation must be coordinated so already allocated backing cannot be reused while a transfer is pending. Keep unmatched public wrap deposits intact for matching. Reconcile direct burn obligations as well as desk burns.

The current conservative guard deducts every completed desk payout and does not yet release that deduction after a transfer. Do not manually reimburse and assume issuance capacity updates automatically. Reconcile and implement verified settlement before enabling that path.

Initial target proposed: 0.5 ZEC float, 0.1 ZEC/request, 0.25 ZEC/day. NOT applied: float currently has only 0.09662 ZEC confirmed shielded funds, plus transparent funds; existing caps remain 0.05/request and 0.25/day. No reserve money or keys were moved by this change.

Release: s3://zeal-operator-artifacts-z0jy5fu8vvsh/releases/redemption-accounting-20260907.tar.gz
SHA256: 4a397f91b843a6d544ddd3bae54e5e2d95aa8c54f3b1baab8cbd1df19f08c79a
Cloud previous mint/wrap copies: /var/lib/zeal/redemption-accounting-backup/. Removing this guard reopens the reimbursement-headroom issue; do not roll back without another protection.
