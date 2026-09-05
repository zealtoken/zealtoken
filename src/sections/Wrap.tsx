import { useCallback, useEffect, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, TOKEN } from '../config'
import { hexToBig, readBatchRaw, word, wordAddress } from '../lib/chain'
import { stagger } from '../useReveal'

/** Wrap desk: open a request, send the exact ZEC amount to the reserve, receive zZEC 1:1. */
const SEL = { request: '0xd845a4b3', cancel: '0x40e58ee5', requestCount: '0x5badbe4c', summary: '0x6152e655', minAmount: '0x9b2cb5d8', requestsPaused: '0xe43b7531' } as const
const CHAIN_HEX = '0x' + CHAIN.id.toString(16)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum
const u256 = (n: bigint) => n.toString(16).padStart(64, '0')
const zec = (z: bigint) => (Number(z) / 1e8).toFixed(8)

type Req = { id: number; requester: string; amount: bigint; at: number; status: number; txid: string; deposit: bigint }
const STATUS = ['', 'awaiting your ZEC', 'minted', 'cancelled', 'rejected']

export function Wrap() {
  const desk = CONTRACTS.wrapDesk
  const [info, setInfo] = useState<{ min: bigint; paused: boolean; count: number } | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [mine, setMine] = useState<Req[]>([])
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!desk) return
    const [min, paused, count] = await readBatchRaw([{ to: desk, data: SEL.minAmount }, { to: desk, data: SEL.requestsPaused }, { to: desk, data: SEL.requestCount }])
    const n = Number(hexToBig(count))
    setInfo({ min: hexToBig(min), paused: hexToBig(paused) !== 0n, count: n })
    if (!account || n === 0) { setMine([]); return }
    const ids = Array.from({ length: Math.min(n, 80) }, (_, i) => n - 1 - i)
    const sums = await readBatchRaw(ids.map((i) => ({ to: desk, data: SEL.summary + u256(BigInt(i)) })))
    const reqs: Req[] = sums.map((s, k) => ({ id: ids[k], requester: wordAddress(s, 0), amount: hexToBig(word(s, 1)), at: Number(hexToBig(word(s, 2))), status: Number(hexToBig(word(s, 3))), txid: word(s, 4), deposit: hexToBig(word(s, 5)) }))
    setMine(reqs.filter((r) => r.requester.toLowerCase() === account.toLowerCase()))
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
    if (!desk || !account) return
    const zats = BigInt(Math.round(Number(amount) * 1e8))
    if (!(zats > 0n)) { setMsg('Enter an amount.'); return }
    if (zats % 100000n !== 0n) { setMsg('Amounts are in steps of 0.001 ZEC.'); return }
    if (info && zats < info.min) { setMsg(`Minimum is ${zec(info.min)} ZEC.`); return }
    setBusy('confirm the request in your wallet'); setMsg(null)
    try { await send(desk, SEL.request + u256(zats)); setMsg('Request opened. Send the exact deposit shown below from your Zcash wallet.'); setAmount(''); await load() }
    catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }
  const cancel = async (id: number) => {
    if (!desk) return
    setBusy(`cancel #${id}`); setMsg(null)
    try { await send(desk, SEL.cancel + u256(BigInt(id))); await load() } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }
  const copy = async (s: string, k: string) => { try { await navigator.clipboard.writeText(s); setCopied(k); setTimeout(() => setCopied(null), 1200) } catch { /* no clipboard */ } }

  return (
    <section className="band" id="wrap">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow" data-reveal>Wrap desk</p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            Send ZEC.
            <br />
            <span className="green">Get {TOKEN.wrapper}, 1:1.</span>
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            Open a request for the amount you want. The desk gives you an exact deposit, unique to your request by its last
            digits. Send that from any Zcash wallet to the published reserve address. Once it confirms, the operator records
            the Zcash transaction on chain and the desk mints your {TOKEN.wrapper}. Every mint carries its reason.
          </p>
        </div>

        {!desk ? (
          <div className="redeem-soon" data-reveal style={stagger(3)}>
            <span className="tag tag-wait"><span className="dot" /> pending</span>
            <p>The desk is written and tested. It becomes the {TOKEN.wrapper} minter through the wrapper's 48-hour timelock, and this form opens when that commits.</p>
          </div>
        ) : (
          <div className="redeem-grid" data-reveal style={stagger(3)}>
            <div className="redeem-form">
              {!account ? <button className="btn btn-primary" type="button" onClick={connect}>Connect wallet</button> : (
                <>
                  <div className="mono redeem-acct">{account.slice(0, 6)}…{account.slice(-4)} · {CHAIN.name}</div>
                  <label className="redeem-l mono">amount (ZEC to wrap){info ? ` · min ${zec(info.min)} · steps of 0.001` : ''}</label>
                  <input className="redeem-in mono" inputMode="decimal" placeholder="0.100" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <button className="btn btn-primary" type="button" disabled={!!busy || !!info?.paused} onClick={submit}>{busy ?? (info?.paused ? 'new requests paused' : 'Open wrap request')}</button>
                </>
              )}
              {msg && <p className="redeem-msg mono">{msg}</p>}
              <p className="redeem-fine mono">
                1:1, no wrap fee · the tag digits stay in the reserve as extra coverage · mints are bounded by the attested reserve ·{' '}
                <a href={`${CONTRACTS.explorer}/address/${desk}?tab=contract`} target="_blank" rel="noreferrer">desk contract ↗</a>
              </p>
            </div>
            <div className="redeem-lists">
              {account && (
                <div>
                  <div className="redeem-h mono">your requests · {info?.count ?? 0} total on the desk</div>
                  {mine.length === 0 && <div className="redeem-empty mono">none yet</div>}
                  {mine.map((r) => (
                    <div className="wrap-card" key={r.id}>
                      <div className="redeem-row">
                        <span className="mono">#{r.id}</span>
                        <span className="mono">{zec(r.amount)} {TOKEN.wrapper}</span>
                        <span className={`tag ${r.status === 2 ? 'tag-live' : 'tag-wait'}`}>{STATUS[r.status]}</span>
                        {r.status === 2 && <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">zcash tx ↗</a>}
                        {r.status === 1 && <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => cancel(r.id)}>cancel</button>}
                      </div>
                      {r.status === 1 && TOKEN.reserveAddress && (
                        <div className="wrap-pay mono">
                          <div>send exactly <b>{zec(r.deposit)} ZEC</b> <button className="copy" type="button" onClick={() => copy(zec(r.deposit), `a${r.id}`)}>{copied === `a${r.id}` ? 'copied' : 'copy'}</button></div>
                          <div>to <b>{TOKEN.reserveAddress}</b> <button className="copy" type="button" onClick={() => copy(TOKEN.reserveAddress!, `t${r.id}`)}>{copied === `t${r.id}` ? 'copied' : 'copy'}</button></div>
                          <div className="wrap-note">the last digits are your request tag: send the exact figure, from a transparent or shielded wallet, in one payment. Minting follows 3 confirmations and the next attestation.</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
