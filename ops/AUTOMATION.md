# Peg operations

The keeper checks every 10 seconds. It sizes toward 0.2% from the reference price when the gap exceeds 1%, with a 0.1 ETH quote cap. Quotes use Coinbase and Kraken, cached for no more than 20 seconds. Both sources must respond and agree within 2%. Executable output must meet both the fair-value floor and 99.5% of the fresh swap quote. Only one keeper tick runs at a time.

This does not guarantee exact parity. Swap fees, capital availability, Zcash confirmation times, operator uptime and external conversion services constrain execution. Single-range sizing refuses trades that cross initialized liquidity boundaries. An unsupported protocol fee also stops trading.

## Start automatic reserve replenishment

Run once in a local terminal:

```bash
cd ~/zeal-ops
npm run replenish:background
```

Enter the minter passphrase locally. After successful validation, the command replaces an idle foreground refill session and starts a detached background process. You can close the terminal. The passphrase stays in process memory and is not saved in Keychain or a file. After stopping the background process or restarting the Mac, run the command again. The keeper continues independently while refill signing is locked. The helper detects an already running background process.

The session first validates the signer against the current ZZEC minter or the current WrapDesk operator. It does not change contract roles or activate public wrapping.

## Replenishment limits

- Trigger below 0.35 zZEC, target approximately 1.2 zZEC.
- Do not convert while zZEC trades more than 1% below the reference price.
- At most 0.5 ETH per refill and 1 ETH per rolling 24 hours. Existing manual conversions recorded in sweeps.json count toward this ETH budget.
- Leave at least 1 ETH plus gas allowance in the keeper when beginning a conversion. Subsequent keeper buys can use that inventory.
- At least 15 minutes between conversion starts.
- Require quoted ZEC minimum worth at least 97% of the input at the checked reference prices, including a 1% swap slippage tolerance.
- Verify the exact Zcash payout at the immutable reserve address with three confirmations on two regional endpoints.
- Attest before minting. Mint only the conversion's reported amount that was independently received; extra payout dust stays in reserve.
- At most 1.5 zZEC per automatic mint and 3 zZEC per rolling 24 hours of automatic issuance.

These limits are enforced by local software. The existing minter key retains its underlying contract authority; this is not an on-chain restricted minting role. Zcash backing and fresh-attestation constraints still apply on-chain.

## Checks and recovery

Preview without unlocking or transferring anything:

```bash
cd ~/zeal-ops
npm run replenish
```

Keeper output: launchd/keeper.log. Background refill output is in launchd/refill-background.log; state is in launchd/refill.json. Conversion transfers are in sweeps.json. Managed signing records a pending transaction hash before broadcasting in launchd/wallet-*-pending.json. These runtime files survive installation.

An unresolved transaction blocks another send from the same wallet on that chain. An interrupted conversion, attestation or mint moves the refill job to attention instead of repeating the operation. Inspect the recorded transaction hashes and the on-chain outcome before repairing the state. Do not delete a ledger to make an error go away. A crash while creating a lock can require inspection of its owner.json.

The bridge and Zcash conversion are separate transactions. If the second quote fails its output floor, ETH remains on Arbitrum and the job requires reconciliation. The script does not automatically bridge back, re-spend or mint against a pending payout.

The background PID is recorded in launchd/refill-background.json. Before stopping it, check that no refill is currently transferring or minting; an interrupted job requires reconciliation. Foreground sessions can still be started with REFILL_ENABLED=1 npm run replenish:session and stopped with Ctrl-C. Stop the keeper with:

```bash
launchctl unload -w ~/Library/LaunchAgents/com.zealtoken.keeper.plist
```

Restart with launchctl load -w on the same plist. Edits belong in ~/zeal/zealtoken.com/ops; install with bash ops/launchd/install.sh from the repository root. Never overwrite live ledgers from a source checkout.
