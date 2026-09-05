import { useCallback, useEffect, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, TOKEN } from '../config'
import { encAddress, hexToBig, readBatchRaw, word, wordAddress } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * Redemption Desk: escrow zZEC, receive native ZEC, or take your zZEC back after
 * 7 days if nobody paid. Talks to the wallet directly (EIP-1193), no library.
 */
const SEL = {
  request: '0x8163ba11', reclaim: '0x2dabbeed', approve: '0x095ea7b3', allowance: '0xdd62ed3e',
  requestCount: '0x5badbe4c', summary: '0x6152e655', zcashAddressOf: '0x0d6d49c2', minAmount: '0x9b2cb5d8', requestsPaused: '0xe43b7531',
} as const
const WINDOW = 7 * 86400
const CHAIN_HEX = '0x' + CHAIN.id.toString(16)

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...x: unknown[]) => void) => void }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum
const u256 = (n: bigint) => n.toString(16).padStart(64, '0')
const encString = (s: string) => { const b = new TextEncoder().encode(s); const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); return u256(BigInt(b.length)) + hex.padEnd(Math.ceil(hex.length / 64) * 64, '0') }
const decString = (hex: string) => { const off = Number(hexToBig(word(hex, 0))) * 2; const len = Number(BigInt('0x' + hex.slice(2 + off, 2 + off + 64))); const data = hex.slice(2 + off + 64, 2 + off + 64 + len * 2); return new TextDecoder().decode(new Uint8Array(data.match(/.{2}/g)!.map((h) => parseInt(h, 16)))) }

type Req = { id: number; holder: string; amount: number; at: number; status: number; txid: string; zaddr: string }
type Desk = { min: number; paused: boolean; count: number }

export function Redeem() {
  const desk = CONTRACTS.desk
  const [info, setInfo] = useState<Desk | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [mine, setMine] = useState<Req[]>([])
  const [recent, setRecent] = useState<Req[]>([])
  const [amount, setAmount] = useState('')
  const [zaddr, setZaddr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!desk) return
    const [min, paused, count] = await readBatchRaw([{ to: desk, data: SEL.minAmount }, { to: desk, data: SEL.requestsPaused }, { to: desk, data: SEL.requestCount }])
    const n = Number(hexToBig(count))
    setInfo({ min: Number(hexToBig(min)) / 1e8, paused: hexToBig(paused) !== 0n, count: n })
    if (n === 0) { setMine([]); setRecent([]); return }
    const ids = Array.from({ length: Math.min(n, 60) }, (_, i) => n - 1 - i) // newest 60
    const sums = await readBatchRaw(ids.map((i) => ({ to: desk, data: SEL.summary + u256(BigInt(i)) })))
    const reqs: Req[] = sums.map((s, k) => ({ id: ids[k], holder: wordAddress(s, 0), amount: Number(hexToBig(word(s, 1))) / 1e8, at: Number(hexToBig(word(s, 2))), status: Number(hexToBig(word(s, 3))), txid: word(s, 4), zaddr: '' }))
    const need = reqs.filter((r) => (account && r.holder.toLowerCase() === account.toLowerCase()) || r.status === 2).slice(0, 20)
    if (need.length) {
      const zs = await readBatchRaw(need.map((r) => ({ to: desk, data: SEL.zcashAddressOf + u256(BigInt(r.id)) })))
      need.forEach((r, k) => { r.zaddr = decString(zs[k]) })
    }
    setMine(account ? reqs.filter((r) => r.holder.toLowerCase() === account.toLowerCase()) : [])
    setRecent(reqs.filter((r) => r.status === 2).slice(0, 8))
  }, [desk, account])

  useEffect(() => { void load(); const t = window.setInterval(load, 30_000); return () => window.clearInterval(t) }, [load])

  const connect = async () => {
    const p = eth(); if (!p) { setMsg('No wallet found. Install a browser wallet with Robinhood Chain added.'); return }
    try {
      const accts = (await p.request({ method: 'eth_requestAccounts' })) as string[]
      try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] }) } catch { await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: CHAIN_HEX, chainName: CHAIN.name, rpcUrls: [CHAIN.rpc], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: [CONTRACTS.explorer] }] }) }
      setAccount(accts[0]); setMsg(null)
    } catch (e) { setMsg((e as Error).message) }
  }

  const send = async (to: string, data: string) => {
    const p = eth()!; const hash = (await p.request({ method: 'eth_sendTransaction', params: [{ from: account, to, data }] })) as string
    for (let i = 0; i < 60; i++) { const r = (await p.request({ method: 'eth_getTransactionReceipt', params: [hash] })) as { status: string } | null; if (r) { if (r.status !== '0x1') throw new Error('transaction reverted'); return hash } await new Promise((res) => setTimeout(res, 1500)) }
    throw new Error('timed out waiting for the transaction')
  }

  const submit = async () => {
    if (!desk || !account || !CONTRACTS.zzec) return
    const zats = BigInt(Math.round(Number(amount) * 1e8))
    if (!(zats > 0n)) { setMsg('Enter an amount.'); return }
    if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(zaddr.trim())) { setMsg('That is not a transparent Zcash address (t1… or t3…, 35 characters).'); return }
    setBusy('checking allowance'); setMsg(null)
    try {
      const [al] = await readBatchRaw([{ to: CONTRACTS.zzec, data: SEL.allowance + encAddress(account) + encAddress(desk) }])
      if (hexToBig(al) < zats) { setBusy('approve zZEC in your wallet'); await send(CONTRACTS.zzec, SEL.approve + encAddress(desk) + u256(zats)) }
      setBusy('confirm the request in your wallet')
      await send(desk, SEL.request + u256(zats) + u256(64n) + encString(zaddr.trim()))
      setMsg(`Requested. ZEC goes to ${zaddr.trim()}; if it has not arrived in 7 days you can reclaim your zZEC below.`); setAmount(''); setZaddr('')
      await load()
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }

  const reclaim = async (id: number) => {
    if (!desk) return
    setBusy(`reclaim #${id}`); setMsg(null)
    try { await send(desk, SEL.reclaim + u256(BigInt(id))); setMsg(`Reclaimed #${id}. Your zZEC is back in your wallet.`); await load() } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }

  const now = Math.floor(Date.now() / 1000)
  const statusText = ['', 'open', 'paid', 'reclaimed']

  return (
    <section className="band band-tint" id="redeem">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Redemption desk</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Burn {TOKEN.wrapper}.
            <br />
            <span className="green">Get native ZEC.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            Escrow {TOKEN.wrapper} with a transparent Zcash address. The operator pays you real ZEC, records the Zcash transaction
            on chain, and only then is your {TOKEN.wrapper} burned. If nothing arrives within 7 days, you take your {TOKEN.wrapper}
            back yourself. Nobody can stop that.
          </p>
        </div>

        {!desk ? (
          <div className="redeem-soon" data-reveal style={stagger(3)}>
            <span className="tag tag-wait"><span className="dot" /> pending</span>
            <p>The desk contract is written and tested. It deploys with Phase 03, and this form goes live with it.</p>
          </div>
        ) : (
          <div className="redeem-grid" data-reveal style={stagger(3)}>
            <div className="redeem-form">
              {!account ? (
                <button className="btn btn-primary" type="button" onClick={connect}>Connect wallet</button>
              ) : (
                <>
                  <div className="mono redeem-acct">{account.slice(0, 6)}…{account.slice(-4)} · {CHAIN.name}</div>
                  <label className="redeem-l mono">amount ({TOKEN.wrapper}){info ? ` · min ${info.min}` : ''}</label>
                  <input className="redeem-in mono" inputMode="decimal" placeholder="0.10000000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <label className="redeem-l mono">your transparent Zcash address</label>
                  <input className="redeem-in mono" placeholder="t1…" value={zaddr} onChange={(e) => setZaddr(e.target.value)} />
                  <button className="btn btn-primary" type="button" disabled={!!busy || !!info?.paused} onClick={submit}>
                    {busy ?? (info?.paused ? 'new requests paused' : `Redeem ${TOKEN.wrapper}`)}
                  </button>
                </>
              )}
              {msg && <p className="redeem-msg mono">{msg}</p>}
              <p className="redeem-fine mono">
                paid in native ZEC from the reserve · zcash transaction id recorded on chain · 7-day reclaim if unpaid ·{' '}
                <a href={`${CONTRACTS.explorer}/address/${desk}?tab=contract`} target="_blank" rel="noreferrer">desk contract ↗</a>
              </p>
            </div>

            <div className="redeem-lists">
              {account && (
                <div>
                  <div className="redeem-h mono">your requests</div>
                  {mine.length === 0 && <div className="redeem-empty mono">none yet</div>}
                  {mine.map((r) => (
                    <div className="redeem-row" key={r.id}>
                      <span className="mono">#{r.id}</span>
                      <span className="mono">{r.amount.toFixed(8)} {TOKEN.wrapper}</span>
                      <span className={`tag ${r.status === 2 ? 'tag-live' : 'tag-wait'}`}>{statusText[r.status]}</span>
                      {r.status === 2 && <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">zcash tx ↗</a>}
                      {r.status === 1 && (now >= r.at + WINDOW
                        ? <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => reclaim(r.id)}>reclaim</button>
                        : <span className="mono redeem-eta">reclaimable {new Date((r.at + WINDOW) * 1000).toLocaleDateString()}</span>)}
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="redeem-h mono">recent payouts · {info?.count ?? 0} requests total</div>
                {recent.length === 0 && <div className="redeem-empty mono">no redemptions paid yet</div>}
                {recent.map((r) => (
                  <div className="redeem-row" key={r.id}>
                    <span className="mono">#{r.id}</span>
                    <span className="mono">{r.amount.toFixed(8)} {TOKEN.wrapper}</span>
                    <span className="mono redeem-addr">{r.zaddr.slice(0, 8)}…{r.zaddr.slice(-4)}</span>
                    <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">zcash tx ↗</a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
