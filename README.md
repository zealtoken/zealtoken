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
| ZZEC · 1:1 wrapped Zcash, attest → mint cap, redeem never pausable | [`contracts/contracts/ZZEC.sol`](contracts/contracts/ZZEC.sol) | written, tested, deploys at reserve open |
| ZealFurnace · zZEC fees → buy $ZEAL → burn | [`contracts/contracts/ZealFurnace.sol`](contracts/contracts/ZealFurnace.sol) | written, tested, being rebuilt for Uniswap V4 |

The live numbers on [zealtoken.com](https://zealtoken.com) are read straight
from these contracts over JSON-RPC. There is no backend to trust.

## Layout

- [`contracts/`](contracts) · Solidity 0.8.24, Hardhat, 74 tests. `npm test`.
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

## Status

Phase 00 (launch) is live. Phase 01 opens when the reserve address is published
and the first ETH → ZEC conversion lands. The dated build log on
[zealtoken.com](https://zealtoken.com#phases) lists only things that have already
happened, each linked to verified source.
