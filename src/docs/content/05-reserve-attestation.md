---
title: The reserve and attestation
group: The machine
---
# The reserve and attestation

> **In one breath.** The reserve is a single transparent Zcash address, published everywhere, that anyone can watch on a Zcash explorer. Every six hours a job reads its confirmed balance from a Zcash light-client server and posts that number on Robinhood Chain with the block hash it was read at. The site shows the live Zcash balance and the last attested figure side by side, so a mismatch is visible to everyone before we could say a word.

## Why transparent, not shielded

A shielded reserve would be private, which for a wrapper means unauditable. The whole point of publishing the address is that "trust us" becomes "check us". Holders who want privacy redeem to native ZEC and shield it on Zcash, which is what redemption is for.

## The attestation job, step by step

1. Read the Zcash chain tip (height and hash) from lightwalletd (`zec.rocks:443`), and confirm it is mainnet.
2. Read the confirmed transparent balance of the reserve address with `GetTaddressBalance`. Unconfirmed outputs are not counted.
3. Read the tip again. If it moved, repeat, so the balance and the proof hash describe the same block.
4. Compare with the previous attestation and the current supply. If the reading is below supply **and** is zero or more than 20% under the previous reading, refuse: that pattern is far more likely a node problem than a real change. An explicit force flag overrides it.
5. Sign `attest(zats, blockHash)` with the attestor key and wait for the receipt.

The job runs from macOS launchd every 6 hours. Its passphrase comes from the keychain item `zeal-attestor`. A failure exits non-zero, writes to the error log, and sends a notification. Mints stop on their own once an attestation is older than 36 hours.

## What the reserve holds today

Every ZEC in the reserve so far came from two sources: the operator's own deposits (bought with ETH over NEAR Intents) and, once the fee route unblocks, the Foundry's 60% share. Wrap deposits will add to it as the [WrapDesk](#/wrap) opens.

## Liabilities the attestation does not know about

The attestation reports what the address holds. It does not subtract ZEC that is already owed. Two cases:

- A **burn-first redemption** made directly on ZZEC has reduced supply but not yet reduced the reserve. Until the payout is sent, the reserve reads high relative to supply. The operator's mint and wrap tools subtract pending payouts recorded in the redemption ledger before minting, so this never turns into unbacked supply.
- A **desk redemption** keeps the zZEC in escrow (still in supply) until the payout is recorded, so reserve and supply move together. Between the ZEC leaving and the burn landing, coverage dips for a few minutes, which is harmless and visible.

Each payout also costs a Zcash network fee that the reserve bears, so over many redemptions coverage drifts a hair below 1.00 unless topped up. That is a policy decision the operator owns; the number is public either way.

## Check it yourself

- Zcash side: [the reserve on the Zcash explorer](https://mainnet.zcashexplorer.app/address/t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw).
- Robinhood side: `reserveZats()` and `lastAttestationAt()` on ZZEC; every attestation is an `Attested` event with the Zcash block hash as `proofRef`.
- Live from the site: `GET https://zealtoken.com/api/reserve` returns the balance, height, and hash the site is showing, read from lightwalletd at request time.
