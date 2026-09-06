---
title: Operations runbook
group: Running it
---
# Operations runbook

> **In one breath.** Six scheduled jobs on the operator's Mac keep the machine honest: attest the reserve every 6 hours, run the keeper every minute, burn once a day, watch for pending role changes every 5 minutes, watch the desks every 5 minutes, and pay redemptions from the float every 5 minutes. Each unlocks its key from the macOS keychain, logs to a file, and sends a notification on failure or when a human needs to act. This page is what the operator reads at 3 a.m.

## The jobs

| Job | Interval | Key | Keychain item | Log | Alerts when |
|---|---|---|---|---|---|
| attest | 6 h | attestor | `zeal-attestor` | `launchd/attest.log` | the reading is refused, the node is down, or the key cannot be unlocked |
| keeper | 60 s | keeper | `zeal-keeper` | `launchd/keeper.log`, journal `keeper.json` | a trade happened; a tick failed; price feeds down 10 times in a row |
| burn | daily 14:00 | deployer (igniter) | `zeal-burner` | `launchd/burn.log` | a burn ran, or failed |
| watch-roles | 5 min | none (read-only) | | `launchd/roles.log`, state `roles-state.json` | any pending role, pool, or recipient change on ZZEC, the Tap, or Pons |
| desk-watch | 5 min | none (read-only) | | `launchd/desk.log` | an open redemption (with pay-by), a funded wrap ready to mint, a direct burn-first redemption not yet paid, a role wallet under 0.004 ETH, an attestation over 9 h old |
| desk-pay | 5 min | fulfiller + the float wallet | `zeal-fulfiller` | `launchd/desk-pay.log`, ledger `desk-ledger.json` | a payout was sent; the float is short; a send returned no txid (left PENDING, never retried) |

Notifications go to macOS Notification Center and, when the keychain item `zeal-telegram` holds `BOT_TOKEN|CHAT_ID`, to Telegram.

## Where things live

- Source of truth: `~/zeal/zealtoken.com` (a private git repository; the public mirror is rewritten before every push).
- Runtime copy: `~/zeal-ops`, synced by `ops/launchd/install.sh`, because launchd cannot read the Documents folder. Re-run `install.sh` after any ops change.
- Keys: `~/zeal-ops/.keys/<role>.json` (scrypt keystores) and `deployer.json` for the burn job.
- The float: a zingo-cli wallet at `~/zeal-ops/.float` with its own seed, separate from the reserve key. It holds a small balance of the operator's own ZEC (about 0.1) and is the only thing the automatic payer can spend. Its transparent receiving address is `t1NUMouRcmKAtYmqfBJgcm5h3biHGm4zhem`; top-ups arriving there are shielded automatically before use. Limits: 0.05 ZEC per request, 0.25 ZEC per rolling day; anything larger is flagged for a manual payout.
- Ledgers: `redemptions.json` (direct burn-first payouts), `launchd/keeper.json`, `launchd/wrap.json`.

## What to do on each alert

**"REDEEM #n: pay X ZEC to t1… then fulfil."** Only appears for requests above the automatic limits, or if the payer is down. Pay from the float or the reserve wallet, wait for the txid, then `FULFILL_ID=n ZEC_TXID=<txid> npm run desk` from `~/zeal-ops`. The tool refuses inside the last 12 hours before a reclaim becomes possible.

**"float has X ZEC, needs Y: TOP UP THE FLOAT."** Send ZEC to the float's transparent address. Since payouts burn zZEC while the reserve stays put, the reserve over-covers by the paid amount; move that excess from the reserve to the float to reimburse yourself.

**"WRAP #n: funded X ZEC (k conf)."** `WRAP_FULFILL=1 npm run wrap`. It re-attests if needed and mints.

**"DIRECT REDEEM #n: … burned X zZEC -> t1…"** Someone used `requestRedeem` directly. Pay it, then add `{"n": {"txid": "<zcash txid>", ...}}` to `redemptions.json` so the alert clears and the mint tools stop counting it as owed.

**"ZZEC minter change proposed / attestor change proposed / Tap migration proposed / Pons recipient change proposed."** If you did not propose it, someone has the owner key. Pause minting (`setMintingPaused(true)`) immediately, then cancel the proposal and rotate.

**"attest FAILED."** Read `launchd/attest.log`. Usual causes: lightwalletd unreachable (retry next run), attestor out of gas (top up), keychain locked (unlock). Mints stop by themselves after 36 hours without an attestation.

**"keeper tick failed."** Read the last lines of `launchd/keeper.log`. A revert on the swap means the pool moved between plan and send; it retries next minute.

**"wallet … has 0.00x ETH: top up."** Send about 0.01 ETH to that role address.

## Manual commands

```
cd ~/zeal-ops
npm run attest                        # attest now
MINT_TO=0x… MINT_ZEC=1.5 npm run mint # fee-route mint (through the WrapDesk once it is minter)
npm run keeper                        # report + plan, nothing signed
npm run burn -- --execute             # burn now
npm run watch:roles / npm run watch:desk
```

Contract-side commands run from `~/zeal/zealtoken.com/contracts` and prompt for the deployer keystore passphrase: `npm run furnace:pools:commit`, `ACTION=commit npm run zzec:minter`, `npm run zzec:age`.

## Scheduled commitments

| When (UTC) | Action |
|---|---|
| 2026-09-07 16:04 | `npm run furnace:pools:commit` so the Furnace sells zZEC on the hooked pool |
| 2026-09-07 19:16 | `ACTION=commit npm run zzec:minter` so the WrapDesk becomes the minter; then set the desk address in the site config |

## Publishing

The public repository at [github.com/zealtoken/zealtoken](https://github.com/zealtoken/zealtoken) is a mirror produced by `scripts/publish-mirror.sh`, which rewrites the whole history (authors, paths, identifiers) and refuses to push if anything personal remains. CI runs the contract tests on every push. The site deploys to Vercel from a prebuilt bundle.
