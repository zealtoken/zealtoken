import { CHAIN, PONS, TOKEN } from '../config'
import { stagger } from '../useReveal'
import { Zebra } from '../art/Zebra'

const CHECKS = [
  {
    t: 'The reserve address',
    d: 'A Zcash transparent address, published here. Transparent on purpose — a shielded reserve would be unauditable, which is the opposite of what a wrapper needs.',
    v: TOKEN.reserveAddress ?? 'published at reserve open',
  },
  {
    t: `${TOKEN.wrapper} total supply`,
    d: `Readable on ${CHAIN.name} by anyone, at any block. There is no off-chain supply.`,
    v: TOKEN.address ?? 'published at mint',
  },
  {
    t: 'Coverage ratio',
    d: `ZEC held ÷ ${TOKEN.wrapper} outstanding. The mint function reverts if this would drop below 1. That is enforced in code, not in a promise.`,
    v: '≥ 1.00 enforced on mint',
  },
  {
    t: 'The fee redirect',
    d: `The Pons locker records where each token's creator fees go. Ours points at the Foundry contract. You can read it from the locker without trusting a screenshot.`,
    v: PONS.lockerContract,
  },
]

const LIMITS = [
  {
    t: `${TOKEN.wrapper} v1 is reserve-backed, not trustless.`,
    d: 'The reserve sits in a multisig. Signers and threshold are published before the first mint. That is a real trust assumption and we are not going to dress it up as something else.',
  },
  {
    t: `${TOKEN.wrapper} gives you exposure, not shielding.`,
    d: `On ${CHAIN.name} it is an ordinary transparent ERC-20 — every transfer is visible, like every other token on that chain. Privacy is what you get when you redeem to native ZEC and shield it there.`,
  },
  {
    t: `$${TOKEN.symbol} is a memecoin with a job.`,
    d: 'It is not equity, not a security, not a claim on the reserve, and holding it does not entitle you to ZEC. It funds the machine. The machine is the point.',
  },
  {
    t: 'The reserve only goes one way.',
    d: 'ZEC bought by the Foundry is not sold to pay for anything. The operations slice exists precisely so nobody ever has a reason to raid the vault.',
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
              Four numbers make this whole thing falsifiable. If any of them stops lining up, you
              will be able to see it before we say anything.
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
                A wrapper nobody can leave is not a wrapper, it is a trap. Redemption opens with
                the mint: burn {TOKEN.wrapper} on {CHAIN.name}, receive native ZEC to a Zcash
                address you control, shield it if you want to. The reserve exists to be drawn on.
              </p>
            </div>
            <div className="redeem-art">
              <Zebra pose="lever" delay={0} style={{ width: 104 }} />
              <Zebra pose="haul" delay={0.5} flip style={{ width: 92 }} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- flywheel ---------------- */}
      <section className="band band-tint band-tight" id="flywheel">
        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              Why it compounds
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              The loop.
            </h2>
          </div>
          <ol className="loop">
            {[
              [`$${TOKEN.symbol} trades`, 'Volume happens. Fees are collected automatically by the pool.'],
              ['The Foundry fills', `${PONS.creatorSharePct}% of every fee arrives without anyone pressing a button.`],
              ['ZEC is bought', 'The reserve grows. It is never sold back.'],
              [`${TOKEN.wrapper} deepens`, `More reserve and more paired liquidity means a market people can actually use.`],
              ['Utility arrives', `${CHAIN.name} gets a privacy asset it did not have yesterday.`],
              ['More reason to trade', 'Which starts the loop again, one notch bigger.'],
            ].map(([t, d], i) => (
              <li key={t} data-reveal style={stagger(i, 80)}>
                <span className="loop-n mono">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="h4">{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
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
              What this is,
              <br />
              and what it isn’t.
            </h2>
            <p className="lede" data-reveal style={stagger(2)}>
              Privacy people have been lied to by more wrappers than most. Here is the honest
              version, up front, where it is inconvenient.
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
