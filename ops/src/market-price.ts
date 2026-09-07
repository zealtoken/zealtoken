import { atomicJson, readJson, stateDir } from './ops-lock.js'
export type Prices = { at: number; zecUsd: number; ethUsd: number; sources: string[] }
const CACHE = `${stateDir}market-prices.json`
const positive = (v: unknown) => { const n = Number(v); if (!(n > 0 && Number.isFinite(n))) throw new Error('invalid price'); return n }
export function agree(a: number, b: number, tolerance = 0.02) {
  positive(a); positive(b)
  if (Math.abs(a / b - 1) > tolerance) throw new Error('price sources disagree by more than 2%')
  return (a + b) / 2
}
export async function marketPrices(): Promise<Prices> {
  const old = readJson<Prices | null>(CACHE, null)
  if (old && Date.now() >= old.at && Date.now() - old.at < 20_000 && old.sources?.length === 2) {
    positive(old.zecUsd); positive(old.ethUsd); return old
  }
  const json = async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (!r.ok) throw new Error(`price feed HTTP ${r.status}`); return r.json()
  }
  const [zec, eth, kraken] = await Promise.all([
    json('https://api.coinbase.com/v2/prices/ZEC-USD/spot'), json('https://api.coinbase.com/v2/prices/ETH-USD/spot'),
    json('https://api.kraken.com/0/public/Ticker?pair=ZECUSD,ETHUSD'),
  ])
  if (kraken.error?.length) throw new Error('Kraken price error')
  const mid = (pair: string) => (positive(kraken.result[pair].a[0]) + positive(kraken.result[pair].b[0])) / 2
  const zecUsd = agree(positive(zec.data.amount), mid('XZECZUSD'))
  const ethUsd = agree(positive(eth.data.amount), mid('XETHZUSD'))
  agree(positive(zec.data.amount) / positive(eth.data.amount), mid('XZECZUSD') / mid('XETHZUSD'))
  const result = { at: Date.now(), zecUsd, ethUsd, sources: ['Coinbase', 'Kraken'] }
  atomicJson(CACHE, result); return result
}
