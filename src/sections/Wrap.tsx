import {useCallback,useEffect,useRef,useState} from 'react'
import {CHAIN,CONTRACTS,LINKS} from '../config'
import {encAddress,hexToBig,readBatchRaw,wordAddress} from '../lib/chain'
import {WRAP_REGISTRY,WRAP_MINTER,WRAP_SELECTORS as S,canDeposit,decodeRoute,parseZec,historyVerified,activeDeposit,depositProgress,type Route,type WrapStatus} from '../lib/wrapPublic'
// Read-only AWS endpoint; populated during deployment. It cannot sign or accept deposits.
const STATUS_URL='/api/wrap-status'
type Wallet={request:(a:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(e:string,f:()=>void)=>void;removeListener?:(e:string,f:()=>void)=>void}
const wallet=()=> (window as unknown as {ethereum?:Wallet}).ethereum
const CHAIN_HEX='0x'+CHAIN.id.toString(16)
const fmt=(n:string|bigint)=>(Number(n)/1e8).toFixed(8)
const labels:Record<string,string>={observed:'Deposit confirmed', 'sweep-signed':'Moving to reserve', 'sweep-confirmed':'Preparing your zZEC','mint-signed':'Mint confirming',minted:'Completed'}
export function Wrap(){
 const [account,setAccount]=useState<string|null>(null),[status,setStatus]=useState<WrapStatus|null>(null),[route,setRoute]=useState<Route|null>(null)
 const [chainOpen,setChainOpen]=useState(false),[amount,setAmount]=useState('0.1'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false)
 const [pending,setPending]=useState<string|null>(()=>{try{return localStorage.getItem('zeal-wrap-v2-request')}catch{return null}})
 const [statusError,setStatusError]=useState('')
 const [checkPhase,setCheckPhase]=useState<'loading'|'ready'|'error'>('loading')
 const [known,setKnown]=useState<WrapStatus|null>(null)
 const [showSend,setShowSend]=useState(false)
 const history=known?.route?.recipient.toLowerCase()===account?.toLowerCase()?known:null
 const current=activeDeposit(history?.deposits??[])
 const progress=current?depositProgress(current.state):null
 const currentKey=current?current.txid+':'+current.index:''
 useEffect(()=>setShowSend(false),[currentKey,account])
 const [now,setNow]=useState(Date.now)
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(t)},[])
 const walletHelp=useRef<HTMLDialogElement>(null)
 const [walletHelpMessage,setWalletHelpMessage]=useState('')
 const generation=useRef(0)
 const refresh=useCallback(async()=>{
  const g=++generation.current
  setCheckPhase(previous=>previous==='ready'?previous:'loading')
  const signal=AbortSignal.timeout(12000)
  try{
   const [response,reads]=await Promise.all([fetch(STATUS_URL+(account?'?account='+account:''),{signal}),readBatchRaw([{to:WRAP_REGISTRY,data:S.paused},{to:WRAP_REGISTRY,data:S.credits},{to:CONTRACTS.zzec!,data:S.minter},...(account?[{to:WRAP_REGISTRY,data:S.mine+encAddress(account)}]:[])],signal)])
   if(!response.ok)throw Error('Wrapping status is unavailable. Please wait before sending.')
   const next=await response.json() as WrapStatus
   let r:Route|null=null
   const plus=account?hexToBig(reads[3]):0n
   if(plus>0n){const id=Number(plus-1n);if(!Number.isSafeInteger(id)||id<0)throw Error('Invalid route');const [raw]=await readBatchRaw([{to:WRAP_REGISTRY,data:S.route+(plus-1n).toString(16).padStart(64,'0')}],signal);r=decodeRoute(raw,id);if(r.recipient.toLowerCase()!==account!.toLowerCase())throw Error('Route recipient mismatch')}
   if(g!==generation.current)return
   if(!historyVerified(next,account,r))throw Error('We couldn’t finish checking your deposits. Retrying automatically; don’t resend your payment.')
   setCheckPhase('ready');setStatusError('');setStatus(next);if(next.workerReady&&next.route&&r&&next.route.id===r.id&&next.route.recipient.toLowerCase()===account?.toLowerCase()&&next.route.depositAddress===r.depositAddress)setKnown(next);setRoute(r);setChainOpen(hexToBig(reads[0])===0n&&hexToBig(reads[1])===1n&&wordAddress(reads[2],0).toLowerCase()===WRAP_MINTER.toLowerCase())
  }catch(e){if(g!==generation.current)return;setCheckPhase('error');setStatus(null);setChainOpen(false);setStatusError((e as Error).message)}
 },[account])
 useEffect(()=>{void refresh();const t=setInterval(()=>void refresh(),15000);return()=>{generation.current++;clearInterval(t)}},[refresh])
 useEffect(()=>{
  const p=wallet(),changed=()=>{walletHelp.current?.close();generation.current++;setAccount(null);setCheckPhase('loading');setStatusError('');setKnown(null);setRoute(null);setStatus(null);setChainOpen(false);setMessage('Wallet changed. Reconnect to see the correct deposit address.')}
  p?.on?.('accountsChanged',changed);p?.on?.('chainChanged',changed)
  return()=>{p?.removeListener?.('accountsChanged',changed);p?.removeListener?.('chainChanged',changed)}
 },[account])
 const connect=async()=>{
  const p=wallet();if(!p){setMessage('Open this page in your wallet browser or install a browser wallet that supports Robinhood Chain.');return}
  setBusy(true)
  try{
   const a=await p.request({method:'eth_requestAccounts'}) as string[]
   if(!a[0])throw Error('No wallet account selected')
   try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_HEX}]})}catch(e){if((e as {code?:number}).code!==4902)throw e;await p.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN_HEX,chainName:CHAIN.name,rpcUrls:[CHAIN.rpcPublic],nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},blockExplorerUrls:[CONTRACTS.explorer]}]})}
   const chain=await p.request({method:'eth_chainId'}),current=await p.request({method:'eth_accounts'}) as string[]
   if(String(chain).toLowerCase()!==CHAIN_HEX||current[0]?.toLowerCase()!==a[0].toLowerCase())throw Error('Reconnect after selecting Robinhood Chain and your account')
   generation.current++;setCheckPhase('loading');setStatusError('');setChainOpen(false);setKnown(null);setRoute(null);setStatus(null);setAccount(current[0]);setMessage('')
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 const check=async()=>{
  if(!pending)return
  try{const p=wallet();if(!p||String(await p.request({method:'eth_chainId'})).toLowerCase()!==CHAIN_HEX)throw Error('Connect on Robinhood Chain to check confirmation')
   const r=await p.request({method:'eth_getTransactionReceipt',params:[pending]}) as {status:string}|null
   if(!r){setMessage('Request is still pending. Do not send ZEC until your address is shown.');return}
   try{localStorage.removeItem('zeal-wrap-v2-request')}catch{/* In-memory state remains */}setPending(null)
   setMessage(r.status==='0x1'?'Request confirmed. Your deposit address will appear after assignment.':'Request reverted. You can try creating your address again.');await refresh()
  }catch(e){setMessage((e as Error).message)}
 }
 const fresh=!!status&&now-Date.parse(status.at)<120000&&now-Date.parse(status.at)>=-10000
 const open=chainOpen&&!!status?.workerReady&&!!status?.accepting&&fresh
 const ready=chainOpen&&canDeposit(status,account,route,now)
 const zats=parseZec(amount),valid=zats>=100000n&&zats<=100000000n
 useEffect(()=>{if(!ready)walletHelp.current?.close()},[ready,account])
 const create=async()=>{
  if(!open||!account||busy||pending)return
  setBusy(true);setMessage('')
  try{
   const p=wallet()!,a=await p.request({method:'eth_accounts'}) as string[],c=await p.request({method:'eth_chainId'})
   if(a[0]?.toLowerCase()!==account.toLowerCase()||String(c).toLowerCase()!==CHAIN_HEX)throw Error('Wallet changed. Reconnect before continuing.')
   const h=await p.request({method:'eth_sendTransaction',params:[{from:account,to:WRAP_REGISTRY,data:S.request,chainId:CHAIN_HEX}]}) as string
   if(!/^0x[0-9a-f]{64}$/i.test(h))throw Error('Wallet returned an invalid transaction hash. Check your wallet history before retrying.')
   setPending(h);try{localStorage.setItem('zeal-wrap-v2-request',h)}catch{/* Keep in-memory hash */}
   setMessage('Request submitted. Check confirmation below; send ZEC only after your address appears.')
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 const copy=async()=>{if(!chainOpen||!route||!canDeposit(status,account,route))return;try{await navigator.clipboard.writeText(route.depositAddress);setWalletHelpMessage('');setCopied(true);setTimeout(()=>setCopied(false),2000)}catch{setMessage('Clipboard unavailable. Select and copy the full displayed address.');setWalletHelpMessage('Clipboard access is unavailable. Select and copy the full address below.')}}
 return <section className="band" id="wrap"><div className="wrap">
  <dialog ref={walletHelp} className="zcash-wallet-help" aria-labelledby="zcash-wallet-help-title" aria-describedby="zcash-wallet-help-description" onClick={e=>{if(e.target===e.currentTarget)e.currentTarget.close()}}>
   <div className="zcash-wallet-help-inner">
    <form method="dialog"><button className="zcash-wallet-help-close" aria-label="Close wallet help" autoFocus>×</button></form>
    <span className="zcash-wallet-help-icon" aria-hidden="true">↗</span>
    <p className="eyebrow">Continue in your Zcash wallet</p>
    <h3 id="zcash-wallet-help-title">Wallet didn’t open?</h3>
    <p id="zcash-wallet-help-description">Your browser may ask to open a compatible wallet app. If nothing happens, open your Zcash wallet yourself and choose <strong>Send</strong>.</p>
    {ready&&route&&<div className="zcash-wallet-help-details">
     <div className="zcash-wallet-help-amount"><span className="mono">Amount selected</span><strong>{fmt(zats)} <small>ZEC</small></strong></div>
     <span className="mono">Paste your deposit address</span><code className="wrap-public-address">{route.depositAddress}</code>
     <button className="btn btn-primary" type="button" onClick={copy}>{copied?'Address copied ✓':'Copy deposit address'}</button>
    </div>}
    <p className="zcash-wallet-help-feedback" role="status">{walletHelpMessage||(copied?'Paste it into your wallet’s recipient field.':'Use native ZEC on the Zcash network. Check the address before sending.')}</p>
    <p className="zcash-wallet-help-note">Opening a wallet doesn’t send a payment. If you already sent ZEC, close this message and follow Your deposits—don’t send it again.</p>
    <form method="dialog"><button className="btn btn-ghost" type="submit">Back to my deposit</button></form>
   </div>
  </dialog>
  <div className="sec-head"><p className="eyebrow">Wrap desk</p><h2 className="h2">Send ZEC.<br/><span className="green">Get zZEC, 1:1.</span></h2><p className="lede">Your wallet gets its own Zcash deposit address. Send native ZEC and receive the actual amount as zZEC on Robinhood Chain. No special trailing digits.</p></div>
  <div className="wd-ready-note"><span className={'tag '+(open?'tag-live':'tag-wait')}>{checkPhase==='loading'?'Checking wrapping status':open?'Wrapping open':'Deposits on hold'}</span><p>{checkPhase==='loading'?'Loading availability and checking your deposit history. Please wait before sending.':open?'Automatic processing is available. Connect the wallet where you want to receive zZEC.':'New deposit instructions are unavailable while activation or service checks are pending. Already sent? Connect to check your payment; do not send again.'}</p><a href="/docs/#/wrap">How it works →</a></div>
  <div className="rd-grid">
   <div className="rd-form wrap-public-form">
    <ol className="rd-steps mono"><li className={!account?'now':'done'}><b>1</b>Connect</li><li className={account&&!route?'now':route?'done':''}><b>2</b>Get address</li><li className={current&&!showSend?'done':ready?'now':''}><b>3</b>Send ZEC</li><li className={current&&!showSend?(current.state==='minted'?'done':'now'):''}><b>4</b>{current&&!showSend&&current.state==='minted'?'Received':'Receive'}</li></ol>
    <div role="status" aria-live="polite" aria-atomic="true">
     {current&&progress&&<div className={'wrap-progress '+(current.state==='minted'?'is-complete':'')}>
      <span className="eyebrow">{current.state==='minted'?'Wrapping complete':'Deposit received · processing automatically'}</span>
      <h3>{progress.title}</h3>
      <p className="wrap-progress-amount">{fmt(current.amountZats)} <span>{current.state==='minted'?'zZEC minted':'ZEC received'}</span></p>
      <p>{progress.detail}</p>
      <ol className="wrap-progress-track">{['Deposit confirmed','Reserve transfer','Mint zZEC'].map((label,i)=><li className={i<progress.stage?'done':i===progress.stage?'now':''} key={label}><b>{i<progress.stage?'✓':i+1}</b>{label}</li>)}</ol>
      {current.mintTxid&&<a href={`${CONTRACTS.explorer}/tx/${current.mintTxid}`} target="_blank" rel="noreferrer">{current.state==='minted'?'View your mint receipt':'View pending mint'} ↗</a>}
      {!status?.workerReady||!fresh||statusError?<p className="wrap-progress-notice">Live updates are temporarily unavailable. This is your last recorded status; it does not mean your payment failed. Don’t send it again.</p>:<p className="wrap-progress-note">Updates automatically every 15 seconds. {current.state==='minted'?'Sent to your connected Robinhood Chain wallet.':'No further payment or wallet approval is needed. Block times vary.'}</p>}
     </div>}
    </div>
    {current&&!showSend&&ready&&<button className="btn btn-ghost wrap-send-again" onClick={()=>setShowSend(true)}>{current.state==='minted'?'Make another deposit':'Show deposit address'}</button>}
    {!account?<button className="btn btn-primary btn-lg rd-go" disabled={busy} onClick={connect}>Connect wallet</button>:<>
     <p className="redeem-fine mono">zZEC recipient · <span className="wrap-public-address">{account}</span></p>
     {checkPhase==='loading'?<p className="wrap-loading" role="status"><span className="wrap-loading-dot" aria-hidden="true"/>Loading your deposit address and payment history…</p>:checkPhase==='error'&&!history?<p role="status">Deposit check incomplete. We’ll retry automatically. Your payment is not assumed missing.</p>:!route?<button className="btn btn-primary btn-lg rd-go" disabled={!open||busy||!!pending} onClick={create}>{busy?'Confirm in wallet':!open?'Waiting for desk availability':'Get my deposit address'}</button>:!route.depositAddress?<p role="status">Your request is confirmed. The worker is assigning your address—usually on its next pass.</p>:ready&&(!current||showSend)?<>
      <label className="redeem-l mono" htmlFor="wrap-amount">Amount to send (ZEC)</label><div className="rd-amt"><input id="wrap-amount" className="mono" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/><span className="mono rd-unit">ZEC</span></div>
      <p className="rd-sub mono">{valid?`Estimated receipt: ${fmt(zats)} zZEC`:'Send between 0.001 and 1 ZEC per payment.'}</p>
      <div className="wrap-public-deposit"><span className="redeem-l mono">Your native Zcash deposit address</span><code className="wrap-public-address">{route.depositAddress}</code><button className="btn btn-primary" onClick={copy}>{copied?'Copied':'Copy my address'}</button>{valid&&<a className="btn btn-ghost" href={`zcash:${route.depositAddress}?amount=${fmt(zats)}`} onClick={e=>{if(!canDeposit(status,account,route)){e.preventDefault();return}setWalletHelpMessage('');walletHelp.current?.showModal()}}>Open Zcash wallet ↗</a>}</div>
      <p className="redeem-fine">Send native ZEC on the Zcash network. Check the full destination in your wallet or bridge, especially a saved recipient. The actual amount received determines your zZEC; there are no exact-amount tags.</p>
     </>:ready?null:<p role="status">Your address remains linked to you, but new deposit instructions are on hold. Existing payments remain recorded. Do not send another payment to speed up processing.</p>}
    </>}
    {pending&&<div className="rd-msg mono"><a href={`${CONTRACTS.explorer}/tx/${pending}`} target="_blank" rel="noreferrer">Request transaction ↗</a> · <button onClick={check} disabled={busy}>Check confirmation</button></div>}
    {checkPhase==='error'&&<button className="btn btn-ghost" onClick={()=>void refresh()}>Retry deposit check</button>}
    {(statusError||message)&&<p className="rd-msg mono" role="status">{statusError||message}</p>}
    <p className="redeem-fine mono">0.001–1 ZEC per payment · no wrapping fee · wallet and bridge fees may apply.</p>
   </div>
   <div className="rd-form"><h3>From Zcash to your wallet.</h3><div className="rd-how"><div><b>01</b>Your Robinhood Chain wallet receives a permanent deposit route. Creating it requires a small ETH gas payment.</div><div><b>02</b>Send ZEC to the assigned address. We wait for three native confirmations.</div><div><b>03</b>The worker moves the deposit into the public reserve and waits for three more confirmations.</div><div><b>04</b>After checking backing, it mints the actual received amount to your linked wallet.</div></div><p className="redeem-fine">Usually several minutes; block times and service conditions vary. Below-minimum, above-limit or unusual payments need review. Wrapping uses operator custody and carries contract risk.</p><a href="#redeem">Redeem zZEC for native ZEC →</a></div>
  </div>
  {account&&<div className="wrap-public-history" aria-busy={checkPhase==='loading'}><h3>Your deposits</h3>{!history?<p className={checkPhase==='loading'?'wrap-loading':''} role="status">{checkPhase==='loading'?<><span className="wrap-loading-dot" aria-hidden="true"/>Loading your deposits… Checking your wallet’s history.</>:checkPhase==='ready'?'No confirmed deposits recorded yet. A new payment appears after three Zcash confirmations.':'We couldn’t load your deposits. Retrying automatically; this does not mean your payment is missing.'}</p>:<>{!history.deposits?.length&&!history.review?.length&&<p>No confirmed deposits recorded yet. A new payment appears after three Zcash confirmations.</p>}{[...history.deposits].reverse().map(d=><article className="rd-card" key={d.txid+':'+d.index}><div className="rd-card-top"><strong>{fmt(d.amountZats)} {d.state==='minted'?'zZEC minted':'ZEC received'}</strong><span className="tag">{labels[d.state]??'Under review'}</span></div><div className="wrap-public-links"><a href={`${LINKS.zcashTx}${d.txid.slice(2)}`} target="_blank" rel="noreferrer">ZEC deposit ↗</a>{d.sweepTxid&&<a href={`${LINKS.zcashTx}${d.sweepTxid.slice(2)}`} target="_blank" rel="noreferrer">Reserve transfer ↗</a>}{d.mintTxid&&<a href={`${CONTRACTS.explorer}/tx/${d.mintTxid}`} target="_blank" rel="noreferrer">zZEC mint ↗</a>}</div></article>)}{history.review?.map(d=><p key={d.txid+':'+d.index}>Payment of {fmt(d.amountZats)} ZEC needs operator review: {d.reason}. Keep your transaction receipt.</p>)}</>}</div>}
  <p className="redeem-fine"><a href={`${CONTRACTS.explorer}/address/${WRAP_REGISTRY}`} target="_blank" rel="noreferrer">Deposit registry ↗</a> · <a href="/docs/#/wrap">Processing, recovery and trust model →</a></p>
 </div></section>
}
