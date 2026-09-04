import { EngravingScene } from '../art/EngravingScene'
import { StationStrip } from '../art/StationStrip'
import { FoundryCalc } from './Calculators'
import { CHAIN, FOUNDRY_TAKE_PCT, PONS, SPLIT, TOKEN } from '../config'
import { stagger } from '../useReveal'

const STEPS = [
  {
    n: '01',
    t: 'Intake',
    d: `Every $${TOKEN.symbol} trade on Pons pays a ${PONS.poolFeePct.toFixed(2)}% pool fee. ${PONS.creatorSharePct}% of that is the creator share.`,
    k: `${PONS.poolFeePct.toFixed(2)}% → ${FOUNDRY_TAKE_PCT.toFixed(2)}%`,
  },
  {
    n: '02',
    t: 'Redirect',
    d: 'The creator share goes to the Foundry contract, which splits it to three published wallets. No owner, no admin, no upgrade path.',
    k: 'feeRedirects(token)',
  },
  {
    n: '03',
    t: 'Split',
    d: 'The split is an immutable constructor argument. Rounding dust goes to the reserve.',
    k: SPLIT.map((s) => `${s.pct}`).join(' / '),
  },
  {
    n: '04',
    t: 'Smelt',
    d: 'The reserve share is swapped from WETH into native ZEC over NEAR Intents, the rail Zcash’s own wallet uses.',
    k: 'WETH → native ZEC',
  },
  {
    n: '05',
    t: 'Reserve',
    d: 'The ZEC lands in a published transparent address. Anyone can check the balance without asking us.',
    k: 'public t-address',
  },
  {
    n: '06',
    t: 'Mint',
    d: `${TOKEN.wrapper} is minted one per ZEC held and paired into liquidity on ${CHAIN.name}. The mint reverts past the last attested reserve.`,
    k: `1 ZEC = 1 ${TOKEN.wrapper}`,
  },
]

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
              {CHAIN.name} is where tokenized stocks and stablecoins live. Everything on it is
              owned in the open. The one asset it is missing is the oldest privacy coin in crypto,
              because Zcash does not speak EVM.
            </p>
            <p data-reveal style={stagger(3)}>
              <strong>Zeal puts it there first</strong>, and builds the machine that pays for it
              out of trading volume instead of a treasury.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- the foundry ---------------- */}
      <section className="band foundry" id="foundry">

        <div className="wrap">
          <div className="sec-head">
            <p className="eyebrow" data-reveal>
              The first loop
            </p>
            <h2 className="h2" data-reveal style={stagger(1)}>
              The Foundry.
            </h2>
            <p className="lede" data-reveal style={stagger(2)}>
              Every ${TOKEN.symbol} trade pays a fee. {PONS.creatorSharePct}% of it goes to a
              contract that can only split it 60/25/15 to three published wallets. We convert the reserve share to ZEC, and every conversion is logged. Re-pointing the fee stream takes a 48-hour public notice.
            </p>
          </div>
        </div>

        <EngravingScene
          srcSmall="/video/foundry-line-1100.mp4"
          srcLarge="/video/foundry-line-1600.mp4"
          poster="/video/foundry-line-poster.webp"
          posterSmall="/video/foundry-line-poster-sm.webp"
          ratio="1728 / 852"
          width={1600}
          height={788}
          alt="The Foundry line, station by station: 01 Intake, every trade pays in. 02 Split, fixed allocation of 60% ZEC reserve, 25% zZEC liquidity, 15% operations. 03 Smelt, fees become real ZEC via NEAR Intents. 04 Reserve, public and auditable. 05 Mint, zZEC issued 1:1 and backed."
        />
        <StationStrip which="foundry" />

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
      <section className="band band-tight" id="math">
        <div className="wrap-narrow">
          <FoundryCalc />
        </div>
      </section>
    </>
  )
}
