import { EngravingScene } from '../art/EngravingScene'
import {
  CHAIN,
  FOUNDRY_TAKE_PCT,
  PONS,
  RESERVE_TAKE_PCT,
  SPLIT,
  TOKEN,
} from '../config'
import { stagger } from '../useReveal'

const STEPS = [
  {
    n: '01',
    t: 'Intake',
    d: `Every buy and every sell of $${TOKEN.symbol} on Pons pays a ${PONS.poolFeePct.toFixed(2)}% pool fee. Pons keeps ${100 - PONS.creatorSharePct}%. The other ${PONS.creatorSharePct}% is the creator share.`,
    k: `${PONS.poolFeePct.toFixed(2)}% → ${FOUNDRY_TAKE_PCT.toFixed(2)}%`,
  },
  {
    n: '02',
    t: 'Redirect',
    d: 'That creator share does not land in a founder wallet. Pons lets the fee recipient be a contract, so it points at the Foundry — which has no owner, no admin and no upgrade path, and can only do the things below.',
    k: 'feeRedirects(token)',
  },
  {
    n: '03',
    t: 'Split',
    d: 'The Foundry splits everything that arrives on a fixed schedule. The percentages are immutable constructor arguments — not a setting, not a blog post. Rounding remainders go to the reserve.',
    k: SPLIT.map((s) => `${s.pct}`).join(' / '),
  },
  {
    n: '04',
    t: 'Smelt',
    d: 'The reserve share is swapped out of WETH into native ZEC through NEAR Intents — the same rail Zcash’s own Zashi wallet uses. Real coins, on the real Zcash chain.',
    k: 'WETH → native ZEC',
  },
  {
    n: '05',
    t: 'Reserve',
    d: 'The ZEC settles into a published Zcash transparent address held by a multisig. Transparent on purpose: anyone can check the balance any time without asking us.',
    k: 'public t-address',
  },
  {
    n: '06',
    t: 'Mint',
    d: `${TOKEN.wrapper} is minted against that balance, one token per ZEC held, and paired into liquidity on ${CHAIN.name}. Supply can never exceed the reserve.`,
    k: `1 ZEC = 1 ${TOKEN.wrapper}`,
  },
]

function Money() {
  const vol = 1_000_000
  const rows = SPLIT.map((s) => ({
    label: s.label,
    note: s.note,
    pct: s.pct,
    usd: (vol * PONS.poolFeePct * PONS.creatorSharePct * s.pct) / 1_000_000,
  }))
  return (
    <div className="money" data-reveal>
      <div className="money-head">
        <span className="mono">WORKED EXAMPLE</span>
        <h3 className="h3">
          For every <span className="green">$1,000,000</span> traded
        </h3>
      </div>
      <div className="money-rows">
        <div className="money-row money-row-top">
          <span>Pool fee at {PONS.poolFeePct.toFixed(2)}%</span>
          <span className="mono">$10,000</span>
        </div>
        <div className="money-row money-row-top">
          <span>Creator share ({PONS.creatorSharePct}%) → the Foundry</span>
          <span className="mono">${(vol * FOUNDRY_TAKE_PCT / 100).toLocaleString()}</span>
        </div>
        {rows.map((r, i) => (
          <div className="money-row" key={r.label} style={stagger(i)}>
            <span>
              <em className="green">{r.pct}%</em> {r.label}
              <small>{r.note}</small>
            </span>
            <span className="mono">${r.usd.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <p className="money-foot">
        <strong className="green">{RESERVE_TAKE_PCT.toFixed(2)}%</strong> of all volume, forever,
        converts into Zcash that the project holds and publishes. It never converts back.
      </p>
    </div>
  )
}

export function Mechanism() {
  return (
    <>
      {/* ---------------- the gap ---------------- */}
      <section className="band" id="gap">
        <div className="wrap split">
          <div>
            <p className="eyebrow" data-reveal>
              The gap
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              A chain full of assets,
              <br />
              with nowhere to be private.
            </h2>
          </div>
          <div>
            <p className="lede" data-reveal style={stagger(2)}>
              {CHAIN.name} went live on {CHAIN.stack}, settling to {CHAIN.settles}, built for
              tokenized equities, stablecoins and real-world assets. It is an EVM chain full of
              things you can own in the open.
            </p>
            <p data-reveal style={stagger(3)}>
              What it does not have is the oldest serious privacy asset in crypto. Zcash lives on
              its own L1. Its shielded pool does not speak EVM, and no amount of wanting changes
              that. Today you can hold a tokenized stock on Robinhood Chain. You cannot hold ZEC.
            </p>
            <p data-reveal style={stagger(4)}>
              <strong>Zeal is the crew that closes that gap</strong> — and the mechanism that pays
              for the closing.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- the foundry ---------------- */}
      <section className="band band-tint" id="foundry">
        <div className="stripes" />

        <EngravingScene
          srcSmall="/video/foundry-1024.mp4"
          srcLarge="/video/foundry-1600.mp4"
          poster="/video/foundry-poster.webp"
          posterSmall="/video/foundry-poster-sm.webp"
          alt="An engraved view of the Zeal Foundry: zebra crews working a refinery, ZEC coins riding conveyors out of the smelter, and a freight train hauling them to the reserve."
          caption="The Foundry · Plate I"
          focus="center 56%"
        />

        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              The mechanism
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              The Foundry.
            </h2>
            <p className="lede" data-reveal style={stagger(2)}>
              Every trade pays a fee. Pons hands us {PONS.creatorSharePct}% of it. We do not keep
              it — we spend it on Zcash, in public, on a schedule nobody can quietly change.
            </p>
          </div>
        </div>

        <div className="wrap">
          <EngravingScene
            variant="plate"
            ratio="1920 / 1088"
            srcSmall="/video/line-1100.mp4"
            srcLarge="/video/line-1600.mp4"
            poster="/video/line-poster.webp"
            posterSmall="/video/line-poster-sm.webp"
            alt="The Foundry line, station by station: 01 Intake, every trade pays in. 02 Split, fixed allocation of 60% ZEC reserve, 25% zZEC liquidity, 15% operations. 03 Smelt, fees become real ZEC via NEAR Intents. 04 Reserve, public and auditable. 05 Mint, zZEC issued 1:1 and backed."
            caption="The Foundry · Plate II — the line"
          />
        </div>

        <div className="wrap">
          <div className="steps">
            {STEPS.map((s, i) => (
              <article className="step" key={s.n} data-reveal style={stagger(i, 80)}>
                <div className="step-n mono">{s.n}</div>
                <h3 className="h4">{s.t}</h3>
                <p>{s.d}</p>
                <div className="step-k mono">{s.k}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- the math ---------------- */}
      <section className="band band-tint band-tight" id="math">
        <div className="wrap-narrow">
          <Money />
        </div>
      </section>
    </>
  )
}
