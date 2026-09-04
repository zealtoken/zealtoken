import { CHAIN, CONTRACTS, FURNACE, LINKS, PONS_V2, TOKEN } from '../config'
import { stagger } from '../useReveal'

type Status = 'verified' | 'pending'
type Check = { t: string; d: string; v: string; status: Status; href?: string }

const src = (addr: string) => `${CONTRACTS.explorer}/address/${addr}?tab=contract`

const CHECKS: Check[] = [
  {
    t: 'The Foundry contract',
    d: 'No owner, no admin, no upgrade path. Split and destinations are immutable; routing is permissionless. Source verified on the explorer, byte for byte.',
    v: CONTRACTS.foundry ?? 'deployed at launch',
    status: CONTRACTS.foundry ? 'verified' : 'pending',
    href: CONTRACTS.foundry ? src(CONTRACTS.foundry) : undefined,
  },
  {
    t: 'The Tap contract',
    d: 'The Pons fee recipient. Anyone can call sweep() or pull(), and every wei goes to the Foundry. It cannot send anywhere else. Moving the recipient takes a 48-hour public timelock.',
    v: PONS_V2.tap ?? 'deployed at launch',
    status: PONS_V2.tap ? 'verified' : 'pending',
    href: PONS_V2.tap ? src(PONS_V2.tap) : undefined,
  },
  {
    t: 'The reserve address',
    d: 'A Zcash transparent address, published here. Shielded would be unauditable, which is the opposite of what a wrapper needs.',
    v: TOKEN.reserveAddress ?? 'published at reserve open',
    status: TOKEN.reserveAddress ? 'verified' : 'pending',
    href: TOKEN.reserveAddress ? LINKS.zcashExplorer + TOKEN.reserveAddress : undefined,
  },
  {
    t: `The ${TOKEN.wrapper} contract`,
    d: 'Attestor and minter are separate roles behind a 48-hour timelock. Minting can pause. Redemption never can.',
    v: CONTRACTS.zzec ?? 'deploys at reserve open',
    status: CONTRACTS.zzec ? 'verified' : 'pending',
    href: CONTRACTS.zzec ? src(CONTRACTS.zzec) : undefined,
  },
  {
    t: 'Coverage',
    d: `ZEC held ÷ ${TOKEN.wrapper} supply, both readable at any block. mint() reverts below 1.`,
    v: '≥ 1.00 enforced in code',
    status: CONTRACTS.zzec ? 'verified' : 'pending',
  },
  {
    t: 'The Furnace contract',
    d: `One outbound path: $${TOKEN.symbol} to ${FURNACE.burnShort}. Lifetime burns are a public counter and every burn is an event.`,
    v: CONTRACTS.furnace ?? `deploys with ${TOKEN.wrapper}`,
    status: CONTRACTS.furnace ? 'verified' : 'pending',
    href: CONTRACTS.furnace ? src(CONTRACTS.furnace) : undefined,
  },
]

const LIVE = CHECKS.filter((c) => c.status === 'verified').length

const LIMITS = [
  {
    t: `${TOKEN.wrapper} v1 is reserve-backed, not trustless.`,
    d: 'The contracts guarantee the split, the supply cap and the exit. A human attests the Zcash balance and the operator’s key holds it, at a published transparent address anyone can watch. Phase 04 hands that off to trust-minimized custody.',
  },
  {
    t: `${TOKEN.wrapper} is exposure, not shielding.`,
    d: `On ${CHAIN.name} it is a transparent ERC-20. Redeem to native ZEC and shield it there. That is what redemption is for.`,
  },
  {
    t: `$${TOKEN.symbol} is a memecoin with a job.`,
    d: 'Not equity, not a claim on the reserve. It funds the machine, and the machine burns it. Burns scale with wrapper volume, so they start small and compound.',
  },
]

export function Proof() {
  return (
    <>
      <section className="band" id="proof">
        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              Proof of reserve
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              Don’t trust us.
              <br />
              <span className="green">Check us.</span>
            </h2>
            <p className="lede" data-reveal style={stagger(2)}>
              Six things make every claim on this page checkable. {LIVE} are live and source-verified
              today. If one stops lining up, you will see it before we say a word.
            </p>
          </div>

          <div className="checks">
            {CHECKS.map((c, i) => (
              <article className="check" key={c.t} data-reveal style={stagger(i, 90)}>
                <div className="check-top">
                  <h3 className="h4">{c.t}</h3>
                  <span className={`tag ${c.status === 'verified' ? 'tag-live' : 'tag-wait'}`}>
                    <span className="dot" /> {c.status === 'verified' ? 'live · verified' : 'pending'}
                  </span>
                </div>
                <p>{c.d}</p>
                <div className="addr">
                  {c.href ? (
                    <a href={c.href} target="_blank" rel="noreferrer">
                      {c.v} <span className="addr-go">{c.href?.includes('zcash') ? 'watch it ↗' : 'read the source ↗'}</span>
                    </a>
                  ) : (
                    c.v
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="redeem" data-reveal>
            <div>
              <p className="eyebrow" data-reveal>
                The way out
              </p>
              <h3 className="h3">
                Burn {TOKEN.wrapper}, get native ZEC.
              </h3>
              <p>
                A wrapper nobody can leave is a trap. Burn {TOKEN.wrapper}, receive native ZEC to
                an address you control, shield it. The exit opens with the mint and never closes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- honest limits ---------------- */}
      <section className="band band-tint" id="limits">
        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              Straight answers
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              What is guaranteed.
              <br />
              What isn’t.
            </h2>
            <p className="lede" data-reveal style={stagger(2)}>
              Privacy people have been lied to by more wrappers than anyone. So here is the line,
              drawn exactly where it sits.
            </p>
          </div>
          <div className="grid g3 limits">
            {LIMITS.map((l, i) => (
              <div key={l.t} data-reveal style={stagger(i, 80)}>
                <h3 className="h4">{l.t}</h3>
                <p>{l.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
