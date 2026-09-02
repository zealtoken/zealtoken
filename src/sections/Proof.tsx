import { CHAIN, CONTRACTS, FURNACE, PONS, TOKEN } from '../config'
import { stagger } from '../useReveal'

const CHECKS = [
  {
    t: 'The reserve address',
    d: 'A Zcash transparent address, published here. Transparent on purpose. A shielded reserve would be unauditable, which is the opposite of what a wrapper needs.',
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
    d: `The Pons locker records where each token’s creator fees go. Ours points at the Foundry contract. You can read it from the locker without trusting a screenshot.`,
    v: PONS.lockerContract,
  },
  {
    t: 'The Foundry contract',
    d: 'Has no owner, no admin, no pause and no upgrade path. The split and all three destinations are immutable constructor arguments, so nothing, not a key and not us, can send the reserve share anywhere else. Routing is permissionless: anyone can push the queue.',
    v: CONTRACTS.foundry ?? 'deployed at launch',
  },
  {
    t: `The ${TOKEN.wrapper} contract`,
    d: 'Attestor and minter are separate roles, rotating either takes a 48-hour timelock, and the reserve address has no setter. Minting is pausable; redemption is not, and never will be.',
    v: CONTRACTS.zzec ?? 'deployed at mint',
  },
  {
    t: 'The Furnace contract',
    d: `No withdraw, no rescue, no sweep, no owner path to the balance. The only address it can send $${TOKEN.symbol} to is ${FURNACE.burnShort}. Lifetime burns are a public counter, totalZealBurned(), and every burn is an event.`,
    v: CONTRACTS.furnace ?? `deployed with ${TOKEN.wrapper}`,
  },
]

const LIMITS = [
  {
    t: `${TOKEN.wrapper} v1 is reserve-backed, not trustless.`,
    d: 'The contracts guarantee the split, the supply cap and the exit. They cannot guarantee that the attested number matches the real Zcash balance. A human posts that, and the buy-and-bridge leg happens off-chain because Zcash is not an EVM chain. The reserve sits in a multisig whose signers and threshold are published before the first mint. That is a real trust assumption and we are not going to dress it up as something else.',
  },
  {
    t: `${TOKEN.wrapper} gives you exposure, not shielding.`,
    d: `On ${CHAIN.name} it is an ordinary transparent ERC-20. Every transfer is visible, like every other token on that chain. Privacy is what you get when you redeem to native ZEC and shield it there.`,
  },
  {
    t: `$${TOKEN.symbol} is a memecoin with a job.`,
    d: 'It is not equity, not a security, not a claim on the reserve, and holding it does not entitle you to ZEC. It funds the machine. The machine is the point.',
  },
  {
    t: 'Burns scale with the wrapper, not with hype.',
    d: `The Furnace is fed by ${TOKEN.wrapper} trading fees, not by $${TOKEN.symbol} trading fees. Early on, ${TOKEN.wrapper} volume will be small and so will the burns. We publish the counter. We do not publish projections.`,
  },
  {
    t: 'The swap needs a price-aware caller.',
    d: `ignite() is a role, because a swap needs a minimum output and a sane path, and a contract cannot judge either alone. A bad igniter can get a bad fill; it cannot get the tokens, because the swap recipient is always the Furnace and the Furnace only sends to the burn address. Rotating the role takes ${FURNACE.roleTimelockHours} hours. burn() itself needs no trust and no role.`,
  },
  {
    t: 'The reserve only goes one way.',
    d: 'The reserve share cannot be redirected, because the destination is burned into the Foundry contract at deployment and there is no function that changes it. Rounding dust goes to the reserve rather than to operations. The operations slice exists precisely so nobody ever has a reason to raid the vault.',
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
              Seven things make this falsifiable. If any of them stops lining up, you will see it
              before we say anything.
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
              Two loops.
              <br />
              One direction.
            </h2>
          </div>
          <ol className="loop">
            {[
              [`$${TOKEN.symbol} trades`, `${PONS.creatorSharePct}% of every fee reaches the Foundry without anyone pressing a button.`],
              ['ZEC is bought', 'The reserve grows. It is never sold back.'],
              [`${TOKEN.wrapper} mints`, `One per ZEC held, paired into liquidity on ${CHAIN.name}. A privacy asset the chain did not have yesterday.`],
              [`${TOKEN.wrapper} trades`, 'The wrapper gets used. The pool it trades in pays fees.'],
              [`$${TOKEN.symbol} burns`, `The Furnace swaps those fees for $${TOKEN.symbol} and sends it to ${FURNACE.burnShort}.`],
              ['Supply tightens', `Same demand, fewer tokens. Which starts both loops again, one notch bigger.`],
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
