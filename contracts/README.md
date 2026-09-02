# Zeal contracts

Two contracts on Robinhood Chain (chain `4663`).

> Naming collision warning: the toolchain here is Hardhat, not Foundry. "The
> Foundry" in this repo always means `ZealFoundry.sol`, the fee splitter.

```bash
npm install
npm test            # 40 tests
npm run build       # hardhat compile
```

## ZealFoundry.sol — the fee splitter

Receives the $ZEAL creator-fee stream from the Pons locker and splits it
60 / 25 / 15 into reserve, zZEC liquidity, and operations.

**It has no owner, no admin, no pause, no upgrade path and no rescue function.**
That is deliberate and it is the load-bearing property. The website tells people
the split is enforced by code rather than by promise; this is what has to be
true for that to be honest.

| Property | How it's enforced |
|---|---|
| Split is fixed | `immutable` basis points, validated to sum to 10000 at deploy |
| Reserve share can't be redirected | `reserveSink` is `immutable` with no setter anywhere |
| Nobody controls timing | `route()` is permissionless — anyone can call it |
| Dust favours the reserve | reserve takes the remainder after the other two floor-divide |
| No half-routed states | `nonReentrant`, and a rejecting sink reverts the whole tx |

Fees arrive as plain ERC-20 transfers from the locked LP position (WETH and
$ZEAL), which trigger no callback, so accounting is pull-based: `route(token)`
reads the current balance and splits whatever it finds.

### Known, accepted limitations

- **Fee-on-transfer tokens** would make the emitted `Routed` amounts overstate
  what the sinks actually received. WETH and $ZEAL are not fee-on-transfer.
- **A permanently reverting sink bricks that token.** Sinks are immutable, so if
  one is a contract that can never accept a transfer, that token can never be
  routed. Use EOAs or Safes, and test each sink on testnet first.

## ZZEC.sol — the wrapper

8 decimals, matching Zcash's zatoshi, so the peg is a literal 1:1 integer
relationship with no scaling anywhere.

**Guaranteed in code:**

- `totalSupply()` can never exceed the attested reserve — `mint()` reverts
- minting against a stale attestation reverts (window bounded to 1h–7d)
- attestor and minter are separate roles; one compromised key can't both inflate
  the reported reserve and mint against it
- rotating either role takes a **48-hour timelock**
- pausing minting is **instant**, so the response to a compromised attestor is
  "brake now, rotate over two days", not "wait two days while it's abused"
- `requestRedeem()` has no pause, no role check and no minimum. The exit is never
  closed — not when minting is paused, not when the attestation is stale
- the reserve address is set at deployment and has no setter

**Not guaranteed, and this is the real trust assumption:**

- that the attested number matches the actual Zcash balance. A human posts it.
  Anyone can check it against the published transparent address — which is
  exactly why the reserve is a t-address rather than a shielded one.
- that a redemption is honoured. Burning emits `RedemptionRequested`; an operator
  sends native ZEC. That leg is off-chain because Zcash is not an EVM chain.

Attestations are deliberately allowed to report a reserve *below* current supply.
Blocking that would only prevent honest reporting of a bad state; the contract
emits `CoverageBreach` instead so the failure is loud, public and indexable.

## Deploying

Copy `.env.example` to `.env` and fill in every value. The script refuses to run
on a missing or malformed one rather than guessing — most of these are immutable
after deployment.

```bash
npm run deploy:testnet    # do this first, always
npm run deploy:mainnet
```

The script hard-fails if the three sinks aren't distinct, if the attestor equals
the minter, or if the Zcash reserve address isn't transparent (`t1`/`t3`).

It writes `deployments/<network>.json`. Paste both addresses into `src/config.ts`
on the website (`CONTRACTS.foundry`, `CONTRACTS.zzec`) — the proof cards read from
there and currently render "deployed at launch" placeholders.

### Order of operations at launch

1. Deploy both contracts on **testnet**, exercise route / attest / mint / redeem
2. Deploy on mainnet
3. Set the Pons fee redirect for $ZEAL to the `ZealFoundry` address
4. Fund the Zcash reserve, then post the **first attestation** — minting reverts
   until one exists
5. Only then mint the first zZEC
6. Verify both on https://robinhoodchain.blockscout.com

## Before this holds real money

These contracts are small, unaudited and deliberately boring, but "unaudited" is
the operative word. Get an external review before the reserve is worth more than
the review costs.
