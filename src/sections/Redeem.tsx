import { useCallback, useEffect, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, REDEEM_OPENS_AT, TOKEN, ZZEC_MARKET } from '../config'
import { encAddress, hexToBig, readBatchRaw, word, wordAddress } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * Redemption Desk. Escrow zZEC with a t-address, get paid native ZEC, the desk
 * burns the escrow only after the Zcash txid is recorded; payouts are automatic.
 * days. Wallet-native (EIP-1193), no library. Three steps, one idea: you are
 * never left with nothing.
 */
const SEL = { request: '0x8163ba11', reclaim: '0x2dabbeed', approve: '0x095ea7b3', allowance: '0xdd62ed3e', balanceOf: '0x70a08231', requestCount: '0x5badbe4c', summary: '0x6152e655', zcashAddressOf: '0x0d6d49c2', minAmount: '0x9b2cb5d8', requestsPaused: '0xe43b7531' } as const
const WINDOW = 7 * 86400
const CHAIN_HEX = '0x' + CHAIN.id.toString(16)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum
const u256 = (n: bigint) => n.toString(16).padStart(64, '0')
const encString = (s: string) => { const b = new TextEncoder().encode(s); const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); return u256(BigInt(b.length)) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0') }
const decString = (hex: string) => { const off = Number(hexToBig(word(hex, 0))) * 2; const len = Number(BigInt('0x' + hex.slice(2 + off, 2 + off + 64))); const data = hex.slice(2 + off + 64, 2 + off + 64 + len * 2); return new TextDecoder().decode(new Uint8Array(data.match(/.{2}/g)!.map((h) => parseInt(h, 16)))) }
const zec = (z: bigint) => (Number(z) / 1e8).toLocaleString('en-US', { maximumFractionDigits: 8 })
const isT = (s: string) => /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(s.trim())

type Req = { id: number; holder: string; amount: bigint; at: number; status: number; txid: string; zaddr: string }
type Desk = { min: bigint; paused: boolean; count: number; paid: number; paidAmount: bigint }
const STATUS = ['', 'open', 'paid', 'reclaimed']


/** The bridge, drawn: Robinhood Chain on the left, Zcash on the right, the desk in between. Dashes crawl in the flow direction. */
function RedeemFlow({ paid }: { paid: number }) {
  return (
    <svg className="rd-flow" viewBox="0 0 900 190" role="img" aria-label="zZEC escrowed on Robinhood Chain, ZEC paid on Zcash, escrow burned">
      <defs>
        <marker id="rdarr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--green)" /></marker>
        <linearGradient id="rdglow" x1="0" x2="1"><stop offset="0" stopColor="var(--green)" stopOpacity="0" /><stop offset=".5" stopColor="var(--green)" stopOpacity=".18" /><stop offset="1" stopColor="var(--green)" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="20" y="20" width="270" height="150" rx="18" className="rd-zone" /><text x="40" y="46" className="rd-zone-t">ROBINHOOD CHAIN</text>
      <rect x="610" y="20" width="270" height="150" rx="18" className="rd-zone z" /><text x="630" y="46" className="rd-zone-t">ZCASH</text>
      <rect x="300" y="50" width="300" height="90" rx="16" fill="url(#rdglow)" />
      <g className="rd-node"><rect x="50" y="70" width="110" height="64" rx="12" /><text x="105" y="97" className="rd-n-t">your wallet</text><text x="105" y="116" className="rd-n-s">zZEC</text></g>
      <g className="rd-node g"><rect x="180" y="70" width="100" height="64" rx="12" /><text x="230" y="97" className="rd-n-t">escrow</text><text x="230" y="116" className="rd-n-s">still yours</text></g>
      <g className="rd-node g"><rect x="395" y="60" width="110" height="84" rx="14" /><text x="450" y="90" className="rd-n-t">the desk</text><text x="450" y="108" className="rd-n-s">records txid</text><text x="450" y="126" className="rd-n-s">then burns</text></g>
      <g className="rd-node"><rect x="640" y="70" width="110" height="64" rx="12" /><text x="695" y="97" className="rd-n-t">reserve</text><text x="695" y="116" className="rd-n-s">t1Ujk…</text></g>
      <g className="rd-node g"><rect x="760" y="70" width="100" height="64" rx="12" /><text x="810" y="97" className="rd-n-t">your t-addr</text><text x="810" y="116" className="rd-n-s">native ZEC</text></g>
      <path d="M160 102 L180 102" className="rd-e" markerEnd="url(#rdarr)" />
      <path d="M280 102 C 330 102, 340 102, 395 102" className="rd-e" markerEnd="url(#rdarr)" />
      <path d="M750 102 L760 102" className="rd-e" markerEnd="url(#rdarr)" />
      <path d="M505 80 C 560 80, 590 80, 640 90" className="rd-e" markerEnd="url(#rdarr)" /><text x="572" y="66" className="rd-e-t">operator pays</text>
      <path d="M640 118 C 590 130, 560 130, 505 124" className="rd-e slow" markerEnd="url(#rdarr)" /><text x="572" y="152" className="rd-e-t">txid recorded</text>
      <path d="M230 134 C 230 165, 300 172, 450 172 C 470 172, 470 172, 450 144" className="rd-e burn" markerEnd="url(#rdarr)" /><text x="330" y="186" className="rd-e-t">escrow burned only after payout · {paid} paid so far</text>
    </svg>
  )
}

function OpensIn() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const left = Math.max(0, (REDEEM_OPENS_AT - now) / 1000)
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60)
  return (
    <div className="wd-clock" data-reveal style={stagger(3)}>
      <div className="wd-clock-l mono">redemptions open in</div>
      <div className="wd-digits"><div><b>{pad(d)}</b><span className="mono">days</span></div><i>:</i><div><b>{pad(h)}</b><span className="mono">hours</span></div><i>:</i><div><b>{pad(m)}</b><span className="mono">min</span></div><i>:</i><div><b>{pad(s)}</b><span className="mono">sec</span></div></div>
      <div className="wd-clock-f mono">{new Date(REDEEM_OPENS_AT).toUTCString().replace(' GMT', ' UTC')} · the desk contract is deployed and verified; new requests are paused on chain until then</div>
      <ol className="wd-timeline mono">
        <li className="done"><b>✓</b><span>RedemptionDesk deployed and verified</span><a href={`${CONTRACTS.explorer}/address/${CONTRACTS.desk}?tab=contract`} target="_blank" rel="noreferrer">contract ↗</a></li>
        <li className="done"><b>✓</b><span>escrow-first design: paid before burned, automatically</span><a href="/docs/#/redeem">docs ↗</a></li>
        <li className="now"><b>…</b><span>automatic payouts from a hot float wallet, proven end to end</span></li>
        <li><b>4</b><span>requests unpaused · this form opens</span></li>
      </ol>
    </div>
  )
}
const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0')

export function Redeem() {
  const desk = CONTRACTS.desk
  const preLive = Date.now() < REDEEM_OPENS_AT
  const [info, setInfo] = useState<Desk | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [balance, setBalance] = useState<bigint>(0n)
  const [mine, setMine] = useState<Req[]>([])
  const [recent, setRecent] = useState<Req[]>([])
  const [amount, setAmount] = useState('')
  const [zaddr, setZaddr] = useState('')
  const [zecUsd, setZecUsd] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  useEffect(() => { const t = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => window.clearInterval(t) }, [])
  useEffect(() => { fetch('https://api.coinbase.com/v2/prices/ZEC-USD/spot').then((r) => r.json()).then((j: { data: { amount: string } }) => setZecUsd(Number(j.data.amount))).catch(() => {}) }, [])

  const load = useCallback(async () => {
    if (!desk) return
    const calls: { to: string; data: string }[] = [{ to: desk, data: SEL.minAmount }, { to: desk, data: SEL.requestsPaused }, { to: desk, data: SEL.requestCount }]
    if (account && CONTRACTS.zzec) calls.push({ to: CONTRACTS.zzec, data: SEL.balanceOf + encAddress(account) })
    const res = await readBatchRaw(calls)
    const n = Number(hexToBig(res[2]))
    if (account) setBalance(hexToBig(res[3] ?? '0x'))
    let reqs: Req[] = []
    if (n > 0) {
      const ids = Array.from({ length: Math.min(n, 80) }, (_, i) => n - 1 - i)
      const sums = await readBatchRaw(ids.map((i) => ({ to: desk, data: SEL.summary + u256(BigInt(i)) })))
      reqs = sums.map((s, k) => ({ id: ids[k], holder: wordAddress(s, 0), amount: hexToBig(word(s, 1)), at: Number(hexToBig(word(s, 2))), status: Number(hexToBig(word(s, 3))), txid: word(s, 4), zaddr: '' }))
      const need = reqs.filter((r) => (account && r.holder.toLowerCase() === account.toLowerCase()) || r.status === 2).slice(0, 24)
      if (need.length) { const zs = await readBatchRaw(need.map((r) => ({ to: desk, data: SEL.zcashAddressOf + u256(BigInt(r.id)) }))); need.forEach((r, k) => { r.zaddr = decString(zs[k]) }) }
    }
    const paid = reqs.filter((r) => r.status === 2)
    setInfo({ min: hexToBig(res[0]), paused: hexToBig(res[1]) !== 0n, count: n, paid: paid.length, paidAmount: paid.reduce((s, r) => s + r.amount, 0n) })
    setMine(account ? reqs.filter((r) => r.holder.toLowerCase() === account.toLowerCase()) : [])
    setRecent(paid.slice(0, 6))
  }, [desk, account])
  useEffect(() => { void load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [load])

  const connect = async () => {
    const p = eth(); if (!p) { setMsg({ kind: 'err', text: 'No wallet found. Install a browser wallet with Robinhood Chain added.' }); return }
    try {
      const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }) } catch { await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name, rpcUrls: [CHAIN.rpcPublic], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: [CONTRACTS.explorer] }] }) }
      setAccount(accts[0]); setMsg(null)
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) }
  }
  const send = async (to: string, data: string) => {
    const p = eth()!; const hash = (await p.request({ method: 'eth_sendTransaction', params: [{ from: account, to, data }] })) as string
    for (let i = 0; i < 80; i++) { const r = (await p.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as { status: string } | null; if (r) { if (r.status !== '0x1') throw new Error('transaction reverted'); return hash } await new Promise((res) => setTimeout(res, 1500)) }
    throw new Error('timed out waiting for the transaction')
  }
  const zats = BigInt(Math.round((Number(amount) || 0) * 1e8))
  const step = !account ? 0 : !(zats > 0n && (!info || zats >= info.min) && zats <= balance) ? 1 : !isT(zaddr) ? 2 : 3
  const submit = async () => {
    if (!desk || !account || !CONTRACTS.zzec || step < 3) return
    setBusy('checking allowance'); setMsg(null)
    try {
      const [al] = await readBatchRaw([{ to: CONTRACTS.zzec, data: SEL.allowance + encAddress(account) + encAddress(desk) }])
      if (hexToBig(al) < zats) { setBusy('1 of 2 · approve zZEC in your wallet'); await send(CONTRACTS.zzec, SEL.approve + encAddress(desk) + u256(zats)) }
      setBusy('2 of 2 · confirm the request in your wallet')
      await send(desk, SEL.request + u256(zats) + u256(64n) + encString(zaddr.trim()))
      setMsg({ kind: 'ok', text: `Request opened. ${zec(zats)} ZEC is on its way to ${zaddr.trim().slice(0, 8)}…. Payouts are automatic; watch the request below.` }); setAmount(''); setZaddr('')
      await load()
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(null) }
  }
  const reclaim = async (id: number) => {
    if (!desk) return
    setBusy(`reclaim #${id}`); setMsg(null)
    try { await send(desk, SEL.reclaim + u256(BigInt(id))); setMsg({ kind: 'ok', text: `Reclaimed #${id}. Your zZEC is back in your wallet.` }); await load() } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(null) }
  }

  return (
    <section className="band band-ink rd-band" id="redeem">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Redemption desk</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Burn {TOKEN.wrapper}.
            <br />
            <span className="green">Get native ZEC.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            Your {TOKEN.wrapper} waits in escrow, not in a burn. The desk pays real ZEC to your address, records the Zcash transaction on chain, and only then is the escrow burned. Payouts run automatically, usually within minutes. If one
            ever failed, the contract lets you take your {TOKEN.wrapper} back yourself. No permission, no pause, ever.
          </p>
        </div>

        {!desk ? (
          <div className="redeem-soon" data-reveal style={stagger(3)}><span className="tag tag-wait"><span className="dot" /> pending</span><p>The desk deploys with Phase 03.</p></div>
        ) : preLive ? (
          <>
            <OpensIn />
            <div className="rd-badges" data-reveal style={stagger(4)}>
              <span><b>no fee</b>1:1, the reserve pays the Zcash network fee</span>
              <span><b>escrow, not burn</b>your zZEC is held, and burned only after you are paid</span>
              <span><b>automatic payout</b>usually within minutes · no human in the loop</span>
              <span><b>on-chain receipt</b>every payout's Zcash txid is recorded in the contract</span>
            </div>
            <div className="rd-flow-wrap" data-reveal style={stagger(4)}><RedeemFlow paid={0} /></div>
            <div className="rd-inc" data-reveal style={stagger(5)}>
              <div className="rd-inc-h"><span className="eyebrow">What is in it for you</span><h3 className="h3">Holding {TOKEN.wrapper} should pay. Leaving should cost nothing.</h3></div>
              <div className="rd-inc-grid">
                <a className="rd-inc-card" href="#wrap"><span className="rd-inc-n mono">in</span><b>Wrap for free</b><p>ZEC in, {TOKEN.wrapper} out, one for one. No fee on the way in, no fee on the way out. Opens Sep 7.</p><i className="mono">wrap desk →</i></a>
                <a className="rd-inc-card" href="#liquidity"><span className="rd-inc-n mono">earn</span><b>{ZZEC_MARKET.lpFeePct}% of every trade</b><p>Provide {TOKEN.wrapper} and ETH and you earn the pool fee on every swap, pro rata, withdrawable any time. The burn's {ZZEC_MARKET.hookFeePct}% comes from traders, not from you.</p><i className="mono">join the herd →</i></a>
                <a className="rd-inc-card" href="#liquidity"><span className="rd-inc-n mono">rank</span><b>A public place in the herd</b><p>Liquidity providers are ranked live from chain: Foal, Zebra, Stallion, Herd Leader. Your share, your burns hosted, your fees, in the open.</p><i className="mono">see the board →</i></a>
                <a className="rd-inc-card" href="#contribute"><span className="rd-inc-n mono">burn</span><b>Every trade you host burns ${TOKEN.symbol}</b><p>{ZZEC_MARKET.hookFeePct}% of every swap goes to the Furnace and comes out as burned ${TOKEN.symbol}. More depth, more volume, more burn.</p><i className="mono">how it compounds →</i></a>
              </div>
              <div className="rd-inc-soon mono"><span className="tag tag-wait"><span className="dot" /> under consideration</span> a {TOKEN.wrapper}-paid rewards program for liquidity providers and a launch bonus for early wraps. Not live, not promised. If either ships, the budget and end date appear here first.</div>
            </div>
          </>
        ) : (
          <>
            <div className="rd-badges" data-reveal style={stagger(3)}>
              <span><b>no fee</b>1:1, the reserve pays the Zcash network fee</span>
              <span><b>escrow, not burn</b>your zZEC is held, and burned only after you are paid</span>
              <span><b>automatic payout</b>usually within minutes · no human in the loop</span>
              <span><b>on-chain receipt</b>every payout's Zcash txid is recorded in the contract</span>
            </div>
            <div className="rd-flow-wrap" data-reveal style={stagger(3)}><RedeemFlow paid={info?.paid ?? 0} /></div>
            <div className="rd-strip mono" data-reveal style={stagger(3)}>
              <div><span>requests</span><b>{info?.count ?? '…'}</b></div>
              <div><span>paid out</span><b>{info ? `${zec(info.paidAmount)} ZEC` : '…'}</b><i>{info ? `${info.paid} redemptions` : ''}</i></div>
              <div><span>minimum</span><b>{info ? `${zec(info.min)} ${TOKEN.wrapper}` : '…'}</b></div>
              <div><span>fee</span><b>none</b><i>the reserve pays the Zcash network fee</i></div>
              <div><span>payout</span><b>automatic</b><i>usually within minutes</i></div>
            </div>

            <div className="rd-grid" data-reveal style={stagger(4)}>
              <div className="rd-form">
                <ol className="rd-steps mono">
                  <li className={step >= 1 ? 'done' : 'now'}><b>1</b>connect</li>
                  <li className={step > 1 ? 'done' : step === 1 ? 'now' : ''}><b>2</b>amount</li>
                  <li className={step > 2 ? 'done' : step === 2 ? 'now' : ''}><b>3</b>zcash address</li>
                  <li className={step === 3 ? 'now' : ''}><b>4</b>confirm</li>
                </ol>
                {!account ? (
                  <div className="rd-connect">
                    <button className="btn btn-primary btn-lg" type="button" onClick={connect}>Connect wallet</button>
                    <p className="mono">Robinhood Chain · {CHAIN.id}. Any wallet that can add a network.</p>
                  </div>
                ) : (
                  <>
                    <div className="rd-acct mono"><span className="dot" />{account.slice(0, 6)}…{account.slice(-4)}<em>balance {zec(balance)} {TOKEN.wrapper}</em></div>
                    <label className="redeem-l mono">amount to redeem</label>
                    <div className={`rd-amt ${zats > balance ? 'bad' : ''}`}>
                      <input className="mono" inputMode="decimal" placeholder="0.00000000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      <span className="mono rd-unit">{TOKEN.wrapper}</span>
                      <button type="button" className="rd-max mono" onClick={() => setAmount(zec(balance).replace(/,/g, ''))}>max</button>
                    </div>
                    <div className="rd-sub mono">{zats > 0n ? <>you receive <b>{zec(zats)} ZEC</b>{zecUsd ? ` · about $${(Number(zats) / 1e8 * zecUsd).toFixed(2)}` : ''}</> : 'exactly what you escrow, 1:1'}{zats > balance && <span className="rd-warn"> · more than you hold</span>}{info && zats > 0n && zats < info.min && <span className="rd-warn"> · below the minimum</span>}</div>
                    <label className="redeem-l mono">your transparent Zcash address</label>
                    <div className={`rd-amt ${zaddr && !isT(zaddr) ? 'bad' : ''}`}><input className="mono" placeholder="t1…" value={zaddr} onChange={(e) => setZaddr(e.target.value)} spellCheck={false} /><span className={`mono rd-unit ${isT(zaddr) ? 'ok' : ''}`}>{isT(zaddr) ? 'valid' : 't1 / t3'}</span></div>
                    <div className="rd-sub mono">transparent only, so the payout can be shown on chain. Shield it on the Zcash side afterwards.</div>
                    <button className="btn btn-primary btn-lg rd-go" type="button" disabled={!!busy || !!info?.paused || step < 3} onClick={submit}>
                      {busy ?? (info?.paused ? 'new requests paused' : step < 3 ? 'fill in the two fields' : `Redeem ${zec(zats)} ${TOKEN.wrapper} → ZEC`)}
                    </button>
                  </>
                )}
                {msg && <p className={`rd-msg mono ${msg.kind}`}>{msg.text}</p>}
                <div className="rd-how mono">
                  <div><b>01</b>{TOKEN.wrapper} moves into escrow. Still yours.</div>
                  <div><b>02</b>operator pays native ZEC to your t-address</div>
                  <div><b>03</b>txid recorded on chain, escrow burned</div>
                  <div><b>04</b>if a payout ever failed, <em>reclaim</em> your {TOKEN.wrapper} yourself</div>
                </div>
                <p className="redeem-fine mono"><a href={`${CONTRACTS.explorer}/address/${desk}?tab=contract`} target="_blank" rel="noreferrer">desk contract ↗</a> · <a href="/docs/#/redeem">how it works ↗</a></p>
              </div>

              <div className="rd-lists">
                {account && (
                  <div>
                    <div className="redeem-h mono">your requests</div>
                    {mine.length === 0 && <div className="redeem-empty mono">none yet</div>}
                    {mine.map((r) => {
                      const elapsed = Math.min(1, Math.max(0, (now - r.at) / WINDOW)); const left = r.at + WINDOW - now
                      return (
                        <div className={`rd-card s${r.status}`} key={r.id}>
                          <div className="rd-card-top">
                            <span className="mono rd-id">#{r.id}</span>
                            <span className="rd-card-amt">{zec(r.amount)} <span className="mono">{TOKEN.wrapper}</span></span>
                            <span className={`tag ${r.status === 2 ? 'tag-live' : 'tag-wait'}`}>{STATUS[r.status]}</span>
                          </div>
                          <div className="mono rd-card-to">→ {r.zaddr || '…'}</div>
                          {r.status === 1 && (
                            <div className="rd-prog">
                              <div className="rd-prog-bar"><div style={{ width: `${elapsed * 100}%` }} /></div>
                              <div className="mono rd-prog-l">{left > 0 ? 'awaiting automatic payout' : 'payout did not arrive · you can reclaim'}</div>
                              {left <= 0 && <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => reclaim(r.id)}>reclaim my {TOKEN.wrapper}</button>}
                            </div>
                          )}
                          {r.status === 2 && <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">paid · view on Zcash ↗</a>}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div>
                  <div className="redeem-h mono">recent payouts</div>
                  {recent.length === 0 && <div className="redeem-empty mono">no redemptions paid yet · the first one lands here with its Zcash transaction</div>}
                  {recent.map((r) => (
                    <div className="redeem-row" key={r.id}>
                      <span className="mono">#{r.id}</span>
                      <span className="mono">{zec(r.amount)} {TOKEN.wrapper}</span>
                      <span className="mono redeem-addr">{r.zaddr.slice(0, 8)}…{r.zaddr.slice(-4)}</span>
                      <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">zcash tx ↗</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rd-inc" data-reveal style={stagger(5)}>
              <div className="rd-inc-h"><span className="eyebrow">What is in it for you</span><h3 className="h3">Holding {TOKEN.wrapper} should pay. Leaving should cost nothing.</h3></div>
              <div className="rd-inc-grid">
                <a className="rd-inc-card" href="#wrap"><span className="rd-inc-n mono">in</span><b>Wrap for free</b><p>ZEC in, {TOKEN.wrapper} out, one for one. No fee on the way in, no fee on the way out. Opens Sep 7.</p><i className="mono">wrap desk →</i></a>
                <a className="rd-inc-card" href="#liquidity"><span className="rd-inc-n mono">earn</span><b>{ZZEC_MARKET.lpFeePct}% of every trade</b><p>Provide {TOKEN.wrapper} and ETH and you earn the pool fee on every swap, pro rata, withdrawable any time. The burn's {ZZEC_MARKET.hookFeePct}% comes from traders, not from you.</p><i className="mono">join the herd →</i></a>
                <a className="rd-inc-card" href="#liquidity"><span className="rd-inc-n mono">rank</span><b>A public place in the herd</b><p>Liquidity providers are ranked live from chain: Foal, Zebra, Stallion, Herd Leader. Your share, your burns hosted, your fees, in the open.</p><i className="mono">see the board →</i></a>
                <a className="rd-inc-card" href="#contribute"><span className="rd-inc-n mono">burn</span><b>Every trade you host burns ${TOKEN.symbol}</b><p>{ZZEC_MARKET.hookFeePct}% of every swap goes to the Furnace and comes out as burned ${TOKEN.symbol}. More depth, more volume, more burn.</p><i className="mono">how it compounds →</i></a>
              </div>
              <div className="rd-inc-soon mono"><span className="tag tag-wait"><span className="dot" /> under consideration</span> a {TOKEN.wrapper}-paid rewards program for liquidity providers and a launch bonus for early wraps. Not live, not promised. If either ships, the budget and end date appear here first.</div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
