# $ZEAL · the first wrapped Zcash on Robinhood Chain

$ZEAL is a memecoin with a job. Its creator fees on [Pons](https://www.ponsfamily.com/0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC)
fund a public Zcash reserve, and that reserve backs **zZEC**, a 1:1 wrapped ZEC
on Robinhood Chain (chain 4663). Fees from zZEC trading buy $ZEAL and burn it.
Everything that can be a contract is a contract, and every contract is verified.

## What is on chain today

| Piece | Address | Status |
|---|---|---|
| ZealFoundry · immutable 60/25/15 fee splitter, no owner | [`0xa1C1…85a6`](https://robinhoodchain.blockscout.com/address/0xa1C1Fb281cCC47C587565a01700bF61a03D885a6?tab=contract) | live · source verified |
| ZealTap · Pons fee recipient, one door to the Foundry | [`0xA0dA…E655`](https://robinhoodchain.blockscout.com/address/0xA0dAE8fe24BDfb2331A1D581dC47bE61c565E655?tab=contract) | live · source verified |
| ZZEC · 1:1 wrapped Zcash, attest → mint cap, redeem never pausable | [`contracts/contracts/ZZEC.sol`](contracts/contracts/ZZEC.sol) | written, tested, deploys at reserve open |
| ZealFurnace · zZEC fees → buy $ZEAL → burn | [`contracts/contracts/ZealFurnace.sol`](contracts/contracts/ZealFurnace.sol) | written, tested, being rebuilt for Uniswap V4 |

The live numbers on [zealtoken.com](https://zealtoken.com) are read straight
from these contracts over JSON-RPC. There is no backend to trust.

## Layout

- [`contracts/`](contracts) · Solidity 0.8.24, Hardhat, 65 tests. `npm test`.
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

## The one file you'll actually edit

`src/config.ts` is the single source of truth. Every number on the page is
derived from it, so the split, the worked example, the FAQ and the hero stats
can never disagree with each other.

| What | Where |
|---|---|
| Fee split (60 / 25 / 15) | `SPLIT` |
| Pons economics (1% pool fee, 70% creator) | `PONS` |
| `$ZEAL` contract address | `TOKEN.address` — currently `null`, shows "published at mint" |
| Zcash reserve address | `TOKEN.reserveAddress` — currently `null` |
| Socials, Telegram | `LINKS` |

Change `SPLIT[0].pct` and the headline "0.42% of every trade" recalculates
itself, along with the $4,200 line in the worked example. Don't hardcode those
numbers anywhere else.

## Things to fill in before launch

- `TOKEN.address` once the Pons launch is live
- `TOKEN.reserveAddress` once the multisig funds the Zcash t-address
- `LINKS.telegram` (currently `#`)
- The `pre-launch` pills in `src/sections/Proof.tsx` become live values

## The artwork

The zebra crew is one rigged SVG (`src/art/Zebra.tsx`) with named limb groups.
A pose is just a CSS animation on `.arm-l` / `.arm-r` / `.torso`, so adding a
new job on the factory floor means adding a `pose-*` rule in `styles.css`, not
drawing a new character.

`src/art/Foundry.tsx` is the factory scene. It's laid out on a fixed
`1300 × 584` grid: the floor line is `y=486`, the conveyor sits at `y=432`, and
workers are placed with `y={486 - w * 1.32}` so their feet land on the floor.

## Deploy

Hosted on Vercel, project `zealtoken`.

```bash
npx vercel --prod
```

### DNS (GoDaddy)

The domain is registered at GoDaddy and still uses GoDaddy nameservers
(`ns03/ns04.domaincontrol.com`). To cut zealtoken.com over to Vercel, edit the
DNS records in GoDaddy — do **not** change the nameservers unless you also want
to move email and every other record:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `76.76.21.21` | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |

The current `A @ → 185.158.133.1` (GoDaddy hosting) is what serves the old site;
replacing it is the switch. Certificates issue automatically once DNS resolves.
