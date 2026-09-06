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
const TIERS = [
  { min: 25, name: 'Herd Leader', emoji: '👑', note: 'a quarter of the pool or more' },
  { min: 10, name: 'Stallion', emoji: '🦓', note: '10% and up' },
  { min: 1, name: 'Zebra', emoji: '🦓', note: '1% and up' },
  { min: 0, name: 'Foal', emoji: '🐴', note: 'every herd starts here' },
]
const tierOf = (share: number) => TIERS.find((t) => share >= t.min)!

type Pos = { id: bigint; owner: string; liq: bigint }
type Pool = { sqrt: bigint; L: bigint; ethDepth: number; zzecDepth: number; priceEth: number; taken0: number; taken1: number }

export function LiquidityDesk() {
  const [pool, setPool] = useState<Pool | null>(null)
  const [positions, setPositions] = useState<Pos[] | null>(null)
  const [prices, setPrices] = useState<{ zec: number; eth: number } | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [bal, setBal] = useState<{ eth: bigint; zzec: bigint }>({ eth: 0n, zzec: 0n })
  const [ethIn, setEthIn] = useState('0.05')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const id = ZZEC_MARKET.poolId.slice(2)
    const [s0, lq, t0, t1] = await readBatchRaw([{ to: STATE_VIEW, data: SEL.slot0 + id }, { to: STATE_VIEW, data: SEL.liq + id }, { to: ZZEC_MARKET.hook, data: SEL.taken0 }, { to: ZZEC_MARKET.hook, data: SEL.taken1 }])
    const sqrt = hexToBig(word(s0, 0)), L = hexToBig(lq)
    const sp = Number(sqrt) / 2 ** 96, Ln = Number(L)
    const ethDepth = Ln / sp / 1e18, zzecDepth = (Ln * sp) / 1e8
    setPool({ sqrt, L, ethDepth, zzecDepth, priceEth: zzecDepth > 0 ? ethDepth / zzecDepth : 0, taken0: Number(hexToBig(t0)) / 1e18, taken1: Number(hexToBig(t1)) / 1e8 })
    // every position ever touched in this pool: salt = PositionManager token id
    const logs = await getLogs(POOL_MANAGER, [T_MODIFY, ZZEC_MARKET.poolId])
    const ids = [...new Set(logs.map((l) => hexToBig(word(l.data, 3)).toString()))].map(BigInt)
    if (ids.length) {
      const res = await readBatchRaw(ids.flatMap((i) => [{ to: POSM, data: SEL.ownerOf + i.toString(16).padStart(64, '0') }, { to: POSM, data: SEL.posLiq + i.toString(16).padStart(64, '0') }]))
      setPositions(ids.map((i, k) => ({ id: i, owner: wordAddress(res[k * 2], 0), liq: hexToBig(res[k * 2 + 1]) })).filter((p) => p.liq > 0n).sort((a, b) => (b.liq > a.liq ? 1 : -1)))
    } else setPositions([])
    if (account && CONTRACTS.zzec) { const [z] = await readBatchRaw([{ to: CONTRACTS.zzec, data: SEL.balanceOf + encAddress(account) }]); const e = (await eth()!.request({ method: 'eth_getBalance', params: [account, 'latest'] })) as string; setBal({ eth: hexToBig(e), zzec: hexToBig(z) }) }
  }, [account])
  useEffect(() => { void load().catch(() => {}); const t = window.setInterval(() => void load().catch(() => {}), 30_000); return () => window.clearInterval(t) }, [load])
  useEffect(() => { const spot = async (p: string) => Number(((await (await fetch(`https://api.coinbase.com/v2/prices/${p}/spot`)).json()) as { data: { amount: string } }).data.amount); Promise.all([spot('ZEC-USD'), spot('ETH-USD')]).then(([zec, eth]) => setPrices({ zec, eth })).catch(() => {}) }, [])

  // leaderboard rows: aggregate by owner
  const rows = useMemo(() => {
    if (!positions || !pool || pool.L === 0n) return []
    const by = new Map<string, bigint>()
    for (const p of positions) by.set(p.owner.toLowerCase(), (by.get(p.owner.toLowerCase()) ?? 0n) + p.liq)
    const total = Number(pool.L)
    const volZec = (pool.taken0 / (pool.priceEth || 1) + pool.taken1) / (ZZEC_MARKET.hookFeePct / 100)
    return [...by.entries()].map(([owner, liq]) => { const share = (Number(liq) / total) * 100; return { owner, share, tier: tierOf(share), burnsZec: volZec * (ZZEC_MARKET.hookFeePct / 100) * (share / 100), feesZec: volZec * (ZZEC_MARKET.lpFeePct / 100) * (share / 100) } }).sort((a, b) => b.share - a.share)
  }, [positions, pool])
  const mine = account ? rows.find((r) => r.owner === account.toLowerCase()) : undefined

  // impact meter + mint math (full range), same formulas as the operator's pool script
  const ethWei = BigInt(Math.round((Number(ethIn) || 0) * 1e18))
  const quote = useMemo(() => {
    if (!pool || ethWei <= 0n || pool.sqrt === 0n) return null
    const sA = sqrtAtTick(-TICK), sB = sqrtAtTick(TICK), P = pool.sqrt
    const l0 = (ethWei * P * sB) / (sB - P) / Q96
    const liquidity = (l0 * 9995n) / 10_000n
    const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d
    const need0 = ceil(liquidity * (sB - P) * Q96, P * sB), need1 = ceil(liquidity * (P - sA), Q96)
    const shareAfter = (Number(liquidity) / (Number(pool.L) + Number(liquidity))) * 100
    const trade = 0.05 // ETH
    const moveBefore = (trade / pool.ethDepth) * 100, moveAfter = (trade / (pool.ethDepth + Number(need0) / 1e18)) * 100
    return { liquidity, need0, need1, amount0Max: (need0 * 1005n) / 1000n, amount1Max: (need1 * 1005n) / 1000n, shareAfter, moveBefore, moveAfter }
  }, [pool, ethWei])
  const rankAfter = quote ? 1 + rows.filter((r) => r.owner !== account?.toLowerCase() && r.share > quote.shareAfter).length : null

  const connect = async () => {
    const p = eth(); if (!p) { setMsg({ kind: 'err', text: 'No wallet found. Install a browser wallet with Robinhood Chain added.' }); return }
    try {
      const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }) } catch { await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name, rpcUrls: [CHAIN.rpc], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: [CONTRACTS.explorer] }] }) }
      setAccount(accts[0]); setMsg(null)
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) }
  }
  const send = async (to: string, data: string, value = 0n) => {
    const p = eth()!; const tx: Record<string, string> = { from: account!, to, data }; if (value > 0n) tx.value = '0x' + value.toString(16)
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
      if (hexToBig(word(p2, 0)) < quote.amount1Max) { setBusy('2 of 3 · allow the PositionManager'); const exp = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400); await send(PERMIT2, SEL.p2approve + encTuple([encAddr(CONTRACTS.zzec), encAddr(POSM), encUint((1n << 160n) - 1n), encUint(exp)])) }
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
    <section className="band" id="liquidity">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Liquidity desk</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Join the herd.
            <br />
            <span className="green">Host the burn.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            Every trade in the {TOKEN.wrapper} market pays {ZZEC_MARKET.lpFeePct}% to the people providing liquidity and {ZZEC_MARKET.hookFeePct}% to the
            burn. Liquidity providers are ranked in the open, earn on every trade pro rata, and can leave any time. Add it here in one flow.
          </p>
        </div>

        <div className="ld-grid">
          {/* ---- leaderboard ---- */}
          <div className="ld-board" data-reveal style={stagger(3)}>
            <div className="ld-board-h">
              <span className="mono">the herd · live from Uniswap v4</span>
              <span className="mono">{pool ? `${fmt(pool.ethDepth, 3)} ETH + ${fmt(pool.zzecDepth, 3)} ${TOKEN.wrapper} in the pool` : 'reading…'}</span>
            </div>
            {rows.length === 0 && <div className="redeem-empty mono">{positions ? 'no positions yet · be the first' : 'reading positions…'}</div>}
            {rows.map((r, i) => (
              <div className={`ld-row ${r.owner === account?.toLowerCase() ? 'me' : ''}`} key={r.owner}>
                <span className="ld-rank mono">#{i + 1}</span>
                <span className="ld-emoji">{r.tier.emoji}</span>
                <span className="ld-who"><b>{r.owner === account?.toLowerCase() ? 'you' : short(r.owner)}</b><i className="mono">{r.tier.name}</i></span>
                <span className="ld-share"><div className="ld-bar"><div style={{ width: `${Math.max(2, r.share)}%` }} /></div><b className="mono">{fmt(r.share, 1)}%</b></span>
                <span className="ld-stat mono"><em>hosted</em>{fmt(r.burnsZec, 5)} ZEC → burn</span>
                <span className="ld-stat mono"><em>earned</em>{fmt(r.feesZec, 5)} ZEC</span>
              </div>
            ))}
            <div className="ld-tiers mono">
              {TIERS.map((t) => <span key={t.name}>{t.emoji} <b>{t.name}</b> {t.note}</span>)}
            </div>
          </div>

          {/* ---- add liquidity ---- */}
          <div className="rd-form ld-form" data-reveal style={stagger(4)}>
            {!account ? (
              <div className="rd-connect"><button className="btn btn-primary btn-lg" type="button" onClick={connect}>Connect wallet</button><p className="mono">add liquidity without leaving this page · full-range position, yours as an NFT</p></div>
            ) : (
              <>
                <div className="rd-acct mono"><span className="dot" />{short(account)}<em>{fmt(Number(bal.eth) / 1e18, 4)} ETH · {fmt(Number(bal.zzec) / 1e8, 4)} {TOKEN.wrapper}</em></div>
                {mine && <div className="ld-mine mono">{mine.tier.emoji} you are a <b>{mine.tier.name}</b> with {fmt(mine.share, 1)}% of the pool</div>}
                <label className="redeem-l mono">ETH to add</label>
                <div className="rd-amt"><input className="mono" inputMode="decimal" value={ethIn} onChange={(e) => setEthIn(e.target.value)} placeholder="0.05" /><span className="mono rd-unit">ETH</span>{['0.02', '0.05', '0.1', '0.25'].map((q) => <button key={q} type="button" className="rd-max mono" onClick={() => setEthIn(q)}>{q}</button>)}</div>
                <div className="rd-sub mono">{quote ? <>pairs with <b>{fmt(Number(quote.need1) / 1e8, 6)} {TOKEN.wrapper}</b> at the pool price{prices ? ` · about $${((Number(quote.need0) / 1e18) * prices.eth * 2).toFixed(0)} total` : ''}</> : 'enter an amount'}</div>
                {quote && (
                  <div className="ld-impact">
                    <div className="ld-impact-h mono">what your liquidity changes</div>
                    <div className="ld-impact-grid mono">
                      <div><span>your share</span><b>{fmt(quote.shareAfter, 1)}%</b><i>{tierOf(quote.shareAfter).emoji} {tierOf(quote.shareAfter).name} · rank #{rankAfter}</i></div>
                      <div><span>a 0.05 ETH trade moves price</span><b>{fmt(quote.moveBefore, 2)}% → {fmt(quote.moveAfter, 2)}%</b><i>tighter peg for everyone</i></div>
                      <div><span>you earn</span><b>{fmt(quote.shareAfter, 1)}% of {ZZEC_MARKET.lpFeePct}%</b><i>of every trade, from the next one</i></div>
                      <div><span>you host</span><b>{fmt(quote.shareAfter, 1)}% of the burn</b><i>{ZZEC_MARKET.hookFeePct}% of every trade → Furnace</i></div>
                    </div>
                  </div>
                )}
                <button className="btn btn-primary btn-lg rd-go" type="button" disabled={!!busy || !quote} onClick={addLiquidity}>{busy ?? (quote ? `Add ${fmt(Number(quote.need0) / 1e18, 4)} ETH + ${fmt(Number(quote.need1) / 1e8, 4)} ${TOKEN.wrapper}` : 'enter an amount')}</button>
                {quote && quote.amount1Max > bal.zzec && <p className="rd-sub mono">short on {TOKEN.wrapper}: <a href="#wrap">wrap ZEC</a> or <a href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">buy it on Uniswap ↗</a></p>}
              </>
            )}
            {msg && <p className={`rd-msg mono ${msg.kind}`}>{msg.text}</p>}
            <div className="rd-how mono">
              <div><b>01</b>full-range position minted to your wallet as an NFT</div>
              <div><b>02</b>{ZZEC_MARKET.lpFeePct}% of every trade accrues to it, pro rata</div>
              <div><b>03</b>remove it any time on Uniswap · nothing is locked</div>
              <div><b>!</b>impermanent loss if {TOKEN.wrapper} and ETH diverge · contract risk · reserve custody as on every page</div>
            </div>
            <p className="redeem-fine mono"><a href={LINKS.uniswapAddLiquidity} target="_blank" rel="noreferrer">prefer a concentrated range? use Uniswap ↗</a> · <a href="/docs/#/market-and-keeper">how the market works ↗</a></p>
          </div>
        </div>
        <div className="ctb-soon mono" data-reveal style={stagger(5)}>
          <span className="tag tag-wait"><span className="dot" /> under consideration</span>
          <span>A {TOKEN.wrapper}-paid rewards program for the herd, weighted by share over time. Not live, not promised; if it ships, the budget and end date appear here first.</span>
        </div>
      </div>
    </section>
  )
}
