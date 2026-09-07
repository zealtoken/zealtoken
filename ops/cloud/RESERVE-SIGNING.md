# Existing reserve signing: preparation only

The current zZEC contract fixes t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw as its reserve and has no setter. The operator confirmed the Zodl wallet on iPhone is dedicated to ZEAL. Preserve the address; do not move its backing to a new address or shield it.

## Local preparation

Run `cd ~/zeal-ops` then `npm run reserve:prepare` in a private local terminal. The program accepts the recovery phrase only through a hidden prompt, searches standard Zcash BIP44 external paths (four accounts, first 100 indices), and refuses if none match the fixed reserve address. It prompts for a new encryption passphrase, encrypts only the individual matched secp256k1 key, decrypt-checks it and saves `.keys/reserve-transparent.json` with mode 0600. Existing files are never overwritten. No mnemonic, root key, account extended key or chain code is stored. Crypto exceptions are suppressed to avoid leaking inputs. Secrets remain in JS process memory while the process is running; this is not a hardware enclave or a guaranteed-memory-erasure design.

The tool contains no network calls, AWS client or transaction broadcaster. No key is uploaded and no transaction is signed. The existing Zodl backup and new encryption password must both be retained. The encrypted individual key is a recovery artifact, not an independent off-host backup yet.

Verification: upstream Zcash BIP32 account public-key/HASH160 vector; exact child matching and rejection; Zcash address prefix/checksum; standalone key encryption/decryption and absence of HD metadata. TypeScript checks passed.

## Remaining implementation before cloud activation

- Confirm the operator successfully derives the actual address using the local tool.
- Implement and test transparent-input transactions with transparent change returned to the fixed reserve address. Standard Zingo quickshield is unsuitable.
- Verify active Zcash consensus branch/version and offline signatures with independent decoding and synthetic transaction vectors before any reserve spend.
- Scope automatic recipients to the known payout wallet. Limits are software controls, not restrictions imposed by a raw spending key on the blockchain.
- Reimburse only proven completed payouts. A 0.5 ZEC advance from currently pledged reserve is not permitted merely to meet a float target. Extra float capital must come from unencumbered funds.
- Verify reserve debit and payout-wallet credit at sufficient confirmations before releasing the mint guard's reimbursement deduction. Persist signed txid/raw transaction before broadcast; reconcile rather than re-send on uncertainty. Exclude pending wrap deposits from selection.
- Coordinate issuance/attestation and pending reserve transfers; block signing if state cannot be reconciled. Cap fees and retain backing and operating-fee margin.
- Separate cloud secret/service, encrypted backup with tested restore, scoped runtime access, health alerts and manual activation only after evidence passes.

Source derivation reference: https://github.com/zcash/librustzcash/blob/main/zcash_transparent/src/keys.rs
Transparent builder reference: https://zcash.github.io/librustzcash/rustdoc/latest/zcash_primitives/transaction/builder/struct.Builder.html

## Verified cloud staging — 2026-09-07

Local preparation succeeded for the exact reserve address. CloudFormation UPDATE_COMPLETE added a retained, encrypted ReserveSecret with exact role read scope. The Linux signer was built with pinned Rust/dependencies in an isolated unprivileged build service; six Rust tests and sixteen cloud TypeScript tests passed, as did cloud and local TypeScript checks. Linux binary SHA256: `f874082783d7af348a6ecb193e4dab437c582779b9eabf8978949cd46c1b157e`. A private S3 copy was downloaded and hash-verified.

Production modules and disabled systemd units are installed. `/etc/zeal/RESERVE_ACTIVE` and `/run/zeal/reserve` are absent. Reimbursement timer is disabled. Existing keeper, replenisher timer and payout timer remain active. The existing desk-watch nonzero status is its keeper-funding alert, not a new reserve fault.

Preview: reserve 4.36075068 ZEC; supply 4.35465755; completed-payout debt 0.002; proposed reimbursement 0.002; fee 0.0001; two inputs; change 0.10117077 returned to the same reserve. No transfer occurred.

The signer allows only transparent reserve inputs and fixed payout-wallet output plus reserve change, <=0.1 ZEC/transfer. The planner enforces <=0.25 ZEC/rolling day, exact simple ZIP317 fees, and 0.001 ZEC excess margin. Pending wrap deposits are excluded. Signed raw transaction and txid are saved before one broadcast attempt. Pending/uncertain settlement blocks issuance and is never blindly rebroadcast. Credits require matching transaction bytes, three confirmations on both regional nodes, and verification of original reserve inputs. The transfer journal is included in existing ledger backups; restore always requires chain reconciliation. These are application controls, not on-chain restrictions on a compromised reserve key or server.

Next private user step: `cd ~/zeal-ops` then `npm run reserve:cloud-unlock`. Enter the NEW encryption password, never the recovery phrase. The tool uploads an encrypted backup, downloads/decrypt-verifies it, and uploads the scoped credential to Secrets Manager. It does not activate signing or move funds. Retain the Zodl backup and password independently.

After upload success: verify credential/address without logging secrets, activate and reconcile the first real completed-redemption reimbursement, verify payout-wallet credit and mint accounting, refresh reserve attestation, then enable the minute timer. Verify post-transfer journal backup. Do not raise payout limits without separately funded float capacity.

## Credential uploaded — activation pending

AWS metadata confirms AWSCURRENT exists (2026-09-07 17:57 UTC). Binary hash and fresh preview remain verified; signing marker/loaded credential are absent and timer disabled. `npm run reserve:activate` is installed in the local client for the operator to run personally. It enables real reserve transfers and the minute timer, refuses repeat activation, verifies binary and empty transfer journal, and prints the SSM operation ID for reconciliation. The assistant has NOT executed activation. After the operator runs it, perform read-only transaction/confirmation, wallet-credit and accounting checks; do not assume a successful service start means confirmed settlement.

## User activation and first confirmed settlement — 2026-09-07

Operator personally ran reserve:activate. SSM command 3564376a-f4e3-4d35-8a4e-3d59011c4cc3 succeeded and enabled the minute timer. First transfer 9c33a06d8e76467978e8bfbb1ab406bf6910d439a552df15e8a537a11784b08d paid 0.002 ZEC to the fixed float, fee 0.0001, mined at height 3475341. Both regional nodes passed settlement verification after three confirmations. Scheduled job automatically marked the journal confirmed. Read-only redemptionAccounting at EVM block 57034395 returned supply 435465755 zats and reimbursementZats 0. Float wallet sync at 18:05:15 UTC showed confirmed transparent balance 400000 zats (previous 200000), shielded spendable 9662000. The reimbursed transparent funds are shielded by the existing payer when a payout is processed; they are not immediately counted as shielded spendable. Keeper, replenisher, payout and reserve timers remain active. Confirmed journal/wallet backup requested after verification. Attestation remains on its existing schedule; do not confuse older attested reserve with current on-chain Zcash UTXO balance.
