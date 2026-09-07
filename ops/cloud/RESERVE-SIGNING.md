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
