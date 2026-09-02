import { CONTRACTS, FURNACE, TOKEN } from '../config'
import { stagger } from '../useReveal'

const STEPS = [
  {
    n: '01',
    t: 'Collect',
    d: `The Foundry seeds ${TOKEN.wrapper} liquidity from its 25% slice. That position earns trading fees, in WETH and ${TOKEN.wrapper}, on every ${TOKEN.wrapper} trade. Those fees are collected into the Furnace contract.`,
    k: 'LP fees → Furnace',
  },
  {
    n: '02',
    t: 'Ignite',
    d: `A keeper calls ignite(). The Furnace swaps the fee tokens for $${TOKEN.symbol} through the same pool $${TOKEN.symbol} trades in, with a minimum output so it cannot be sandwiched into a bad fill. The contract checks that the swap path ends in $${TOKEN.symbol} and that the recipient is itself.`,
    k: 'ignite(tokenIn, amountIn, minOut, path)',
  },
  {
    n: '03',
    t: 'Burn',
    d: `Every $${TOKEN.symbol} the Furnace holds is sent to ${FURNACE.burnShort}, an address with no private key. burn() is permissionless: anyone can pull the lever, and ignite() pulls it automatically at the end of every swap.`,
    k: `→ ${FURNACE.burnShort}`,
  },
  {
    n: '04',
    t: 'No exit',
    d: 'No withdraw. No rescue. No sweep. No owner path to the balance. The only outbound transfer the contract can make is $ZEAL to the burn address, and the test suite pins the ABI so nothing can be added quietly.',
    k: '0 withdraw functions',
  },
]

export function Furnace() {
  return (
    <section className="band band-ink" id="furnace">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>
            The second loop
          </p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            The Furnace.
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            {TOKEN.wrapper} is a market. Markets pay fees. The Furnace takes the fees from the{' '}
            {TOKEN.wrapper} liquidity the Foundry seeds, swaps them for ${TOKEN.symbol}, and sends
            that ${TOKEN.symbol} to an address nobody holds the key to. It has one door.
          </p>
        </div>

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

        <div className="furnace-sum" data-reveal>
          <div className="furnace-sum-row">
            <span className="mono">LOOP 01</span>
            <p>
              <strong>${TOKEN.symbol} volume</strong> pays the Foundry. The Foundry buys ZEC. The
              reserve grows and is never sold.
            </p>
          </div>
          <div className="furnace-sum-row">
            <span className="mono">LOOP 02</span>
            <p>
              <strong>{TOKEN.wrapper} volume</strong> pays the Furnace. The Furnace buys $
              {TOKEN.symbol}. The supply shrinks and is never reissued.
            </p>
          </div>
          <div className="furnace-sum-row furnace-sum-out">
            <span className="mono">RESULT</span>
            <p>
              The more the wrapper is used, the less ${TOKEN.symbol} exists. Both loops run in one
              direction. Neither has a reverse gear.
            </p>
          </div>
          <div className="furnace-sum-addr">
            <span className="mono">FURNACE</span>
            <span className="addr">{CONTRACTS.furnace ?? `deploys with ${TOKEN.wrapper}`}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
