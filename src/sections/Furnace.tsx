import { FURNACE, TOKEN } from '../config'
import { EngravingScene } from '../art/EngravingScene'
import { stagger } from '../useReveal'

const STEPS = [
  {
    n: '01',
    t: 'Collect',
    d: `The Foundry seeds ${TOKEN.wrapper} liquidity. That position earns a fee on every ${TOKEN.wrapper} trade, and those fees flow to the Furnace.`,
    k: 'LP fees → Furnace',
  },
  {
    n: '02',
    t: 'Ignite',
    d: `ignite() swaps the fees for $${TOKEN.symbol} with a minimum output, so it cannot be sandwiched. The path must end in $${TOKEN.symbol}; the recipient is always the Furnace.`,
    k: 'ignite(tokenIn, amountIn, minOut, path)',
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
          ratio="1920 / 1088"
          width={1600}
          height={906}
          alt="The Furnace line, station by station: 01 Trade, the wrapper gets used. 02 Collect, fees in WETH and zZEC flow to the Furnace. 03 Ignite, fees swapped to $ZEAL with a minimum output. 04 Burn, $ZEAL sent through one door to 0x…dEaD. 05 Supply, less $ZEAL exists."
        />

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
