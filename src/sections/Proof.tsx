import { CHAIN, CONTRACTS, FURNACE, TOKEN } from '../config'
import { stagger } from '../useReveal'

const CHECKS = [
  {
    t: 'The reserve address',
    d: 'A Zcash transparent address, published here. Shielded would be unauditable, which is the opposite of what a wrapper needs.',
    v: TOKEN.reserveAddress ?? 'published at reserve open',
  },
  {
    t: 'Coverage',
    d: `ZEC held ÷ ${TOKEN.wrapper} supply, both readable at any block. mint() reverts below 1.`,
    v: '≥ 1.00 enforced on mint',
  },
  {
    t: 'The Foundry contract',
    d: 'No owner, no admin, no upgrade path. Split and destinations are immutable; routing is permissionless. The Pons locker shows the fee redirect pointing here.',
    v: CONTRACTS.foundry ?? 'deployed at launch',
  },
  {
    t: `The ${TOKEN.wrapper} contract`,
    d: 'Attestor and minter are separate roles behind a 48-hour timelock. Minting can pause. Redemption never can.',
    v: CONTRACTS.zzec ?? 'deployed at mint',
  },
  {
    t: 'The Furnace contract',
    d: `One outbound path: $${TOKEN.symbol} to ${FURNACE.burnShort}. Lifetime burns are a public counter and every burn is an event.`,
    v: CONTRACTS.furnace ?? `deployed with ${TOKEN.wrapper}`,
  },
]

const LIMITS = [
  {
    t: `${TOKEN.wrapper} v1 is reserve-backed, not trustless.`,
    d: 'The contracts guarantee the split, the supply cap and the exit. A human attests the Zcash balance and a multisig holds it, with signers published before the first mint. Phase 04 hands that off to trust-minimized custody.',
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
              Five things make every claim on this page checkable. If one stops lining up, you
              will see it before we say a word.
            </p>
          </div>

          <div className="checks">
            {CHECKS.map((c, i) => (
              <article className="check" key={c.t} data-reveal style={stagger(i, 90)}>
                <div className="check-top">
                  <h3 className="h4">{c.t}</h3>
                  <span className="tag tag-live">
                    <span className="dot" /> pre-launch
                  </span>
                </div>
                <p>{c.d}</p>
                <div className="addr">{c.v}</div>
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
      <section className="band" id="limits">
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
          <div className="grid g2 limits">
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
