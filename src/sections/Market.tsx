import { useEffect, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, TOKEN, ZZEC_MARKET } from '../config'
import { readBatchRaw, hexToBig, word } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * The zZEC market: where to buy it, how to provide liquidity, and what the
 * pool looks like right now, read from Uniswap's StateView on chain.
 */
const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const SEL_SLOT0 = '0xc815641c' // getSlot0(bytes32)
const SEL_LIQ = '0xfa6793d5' // getLiquidity(bytes32)

type Pool = { ethDepth: number; zzecDepth: number; priceEth: number; fairEth: number | null; zecUsd: number | null; ethUsd: number | null }

async function readPool(signal: AbortSignal): Promise<Pool> {
  const id = ZZEC_MARKET.poolId.slice(2)
  const [slot0, liq] = await readBatchRaw([{ to: STATE_VIEW, data: SEL_SLOT0 + id }, { to: STATE_VIEW, data: SEL_LIQ + id }], signal)
  const sqrt = Number(hexToBig(word(slot0, 0))) / 2 ** 96
  const L = Number(hexToBig(liq))
  const ethDepth = L / sqrt / 1e18
  const zzecDepth = (L * sqrt) / 1e8
  const priceEth = zzecDepth > 0 ? ethDepth / zzecDepth : 0
  let zecUsd: number | null = null, ethUsd: number | null = null
  try {
    const spot = async (p: string) => Number(((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`, { signal })).json()) as { data: { amount: string } }).data.amount)
    ;[zecUsd, ethUsd] = await Promise.all([spot('ZEC-USD'), spot('ETH-USD')])
  } catch {
    /* price feed optional */
  }
  return { ethDepth, zzecDepth, priceEth, fairEth: zecUsd && ethUsd ? zecUsd / ethUsd : null, zecUsd, ethUsd }
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function Market() {
  const [pool, setPool] = useState<Pool | null>(null)
  useEffect(() => {
    const ctrl = new AbortController()
    const run = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        setPool(await readPool(ctrl.signal))
      } catch {
        /* keep last */
      }
    }
    void run()
    const t = window.setInterval(run, 20_000)
    const onVis = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      ctrl.abort()
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const gap = pool?.fairEth ? (pool.priceEth / pool.fairEth - 1) * 100 : null
  const tvl = pool?.ethUsd ? pool.ethDepth * pool.ethUsd * 2 : null

  return (
    <section className="band" id="market">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>
            The {TOKEN.wrapper} market
          </p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Buy it. Trade it.
            <br />
            <span className="green">Or earn on it.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            {TOKEN.wrapper} trades on Uniswap v4 on {CHAIN.name}. A keeper holds it within about 1% of the ZEC
            price. Every trade pays {ZZEC_MARKET.poolFeePct.toFixed(2)}%: {ZZEC_MARKET.lpFeePct}% to liquidity
            providers, {ZZEC_MARKET.hookFeePct}% to the Furnace.
          </p>
        </div>

        <div className="mkt-live" data-reveal style={stagger(3)}>
          <div className="mkt-stat">
            <div className="mkt-n">{pool ? pool.priceEth.toFixed(5) : '…'}<span className="mono mkt-u">ETH</span></div>
            <div className="mkt-l mono">1 {TOKEN.wrapper}</div>
            <div className="mkt-h mono">{gap === null ? 'vs ZEC: reading…' : `${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% vs ZEC on Coinbase`}</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-n">{tvl ? usd(tvl) : pool ? `${pool.ethDepth.toFixed(3)} ETH` : '…'}</div>
            <div className="mkt-l mono">liquidity</div>
            <div className="mkt-h mono">{pool ? `${pool.ethDepth.toFixed(4)} ETH + ${pool.zzecDepth.toFixed(4)} ${TOKEN.wrapper}` : 'reading chain…'}</div>
          </div>
          <div className="mkt-stat">
            <div className="mkt-n">{ZZEC_MARKET.lpFeePct}%<span className="mono mkt-u">/ trade</span></div>
            <div className="mkt-l mono">to liquidity providers</div>
            <div className="mkt-h mono">{ZZEC_MARKET.hookFeePct}% more goes to the burn, via the hook</div>
          </div>
        </div>

        <div className="grid g2 mkt-cards">
          <article className="check" data-reveal style={stagger(4)}>
            <h3 className="h4">Buy or sell {TOKEN.wrapper}</h3>
            <p>
              Open Uniswap on {CHAIN.name}, paste the {TOKEN.wrapper} contract address into the token search, and swap
              from ETH. Small trades land within a percent or two of ZEC; large ones move a small pool, so size to the
              depth above.
            </p>
            <div className="mkt-actions">
              <a className="btn btn-primary" href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">
                Trade on Uniswap
              </a>
              <code className="mono mkt-ca">{CONTRACTS.zzec}</code>
            </div>
          </article>
          <article className="check" data-reveal style={stagger(5)}>
            <h3 className="h4">Provide liquidity</h3>
            <p>
              Hold {TOKEN.wrapper} and ETH in equal value, then add both to the pool below. You earn the{' '}
              {ZZEC_MARKET.lpFeePct}% fee on every trade, pro rata to your share, and you can withdraw any time. The
              pool is 0.3% fee, tick spacing 60, with the burn hook attached. Deeper liquidity means smaller price moves
              for everyone.
            </p>
            <div className="mkt-actions">
              <a className="btn btn-ghost" href={LINKS.uniswapAddLiquidity} target="_blank" rel="noreferrer">
                Add liquidity on Uniswap
              </a>
              <a className="mono mkt-link" href={`${CONTRACTS.explorer}/address/${ZZEC_MARKET.hook}`} target="_blank" rel="noreferrer">
                the hook ↗
              </a>
            </div>
          </article>
        </div>

        <p className="mkt-note mono" data-reveal>
          liquidity provision carries price risk: if ZEC moves against ETH, a position holds more of the falling side ·
          zZEC is backed 1:1 by attested ZEC and trades near it, not exactly at it
        </p>
      </div>
    </section>
  )
}
