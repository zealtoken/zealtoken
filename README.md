# $ZEAL · the first wrapped Zcash on Robinhood Chain

[![ci](https://github.com/zealtoken/zealtoken/actions/workflows/ci.yml/badge.svg)](https://github.com/zealtoken/zealtoken/actions/workflows/ci.yml)

$ZEAL is a memecoin with a job. Its creator fees on [Pons](https://www.ponsfamily.com/0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC)
fund a public Zcash reserve, and that reserve backs **zZEC**, a 1:1 wrapped ZEC
on Robinhood Chain (chain 4663). Fees from zZEC trading buy $ZEAL and burn it.
Everything that can be a contract is a contract, and every contract is verified.

## What is on chain today

| Piece | Address | Status |
|---|---|---|
| ZealFoundry · immutable 60/25/15 fee splitter, no owner | [`0xa1C1…85a6`](https://robinhoodchain.blockscout.com/address/0xa1C1Fb281cCC47C587565a01700bF61a03D885a6?tab=contract) | live · source verified |
| ZealTapV2 · Pons fee recipient; sweeps its own pool, one door to the Foundry | [`0x9F5b…bB47`](https://robinhoodchain.blockscout.com/address/0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47?tab=contract) | live · source verified |
| ZealTap v1 · first edition, superseded before it was ever the recipient | [`0xA0dA…E655`](https://robinhoodchain.blockscout.com/address/0xA0dAE8fe24BDfb2331A1D581dC47bE61c565E655?tab=contract) | live · source verified |
| ZZEC · 1:1 wrapped Zcash, attest → mint cap, redeem never pausable | [`0x0b15…E402`](https://robinhoodchain.blockscout.com/address/0x0b151Ff7a7c5250130EC16C275790961d558E402?tab=contract) | live · source verified · minted against a real reserve |
| ZealFurnaceV4 · zZEC fees → ETH → $ZEAL → burn, on Uniswap v4 | [`0x72C2…7E70`](https://robinhoodchain.blockscout.com/address/0x72C2f71dC3c0058974fd59039F9A79397bf87E70?tab=contract) | live · source verified · burning |
| ZealBurnHook · v4 hook, 0.7% of every zZEC swap to the Furnace, no owner | [`0x1664…0044`](https://robinhoodchain.blockscout.com/address/0x16642362837e2FDC02fF1ECF71f5629c094B0044?tab=contract) | live · source verified |
| RedemptionDesk · escrow zZEC, get native ZEC automatically (live since Sep 6) | [`0x9A1f…cA1a`](https://robinhoodchain.blockscout.com/address/0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a?tab=contract) | live · source verified |
| WrapDesk · send ZEC, get zZEC 1:1; becomes the minter after a 48h timelock | [`0xb53E…E118`](https://robinhoodchain.blockscout.com/address/0xb53E3CD58668D1fC9082b51a7d74879733e9E118?tab=contract) | live · source verified · minter rotation pending |

The live numbers on [zealtoken.com](https://zealtoken.com) are read straight
from these contracts over JSON-RPC in the browser. The one server-side piece is
`/api/reserve`, which relays the reserve's transparent balance from a Zcash
lightwalletd node because browsers cannot speak gRPC. It holds no keys.

## Layout

- [`contracts/`](contracts) · Solidity 0.8.24, Hardhat, 104 unit tests plus a full launchpad lifecycle on a mainnet fork. `npm test`.
- [`ops/`](ops) · the reserve operator: attests the Zcash balance, mints zZEC
  up to it, honours redemptions, sweeps ETH → ZEC. Nothing here can move
  funds without a passphrase-unlocked key.
- `src/` · the site. Vite + React + TypeScript, no UI framework.

## How zZEC stays honest

- The reserve is a **transparent** Zcash address, published before the first mint.
- `mint()` reverts above the attested reserve and on a stale attestation.
- Attestor and minter are separate keys; role changes sit behind a 48-hour timelock.
- Minting can pause. Redemption never can.

## Site

Vite + React + TypeScript. No UI framework, no animation library: the motion is
CSS plus one IntersectionObserver.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
```

`src/config.ts` is the single source of truth. Every number on the page is
derived from it: the split, the worked example, the calculators, the FAQ and the
ledger all recompute from the same constants, so they can never disagree.

The live ledger (`src/sections/Ledger.tsx`) batches `eth_call`s straight to the
Robinhood Chain RPC every 15 seconds. Selectors are precomputed from the compiled
ABIs in `contracts/`; there is no indexer and no server.

## zealz.fun · the launchpad (built, tested, not yet deployed)

[zealz.fun](https://zealz.fun) launches tokens paired with zZEC straight into a
locked Uniswap v4 pool. Contracts live in
[`contracts/contracts/zealz/`](contracts/contracts/zealz) and are exercised end
to end on a fork of the live chain by
[`ZealzFork.test.ts`](contracts/test/ZealzFork.test.ts):

- **ZealzFactory** · one transaction: mint one billion tokens, open the pool,
  put the whole supply into one single-sided locked range, hand the position to
  the locker. The creator holds zero. Launch fee 0.005 zZEC.
- **ZealzHook** · the creator's fee (1% to 5%) comes off the zZEC leg of every
  trade: at least 0.5% buys back and burns $ZEAL, at most 0.5% to the creator,
  0.5% to the platform, the rest to holders. Optional ten minute batch opening
  where every buy is a bid and everyone pays one price.
- **ZealzToken** · fixed supply, no owner, and a dividend ledger: holders claim
  their share of every trade in zZEC.
- **ZealzLocker** · holds every position forever; anyone can compound its LP
  fees back in; there is no withdraw.
- Buying with ETH routes through the zZEC market in one router transaction,
  proven on the fork as a buy and as a bid.

The mechanism, every number and every open risk:
[zealtoken.com/docs/#/launchpad](https://zealtoken.com/docs/#/launchpad).

## Status

Reserve, market, Furnace, burn hook and automatic redemptions are live. The
wrap desk becomes the minter after its timelock. The launchpad is built and
fork-tested and deploys on a date still to be set. The dated build log on
[zealtoken.com](https://zealtoken.com#phases) lists only things that have
already happened, each linked to verified source. Nothing here is audited.

## License

MIT. See [LICENSE](LICENSE).
