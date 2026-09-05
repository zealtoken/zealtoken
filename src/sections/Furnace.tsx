import { FURNACE, TOKEN } from '../config'
import { EngravingScene } from '../art/EngravingScene'
import { StationStrip } from '../art/StationStrip'
import { stagger } from '../useReveal'

const STEPS = [
  {
    n: '01',
    t: 'Collect',
    d: `A hook on the ${TOKEN.wrapper} market takes 0.7% of every swap, whoever provides the liquidity, and hands it to the Furnace inside the same transaction. The other 0.3% pays liquidity providers.`,
    k: 'afterSwap: 0.7% → Furnace',
  },
  {
    n: '02',
    t: 'Ignite',
    d: `ignite() swaps what the Furnace holds into $${TOKEN.symbol}: ${TOKEN.wrapper} to ETH, ETH to $${TOKEN.symbol}, each leg capped at about 5% price impact and the whole run behind a minimum-output floor. The recipient is always the Furnace.`,
    k: 'ignite(minZealOut)',
  },
  {
    n: '03',
    t: 'Burn',
    d: `Everything the Furnace holds goes to ${FURNACE.burnShort}, an address with no private key. burn() is permissionless.`,
    k: `→ ${FURNACE.burnShort}`,
  },
  {
    n: '04',
    t: 'No exit',
    d: 'No withdraw, no rescue, no sweep. The only outbound transfer is the burn, and the test suite pins the ABI so that stays true.',
    k: '0 withdraw functions',
  },
]

export function Furnace() {
  return (
    <section className="band band-tint furnace" id="furnace">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>
            The second loop
          </p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            The Furnace.
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            {TOKEN.wrapper} is a market, and markets pay fees. The Furnace turns those fees into
            burned ${TOKEN.symbol}. It has one door.
          </p>
        </div>

        <EngravingScene
          srcSmall="/video/furnace-line-1100.mp4"
          srcLarge="/video/furnace-line-1600.mp4"
          poster="/video/furnace-line-poster.webp"
          posterSmall="/video/furnace-line-poster-sm.webp"
          ratio="1920 / 848"
          width={1600}
          height={706}
          alt="The Furnace line, station by station: 01 Trade, the wrapper gets used. 02 Collect, fees in WETH and zZEC flow to the Furnace. 03 Ignite, fees swapped to $ZEAL with a minimum output. 04 Burn, $ZEAL sent through one door to 0x…dEaD. 05 Supply, less $ZEAL exists."
        />
        <StationStrip which="furnace" />

        <div className="steps steps-4">
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
  )
}
