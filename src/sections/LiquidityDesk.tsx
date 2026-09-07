import { useCallback, useEffect, useMemo, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, TOKEN, ZZEC_MARKET } from '../config'
import { encAddr, encAddress, encBytes, encBytesArray, encTuple, encUint, getLogs, hexToBig, readBatchRaw, word, wordAddress, type Enc } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * The Liquidity Desk. A live leaderboard of everyone providing zZEC/ETH
 * liquidity (read from Uniswap v4 events), rank tiers, an impact meter that
 * shows what your liquidity would change, and a way to add liquidity without
 * leaving the site: approvals, then one PositionManager mint, full range.
 */
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
const POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7'
const STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const T_MODIFY = '0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec'
const SEL = { slot0: '0xc815641c', liq: '0xfa6793d5', ownerOf: '0x6352211e', posLiq: '0x1efeed33', balanceOf: '0x70a08231', allowance: '0xdd62ed3e', approve: '0x095ea7b3', p2allow: '0x927da105', p2approve: '0x87517c45', modify: '0xdd46508f', taken0: '0x32bd4c0b', taken1: '0x3f739f57' } as const
const TICK = 887220 // full range at spacing 60
const Q96 = 1n << 96n
const CHAIN_HEX = '0x' + CHAIN.id.toString(16)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum
const sqrtAtTick = (t: number) => BigInt(Math.floor(Math.sqrt(1.0001 ** t) * 2 ** 96))
const fmt = (n: number, d = 4) => n.toLocaleString('en-US', { maximumFractionDigits: d })
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
type Pos = { id: bigint; owner: string; liq: bigint }
type Pool = { sqrt: bigint; L: bigint; ethDepth: number; zzecDepth: number; priceEth: number }

export function LiquidityDesk() {
  const [pool, setPool] = useState<Pool | null>(null)
  const [positions, setPositions] = useState<Pos[] | null>(null)
  const [readErr, setReadErr] = useState<string | null>(null)
  const [prices, setPrices] = useState<{ zec: number; eth: number } | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [bal, setBal] = useState<{ eth: bigint; zzec: bigint }>({ eth: 0n, zzec: 0n })
  const [ethIn, setEthIn] = useState('0.05')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const id = ZZEC_MARKET.poolId.slice(2)
    const [s0, lq] = await readBatchRaw([{ to: STATE_VIEW, data: SEL.slot0 + id }, { to: STATE_VIEW, data: SEL.liq + id }])
    const sqrt = hexToBig(word(s0, 0)), L = hexToBig(lq)
    const sp = Number(sqrt) / 2 ** 96, Ln = Number(L)
    const ethDepth = Ln / sp / 1e18, zzecDepth = (Ln * sp) / 1e8
    setPool({ sqrt, L, ethDepth, zzecDepth, priceEth: zzecDepth > 0 ? ethDepth / zzecDepth : 0 })
    // every position ever touched in this pool: salt = PositionManager token id
    const logs = await getLogs(POOL_MANAGER, [T_MODIFY, ZZEC_MARKET.poolId])
    const ids = [...new Set(logs.map((l) => hexToBig(word(l.data, 3)).toString()))].map(BigInt)
    if (ids.length) {
      const res = await readBatchRaw(ids.flatMap((i) => [{ to: POSM, data: SEL.ownerOf + i.toString(16).padStart(64, '0') }, { to: POSM, data: SEL.posLiq + i.toString(16).padStart(64, '0') }]))
      setPositions(ids.map((i, k) => ({ id: i, owner: wordAddress(res[k * 2], 0), liq: hexToBig(res[k * 2 + 1]) })).filter((p) => p.liq > 0n).sort((a, b) => (b.liq > a.liq ? 1 : -1)))
    } else setPositions([])
    if (account && CONTRACTS.zzec) { const [z] = await readBatchRaw([{ to: CONTRACTS.zzec, data: SEL.balanceOf + encAddress(account) }]); const e = (await eth()!.request({ method: 'eth_getBalance', params: [account, 'latest'] })) as string; setBal({ eth: hexToBig(e), zzec: hexToBig(z) }) }
  }, [account])
  useEffect(() => { const go = () => load().then(() => setReadErr(null)).catch((e: Error) => setReadErr(e.message)); void go(); const t = window.setInterval(go, 30_000); return () => window.clearInterval(t) }, [load])
  useEffect(() => { const spot = async (p: string) => Number(((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()) as { data: { amount: string } }).data.amount); Promise.all([spot('ZEC-USD'), spot('ETH-USD')]).then(([zec, eth]) => setPrices({ zec, eth })).catch(() => {}) }, [])

  // Show participation counts, never attribute historical earnings from current share.
  const owners = [...new Set((positions ?? []).map((p) => p.owner.toLowerCase()))]

  // impact meter + mint math (full range), same formulas as the operator's pool script
  const validAmount = /^\d{1,9}(\.\d{0,18})?$/.test(ethIn)
  const [whole, fraction = ''] = ethIn.split('.')
  const ethWei = validAmount ? BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0')) : 0n
  const quote = useMemo(() => {
    if (!pool || ethWei <= 0n || pool.sqrt === 0n) return null
    const sA = sqrtAtTick(-TICK), sB = sqrtAtTick(TICK), P = pool.sqrt
    const l0 = (ethWei * P * sB) / (sB - P) / Q96
    const liquidity = (l0 * 9995n) / 10_000n
    const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d
    const need0 = ceil(liquidity * (sB - P) * Q96, P * sB), need1 = ceil(liquidity * (P - sA), Q96)
    const shareAfter = (Number(liquidity) / (Number(pool.L) + Number(liquidity))) * 100
    return { liquidity, need0, need1, amount0Max: (need0 * 1005n) / 1000n, amount1Max: (need1 * 1005n) / 1000n, shareAfter }
  }, [pool, ethWei])
  // the most ETH the wallet's zZEC can pair at the pool price (0.5% headroom for the maxima)
  const maxEthForZzec = pool && pool.priceEth > 0 ? (Number(bal.zzec) / 1e8) * pool.priceEth * 0.994 : 0

  const connect = async () => {
    const p = eth(); if (!p) { setMsg({ kind: 'err', text: 'No wallet found. Install a browser wallet with Robinhood Chain added.' }); return }
    try {
      const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }) } catch { await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name, rpcUrls: [CHAIN.rpcPublic], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: [CONTRACTS.explorer] }] }) }
      setAccount(accts[0]); setMsg(null)
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) }
  }
  const send = async (to: string, data: string, value = 0n) => {
    const p = eth()!; const tx: Record<string, string> = { from: account!, to, data, chainId: CHAIN_HEX }; if (value > 0n) tx.value = '0x' + value.toString(16)
    const hash = (await p.request({ method: 'eth_sendTransaction', params: [tx] })) as string
    for (let i = 0; i < 80; i++) { const r = (await p.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as { status: string } | null; if (r) { if (r.status !== '0x1') throw new Error('transaction reverted'); return hash } await new Promise((res) => setTimeout(res, 1500)) }
    throw new Error('timed out waiting for the transaction')
  }
  const addLiquidity = async () => {
    if (!account || !pool || !quote || !CONTRACTS.zzec) return
    if (quote.amount1Max > bal.zzec) { setMsg({ kind: 'err', text: `You need ${fmt(Number(quote.amount1Max) / 1e8, 6)} ${TOKEN.wrapper} for that much ETH. Wrap ZEC or buy ${TOKEN.wrapper} first.` }); return }
    if (quote.amount0Max + 10n ** 15n > bal.eth) { setMsg({ kind: 'err', text: 'Not enough ETH for that amount plus gas.' }); return }
    setMsg(null)
    try {
      const key = [encAddr('0x0000000000000000000000000000000000000000'), encAddr(CONTRACTS.zzec), encUint(3000n), encUint(60n), encAddr(ZZEC_MARKET.hook)]
      // 1 + 2: zZEC -> Permit2 -> PositionManager
      const [al, p2] = await readBatchRaw([{ to: CONTRACTS.zzec, data: SEL.allowance + encAddress(account) + encAddress(PERMIT2) }, { to: PERMIT2, data: SEL.p2allow + encAddress(account) + encAddress(CONTRACTS.zzec) + encAddress(POSM) }])
      if (hexToBig(al) < quote.amount1Max) { setBusy('1 of 3 · approve zZEC to Permit2'); await send(CONTRACTS.zzec, SEL.approve + encAddress(PERMIT2) + 'f'.repeat(64)) }
      if (hexToBig(word(p2, 0)) < quote.amount1Max || hexToBig(word(p2, 1)) <= BigInt(Math.floor(Date.now() / 1000) + 600)) { setBusy('2 of 3 · allow the PositionManager'); const exp = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400); await send(PERMIT2, SEL.p2approve + encTuple([encAddr(CONTRACTS.zzec), encAddr(POSM), encUint((1n << 160n) - 1n), encUint(exp)])) }
      // 3: mint full-range position: MINT_POSITION, SETTLE_PAIR, SWEEP (refund unused ETH)
      setBusy('3 of 3 · mint your position')
      const mintParams = encTuple([...key, encUint(BigInt(-TICK)), encUint(BigInt(TICK)), encUint(quote.liquidity), encUint(quote.amount0Max), encUint(quote.amount1Max), encAddr(account), encBytes('0x')])
      const settle = encTuple([encAddr('0x0000000000000000000000000000000000000000'), encAddr(CONTRACTS.zzec)])
      const sweep = encTuple([encAddr('0x0000000000000000000000000000000000000000'), encAddr(account)])
      const unlock = encTuple([encBytes('0x020d14'), encBytesArray(['0x' + mintParams, '0x' + settle, '0x' + sweep])] as Enc[])
      const data = SEL.modify + encTuple([encBytes('0x' + unlock), encUint(BigInt(Math.floor(Date.now() / 1000) + 600))])
      const hash = await send(POSM, data, quote.amount0Max)
      setMsg({ kind: 'ok', text: `Welcome to the herd. Your position is minted (${short(hash)}). Fees start accruing on the next trade.` })
      await load()
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(null) }
  }

  return (
    <section className="band band-ink ld-band" id="liquidity">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Liquidity desk</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Provide zZEC liquidity.
            <br />
            <span className="green">Earn trading fees.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            Pair {TOKEN.wrapper} with ETH and earn your share of the {ZZEC_MARKET.lpFeePct}% LP trading fees.
            Deeper liquidity helps the market trade more smoothly and supports the ${TOKEN.symbol} ecosystem.
            Preview your contribution below before connecting.
          </p>
        </div>

        <div className="ld-grid">
          {/* ---- add liquidity ---- */}
          <div className="rd-form ld-form" data-reveal style={stagger(4)}>
            <h3 className="h4">Preview your deposit</h3>
            <p className="participation-note">You need both ETH and {TOKEN.wrapper} on {CHAIN.name}. This creates a full-range position in your wallet.</p>
            {account && <div className="rd-acct mono"><span className="dot" />{short(account)}<em>{fmt(Number(bal.eth) / 1e18, 4)} ETH · {fmt(Number(bal.zzec) / 1e8, 4)} {TOKEN.wrapper}</em></div>}
                <label className="redeem-l mono" htmlFor="liquidity-eth">ETH to pair · matching zZEC is additional</label>
                <div className="rd-amt"><input id="liquidity-eth" className="mono" disabled={!!busy} inputMode="decimal" value={ethIn} onChange={(e) => setEthIn(e.target.value)} placeholder="0.05" /><span className="mono rd-unit">ETH</span></div>
                <div className="ld-chips">{['0.02', '0.05', '0.1', '0.25'].map((q) => <button key={q} type="button" disabled={!!busy} className="rd-max mono" onClick={() => setEthIn(q)}>{q} ETH</button>)}{maxEthForZzec > 0 && <button type="button" disabled={!!busy} className="rd-max mono hi" onClick={() => setEthIn(maxEthForZzec.toFixed(4))}>max for my {TOKEN.wrapper} · {fmt(maxEthForZzec, 4)}</button>}</div>
                <div className="rd-sub mono">{quote ? <>pairs with <b>{fmt(Number(quote.need1) / 1e8, 6)} {TOKEN.wrapper}</b> at the pool price{prices ? ` · about $${((Number(quote.need0) / 1e18) * prices.eth * 2).toFixed(0)} total` : ''}</> : 'enter an amount'}</div>
                {quote && <p className="rd-sub mono">This new position would initially supply about {fmt(quote.shareAfter, 1)}% of active liquidity. This is not a return estimate.</p>}
                <p className="rd-sub">0.5% amount tolerance · network fees apply · first deposit may require two approvals plus the deposit.</p>
                <button className="btn btn-primary btn-lg rd-go" type="button" disabled={!!busy || !quote} onClick={account ? addLiquidity : connect}>{busy ?? (!account ? 'Connect wallet to continue' : quote ? `Add ${fmt(Number(quote.need0) / 1e18, 4)} ETH + ${fmt(Number(quote.need1) / 1e8, 4)} ${TOKEN.wrapper}` : 'enter an amount')}</button>
                {account && quote && quote.amount1Max > bal.zzec && <p className="rd-sub ld-short">You hold {fmt(Number(bal.zzec) / 1e8, 4)} {TOKEN.wrapper}, this needs {fmt(Number(quote.amount1Max) / 1e8, 4)}. Use the max chip above, <a href="#wrap">wrap more ZEC</a>, or <a href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">buy {TOKEN.wrapper} on Uniswap ↗</a>.</p>}
            {msg && <p role="status" className={`rd-msg mono ${msg.kind}`}>{msg.text}</p>}
            <div className="rd-how mono">
              <div><b>01</b>full-range position minted to your wallet as an NFT</div>
              <div><b>02</b>share the {ZZEC_MARKET.lpFeePct}% LP fees with other active providers</div>
              <div><b>03</b>withdraw the position’s current assets through Uniswap</div>
              <div><b>!</b>asset amounts and value change with prices; fees may not offset losses · contract and reserve custody risk</div>
            </div>
            <p className="redeem-fine mono"><a href={LINKS.uniswapAddLiquidity} target="_blank" rel="noreferrer">prefer a concentrated range? use Uniswap ↗</a> · <a href="/docs/#/market-and-keeper">how the market works ↗</a></p>
          </div>
          <aside className="liquidity-guide">
            <div className="liquidity-guide-card">
              <p className="eyebrow">What you earn</p>
              <h3 className="h3">Trading fees.<br /><span className="green">Your share, your position.</span></h3>
              <p>The pool’s {ZZEC_MARKET.lpFeePct}% LP fee is shared among active providers. It is a fee on trades, not a daily yield or guaranteed return.</p>
              <p>The separate {ZZEC_MARKET.hookFeePct}% hook charge funds ${TOKEN.symbol} buybacks and burns. It is not an extra LP reward.</p>
            </div>
            <div className="liquidity-guide-card">
              <h3 className="h4">Need the other asset?</h3>
              <p>Have ETH? Buy the matching {TOKEN.wrapper} on the market, or wrap native ZEC for it 1:1. Have native ZEC? Wrap it at the desk, no fee, then pair your {TOKEN.wrapper} with ETH.</p>
              <div className="liquidity-links"><a href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">Buy {TOKEN.wrapper} ↗</a><a href="#wrap">Wrap native ZEC →</a></div>
            </div>
            <div className="liquidity-guide-card">
              <h3 className="h4">Already providing liquidity?</h3>
              <p>Connect the wallet holding your position on Uniswap to view it, collect fees or remove liquidity.</p>
              <a href="https://app.uniswap.org/positions" target="_blank" rel="noreferrer">Manage positions on Uniswap ↗</a>
            </div>
            <details className="liquidity-community">
              <summary>The Herd · {positions ? `${owners.length} provider wallet${owners.length === 1 ? '' : 's'}` : 'provider activity'}</summary>
              <p>Community participation, not an earnings leaderboard. Wallets may hold multiple positions.</p>
              {readErr && <p role="status">Position data is unavailable. Retrying automatically.</p>}
              {!positions && !readErr && <p>Reading positions…</p>}
              {owners.map((owner) => <a key={owner} href={`${CONTRACTS.explorer}/address/${owner}`} target="_blank" rel="noreferrer">{short(owner)} ↗</a>)}
            </details>
          </aside>
        </div>
      </div>
    </section>
  )
}
