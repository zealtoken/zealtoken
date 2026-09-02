# zealtoken.com

Relaunch site for **$ZEAL** on Robinhood Chain — explains the wrapped-Zcash
mechanism ("The Foundry") end to end.

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
