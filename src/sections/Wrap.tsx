import { useCallback, useEffect, useState } from 'react'
import { CHAIN, CONTRACTS, LINKS, TOKEN, WRAP_OPENS_AT } from '../config'
import { encAddress, hexToBig, readBatchRaw, word, wordAddress } from '../lib/chain'
import { stagger } from '../useReveal'

/**
 * Wrap desk. Before the desk is the zZEC minter it shows a live countdown to
 * the scheduled opening, with the on-chain role timelock tracked separately.
 * Once live: open a request, send the exact deposit, receive zZEC 1:1.
 */
const SEL = { request: '0xd845a4b3', cancel: '0x40e58ee5', requestCount: '0x5badbe4c', summary: '0x6152e655', minAmount: '0x9b2cb5d8', requestsPaused: '0xe43b7531', pendingMinter: '0x91c5df49', minter: '0x07546172' } as const
const WRAP_DESK_DEPLOYED = '0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
const PROPOSAL_TX = '0x7e38dabb29bb3ca49acd7318c1b0c2178308ce40e6d16495403688b90d5cb3dc'
const CHAIN_HEX = '0x' + CHAIN.id.toString(16)
type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum
const u256 = (n: bigint) => n.toString(16).padStart(64, '0')
const zec = (z: bigint) => (Number(z) / 1e8).toFixed(8)
type Req = { id: number; requester: string; amount: bigint; at: number; status: number; txid: string; deposit: bigint }
const STATUS = ['', 'awaiting your ZEC', 'minted', 'cancelled', 'rejected']
const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0')

function Countdown({ eta, minterIsDesk }: { eta: number; minterIsDesk: boolean }) {
  const [now, setNow] = useState(Date.now() / 1000)
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now() / 1000), 1000); return () => window.clearInterval(t) }, [])
  const openingAt = Math.max(WRAP_OPENS_AT, eta)
  const left = openingAt - now
  const timelockPending = !minterIsDesk && eta > now
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60)
  const phase = left > 0 ? 'scheduled' : minterIsDesk ? 'committed' : 'ready'
  return (
    <div className="wd-clock" data-reveal style={stagger(3)}>
      <div className="wd-clock-l mono">{phase === 'scheduled' ? 'the wrap desk opens in' : phase === 'ready' ? 'scheduled opening reached · activation pending' : 'desk activated · opening pending'}</div>
      {phase === 'scheduled' ? (
        <div className="wd-digits">
          <div><b>{pad(d)}</b><span className="mono">days</span></div><i>:</i>
          <div><b>{pad(h)}</b><span className="mono">hours</span></div><i>:</i>
          <div><b>{pad(m)}</b><span className="mono">min</span></div><i>:</i>
          <div><b>{pad(s)}</b><span className="mono">sec</span></div>
        </div>
      ) : <div className="wd-digits one"><b>opening pending</b></div>}
      <div className="wd-clock-f mono">{new Date(openingAt * 1000).toUTCString().replace(' GMT', ' UTC')} · scheduled public opening</div>
      <ol className="wd-timeline mono">
        <li className="done"><b>✓</b><span>WrapDesk deployed and verified</span><a href={`${CONTRACTS.explorer}/address/${WRAP_DESK_DEPLOYED}?tab=contract`} target="_blank" rel="noreferrer">{WRAP_DESK_DEPLOYED.slice(0, 8)}… ↗</a></li>
        <li className="done"><b>✓</b><span>minter rotation proposed on {TOKEN.wrapper}</span><a href={`${CONTRACTS.explorer}/tx/${PROPOSAL_TX}`} target="_blank" rel="noreferrer">tx ↗</a></li>
        <li className={timelockPending ? 'now' : eta || minterIsDesk ? 'done' : ''}><b>{timelockPending ? '…' : eta || minterIsDesk ? '✓' : '3'}</b><span>48-hour public timelock</span><em>{eta ? `eligible ${new Date(eta * 1000).toUTCString().replace(' GMT', ' UTC')}` : minterIsDesk ? 'complete' : 'reading chain status…'}</em></li>
        <li className={minterIsDesk ? 'done' : !timelockPending && eta ? 'now' : ''}><b>{minterIsDesk ? '✓' : '4'}</b><span>commit: the desk becomes the only minter</span></li>
        <li className={phase === 'committed' ? 'now' : ''}><b>5</b><span>this form opens · send ZEC, get {TOKEN.wrapper} 1:1</span></li>
      </ol>
    </div>
  )
}

export function Wrap() {
  const desk = CONTRACTS.wrapDesk
  const [scheduledOpen, setScheduledOpen] = useState(() => Date.now() / 1000 >= WRAP_OPENS_AT)
  useEffect(() => {
    const delay = WRAP_OPENS_AT * 1000 - Date.now()
    if (delay <= 0) return
    const timer = window.setTimeout(() => setScheduledOpen(true), delay + 1)
    return () => window.clearTimeout(timer)
  }, [])
  const [eta, setEta] = useState<number | null>(null)
  const [minterIsDesk, setMinterIsDesk] = useState(false)
  const [info, setInfo] = useState<{ min: bigint; paused: boolean; count: number; minted: bigint } | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [mine, setMine] = useState<Req[]>([])
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [zecUsd, setZecUsd] = useState<number | null>(null)
  useEffect(() => { fetch('https://api.coinbase.com/v2/prices/ZEC-USD/spot').then((r) => r.json()).then((j: { data: { amount: string } }) => setZecUsd(Number(j.data.amount))).catch(() => {}) }, [])

  // the countdown reads the real timelock
  useEffect(() => {
    if (!CONTRACTS.zzec) return
    const run = async () => { try { const [pm, mi] = await readBatchRaw([{ to: CONTRACTS.zzec!, data: SEL.pendingMinter }, { to: CONTRACTS.zzec!, data: SEL.minter }]); const e = Number(hexToBig(word(pm, 1))); setEta(e || null); setMinterIsDesk(wordAddress(mi, 0).toLowerCase() === WRAP_DESK_DEPLOYED.toLowerCase()) } catch { /* keep */ } }
    void run(); const t = window.setInterval(run, 60_000); return () => window.clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    if (!desk) return
    const [min, paused, count] = await readBatchRaw([{ to: desk, data: SEL.minAmount }, { to: desk, data: SEL.requestsPaused }, { to: desk, data: SEL.requestCount }])
    const n = Number(hexToBig(count))
    let reqs: Req[] = []
    if (n > 0) {
      const ids = Array.from({ length: Math.min(n, 80) }, (_, i) => n - 1 - i)
      const sums = await readBatchRaw(ids.map((i) => ({ to: desk, data: SEL.summary + u256(BigInt(i)) })))
      reqs = sums.map((s, k) => ({ id: ids[k], requester: wordAddress(s, 0), amount: hexToBig(word(s, 1)), at: Number(hexToBig(word(s, 2))), status: Number(hexToBig(word(s, 3))), txid: word(s, 4), deposit: hexToBig(word(s, 5)) }))
    }
    setInfo({ min: hexToBig(min), paused: hexToBig(paused) !== 0n, count: n, minted: reqs.filter((r) => r.status === 2).reduce((s, r) => s + r.amount, 0n) })
    setMine(account ? reqs.filter((r) => r.requester.toLowerCase() === account.toLowerCase()) : [])
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
  const aligned = zats > 0n && zats % 100000n === 0n
  const step = !account ? 0 : !(aligned && (!info || zats >= info.min)) ? 1 : 2
  const submit = async () => {
    if (!desk || !scheduledOpen || !minterIsDesk || !account || step < 2) return
    setBusy('confirm the request in your wallet'); setMsg(null)
    try { await send(desk, SEL.request + u256(zats)); setMsg({ kind: 'ok', text: 'Request opened. Your deposit line is below: send the exact figure from any Zcash wallet.' }); setAmount(''); await load() }
    catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(null) }
  }
  const cancel = async (id: number) => { if (!desk) return; setBusy(`cancel #${id}`); setMsg(null); try { await send(desk, SEL.cancel + u256(BigInt(id))); await load() } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(null) } }
  const copy = async (s: string, k: string) => { try { await navigator.clipboard.writeText(s); setCopied(k); setTimeout(() => setCopied(null), 1200) } catch { /* no clipboard */ } }
  const encAddressUnused = encAddress; void encAddressUnused

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
            Open a request, get an exact deposit figure that is unique to you, send it from any Zcash wallet, and the desk
            mints your {TOKEN.wrapper} after three confirmations. No fee. Every mint passes through the desk with its reason
            recorded, because the desk is the only thing allowed to mint.
          </p>
        </div>

        {!desk || !scheduledOpen || !minterIsDesk ? (
          <>
            <Countdown eta={eta ?? 0} minterIsDesk={minterIsDesk} />
            <div className="wd-preview" data-reveal style={stagger(4)}>
              <div className="wd-pv-h mono">what it will look like</div>
              <div className="wd-pv-grid">
                <div className="wd-pv-card"><span className="mono">01</span><b>Choose an amount</b><p>Steps of 0.001 ZEC, minimum 0.001. One wallet click opens the request. Gas only.</p></div>
                <div className="wd-pv-card"><span className="mono">02</span><b>Send the exact deposit</b><p>Your amount plus a few zatoshi that identify your request. From a shielded or transparent wallet, in one payment.</p></div>
                <div className="wd-pv-card"><span className="mono">03</span><b>Receive {TOKEN.wrapper}</b><p>Three confirmations, one attestation, and the desk mints to the wallet that opened the request. The Zcash transaction is linked on chain.</p></div>
              </div>
              <div className="wd-pv-foot mono">until then: <a href={LINKS.uniswapSwap} target="_blank" rel="noreferrer">buy {TOKEN.wrapper} on Uniswap ↗</a> · <a href="/docs/#/wrap">read how wrapping works ↗</a></div>
            </div>
          </>
        ) : (
          <>
            <div className="rd-strip mono" data-reveal style={stagger(3)}>
              <div><span>requests</span><b>{info?.count ?? '…'}</b></div>
              <div><span>minted via wraps</span><b>{info ? `${zec(info.minted)} ${TOKEN.wrapper}` : '…'}</b></div>
              <div><span>minimum</span><b>{info ? `${zec(info.min)} ZEC` : '…'}</b><i>steps of 0.001</i></div>
              <div><span>fee</span><b>none</b><i>1:1, the tag digits stay as coverage</i></div>
              <div><span>confirmations</span><b>3</b><i>about 4 minutes</i></div>
            </div>
            <div className="rd-grid" data-reveal style={stagger(4)}>
              <div className="rd-form">
                <ol className="rd-steps mono">
                  <li className={step >= 1 ? 'done' : 'now'}><b>1</b>connect</li>
                  <li className={step > 1 ? 'done' : step === 1 ? 'now' : ''}><b>2</b>amount</li>
                  <li className={step === 2 ? 'now' : ''}><b>3</b>open request</li>
                  <li><b>4</b>send ZEC</li>
                </ol>
                {!account ? (
                  <div className="rd-connect"><button className="btn btn-primary btn-lg" type="button" onClick={connect}>Connect wallet</button><p className="mono">Robinhood Chain · {CHAIN.id}. Your {TOKEN.wrapper} arrives here.</p></div>
                ) : (
                  <>
                    <div className="rd-acct mono"><span className="dot" />{account.slice(0, 6)}…{account.slice(-4)}<em>receives the {TOKEN.wrapper}</em></div>
                    <label className="redeem-l mono">ZEC to wrap</label>
                    <div className={`rd-amt ${amount && !aligned ? 'bad' : ''}`}>
                      <input className="mono" inputMode="decimal" placeholder="0.100" value={amount} onChange={(e) => setAmount(e.target.value)} />
                      <span className="mono rd-unit">ZEC</span>
                      {['0.01', '0.1', '1'].map((q) => <button key={q} type="button" className="rd-max mono" onClick={() => setAmount(q)}>{q}</button>)}
                    </div>
                    <div className="rd-sub mono">{zats > 0n ? <>you receive <b>{zec(zats)} {TOKEN.wrapper}</b>{zecUsd ? ` · about $${(Number(zats) / 1e8 * zecUsd).toFixed(2)}` : ''}</> : 'exactly what you send, 1:1'}{amount && !aligned && <span className="rd-warn"> · use steps of 0.001</span>}</div>
                    <button className="btn btn-primary btn-lg rd-go" type="button" disabled={!!busy || !!info?.paused || step < 2} onClick={submit}>{busy ?? (info?.paused ? 'new requests paused' : step < 2 ? 'enter an amount' : `Open request for ${zec(zats)} ${TOKEN.wrapper}`)}</button>
                  </>
                )}
                {msg && <p className={`rd-msg mono ${msg.kind}`}>{msg.text}</p>}
                <div className="rd-how mono">
                  <div><b>01</b>request opened on chain · nothing held</div>
                  <div><b>02</b>you send the exact deposit to the reserve</div>
                  <div><b>03</b>3 confirmations · attest · mint to you</div>
                  <div><b>∞</b>the tag digits stay in the reserve as extra coverage</div>
                </div>
                <p className="redeem-fine mono"><a href={`${CONTRACTS.explorer}/address/${desk}?tab=contract`} target="_blank" rel="noreferrer">desk contract ↗</a> · <a href="/docs/#/wrap">how it works ↗</a></p>
              </div>
              <div className="rd-lists">
                {account && (
                  <div>
                    <div className="redeem-h mono">your requests</div>
                    {mine.length === 0 && <div className="redeem-empty mono">none yet</div>}
                    {mine.map((r) => (
                      <div className={`rd-card s${r.status}`} key={r.id}>
                        <div className="rd-card-top"><span className="mono rd-id">#{r.id}</span><span className="rd-card-amt">{zec(r.amount)} <span className="mono">{TOKEN.wrapper}</span></span><span className={`tag ${r.status === 2 ? 'tag-live' : 'tag-wait'}`}>{STATUS[r.status]}</span></div>
                        {r.status === 1 && TOKEN.reserveAddress && (
                          <div className="wd-pay">
                            <div className="wd-pay-row"><span className="mono">send exactly</span><b className="mono">{zec(r.deposit)} ZEC</b><button className="copy" type="button" onClick={() => copy(zec(r.deposit), `a${r.id}`)}>{copied === `a${r.id}` ? 'copied' : 'copy'}</button></div>
                            <div className="wd-pay-row"><span className="mono">to</span><b className="mono wd-addr">{TOKEN.reserveAddress}</b><button className="copy" type="button" onClick={() => copy(TOKEN.reserveAddress!, `t${r.id}`)}>{copied === `t${r.id}` ? 'copied' : 'copy'}</button></div>
                            <div className="wd-pay-actions"><a className="btn btn-ghost btn-sm" href={`zcash:${TOKEN.reserveAddress}?amount=${zec(r.deposit)}`}>open in a Zcash wallet</a><button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => cancel(r.id)}>cancel</button></div>
                            <div className="wrap-note mono">the last digits are your tag. Send the exact figure in one payment; minting follows 3 confirmations and the next attestation.</div>
                          </div>
                        )}
                        {r.status === 2 && <a className="mono redeem-tx" href={`${LINKS.zcashTx}${r.txid.slice(2)}`} target="_blank" rel="noreferrer">funded by · view on Zcash ↗</a>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <div className="ctb-compare" data-reveal>
          <table className="mono">
            <thead><tr><th></th><th>hold ZEC</th><th>wrap</th><th>wrap + provide</th></tr></thead>
            <tbody>
              <tr><td>exposure</td><td>ZEC</td><td>ZEC, on Robinhood Chain</td><td>half ZEC, half ETH, rebalancing</td></tr>
              <tr><td>earns</td><td>nothing</td><td>nothing yet</td><td>0.3% of every trade, pro rata</td></tr>
              <tr><td>does for the machine</td><td>nothing</td><td>grows the public reserve, adds peg inventory</td><td>deepens the market, hosts burns</td></tr>
              <tr><td>exit</td><td>n/a</td><td>redeem via the desk, paid automatically</td><td>remove liquidity any time, then redeem</td></tr>
              <tr><td>risk</td><td>ZEC price</td><td>operator custody of the reserve</td><td>plus impermanent loss and contract risk</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
