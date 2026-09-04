/**
 * Sweep: turn the reserve's ETH on Robinhood Chain into native ZEC in the
 * reserve t-address. Two hops, because no venue quotes 4663 -> ZEC directly:
 *
 *   1. Relay      ETH on 4663      -> ETH on Arbitrum (42161)   ~1s, ~0.1%
 *   2. 1Click     ETH on Arbitrum  -> native ZEC to t-address   NEAR Intents
 *
 * Default is PREPARE ONLY: both hops are quoted (1Click in dry mode), the plan
 * is printed with the exact Relay deposit transaction, and nothing is signed.
 * Set SWEEPER_KEY to let this process sign; it must be the key of the wallet
 * holding the ETH (the reserve sink). Every sweep is appended to sweeps.json
 * so a re-run can never double-send.
 *
 *   SWEEP_ETH=0.05 npm run sweep            # quote + plan, nothing moves
 *   SWEEP_ETH=0.05 SWEEPER_KEY=... npm run sweep --execute
 */
import { ethers } from 'ethers'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CHAIN, RESERVE, requireEnv } from './config.js'

const RELAY = process.env.RELAY_API ?? 'https://api.relay.link'
const ONECLICK = process.env.ONECLICK_API ?? 'https://1click.chaindefuser.com'
const ARB = { id: 42161, rpc: process.env.ARB_RPC ?? 'https://arb1.arbitrum.io/rpc' }
const ETH0 = ethers.ZeroAddress
const ASSET = { ethArb: 'nep141:arb.omft.near', zec: 'nep141:zec.omft.near' } as const
const LEDGER = new URL('../sweeps.json', import.meta.url).pathname

type Sweep = {
  startedAt: string
  ethIn: string
  relay?: { requestId?: string; txHash?: string; amountOutArb?: string }
  oneclick?: { depositAddress?: string; txHash?: string; amountOutZec?: string; status?: string }
  done?: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const json = async (url: string, init?: RequestInit) => {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init?.headers as Record<string, string>) }
  if (process.env.ONECLICK_JWT && url.startsWith(ONECLICK)) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`
  const r = await fetch(url, { ...init, headers })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${url} -> ${r.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}
const loadLedger = (): Sweep[] => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [])
const saveLedger = (l: Sweep[]) => writeFileSync(LEDGER, JSON.stringify(l, null, 2))

async function relayQuote(user: string, amountWei: bigint) {
  return json(`${RELAY}/quote`, {
    method: 'POST',
    body: JSON.stringify({
      user, recipient: user,
      originChainId: CHAIN.id, destinationChainId: ARB.id,
      originCurrency: ETH0, destinationCurrency: ETH0,
      amount: amountWei.toString(), tradeType: 'EXACT_INPUT',
    }),
  })
}

async function oneclickQuote(amountWei: bigint, dry: boolean, refundTo: string, recipient: string) {
  const deadline = new Date(Date.now() + 30 * 60_000).toISOString()
  return json(`${ONECLICK}/v0/quote`, {
    method: 'POST',
    body: JSON.stringify({
      dry, swapType: 'EXACT_INPUT', slippageTolerance: 100,
      originAsset: ASSET.ethArb, depositType: 'ORIGIN_CHAIN',
      destinationAsset: ASSET.zec, amount: amountWei.toString(),
      refundTo, refundType: 'ORIGIN_CHAIN',
      recipient, recipientType: 'DESTINATION_CHAIN',
      deadline, referral: 'zeal',
    }),
  })
}

async function main() {
  const execute = process.argv.includes('--execute')
  const ethIn = ethers.parseEther(requireEnv('SWEEP_ETH'))
  const tAddr = RESERVE.zcashTAddress
  const sinkEvm = RESERVE.sinkEvm
  const key = process.env.SWEEPER_KEY
  const signer = key ? new ethers.Wallet(key) : null
  if (signer && signer.address.toLowerCase() !== sinkEvm.toLowerCase()) {
    throw new Error(`SWEEPER_KEY is ${signer.address}, not the reserve sink ${sinkEvm}. Refusing.`)
  }

  const ledger = loadLedger()
  const open = ledger.find((s) => !s.done)
  if (open && execute) throw new Error(`an unfinished sweep is in sweeps.json (${open.startedAt}); finish or mark it done first`)

  console.log(`\nSWEEP  ${ethers.formatEther(ethIn)} ETH  ${CHAIN.name} -> Arbitrum -> ZEC ${tAddr}`)
  console.log(`mode   ${execute && signer ? 'EXECUTE' : 'prepare only (nothing is signed)'}\n`)

  // hop 1 quote
  const rq = await relayQuote(sinkEvm, ethIn)
  const out1 = BigInt(rq.details.currencyOut.amount)
  const dep = rq.steps[0].items[0].data
  if (Number(dep.chainId) !== CHAIN.id || BigInt(dep.value) !== ethIn || !ethers.isAddress(dep.to)) throw new Error(`Relay deposit does not match the quote: chain ${dep.chainId} value ${dep.value} to ${dep.to}`)
  console.log(`hop 1  Relay      in ${ethers.formatEther(ethIn)}  out ${ethers.formatEther(out1)} ETH on Arbitrum  (~${rq.details.timeEstimate}s)`)
  console.log(`       deposit tx to ${dep.to}  value ${dep.value}  chainId ${dep.chainId}`)

  // hop 2 quote (dry). Use 99.5% of hop-1 output so gas on Arbitrum is covered.
  const in2 = (out1 * 995n) / 1000n
  const oq = await oneclickQuote(in2, true, sinkEvm, tAddr)
  const q = oq.quote
  console.log(`hop 2  1Click     in ${ethers.formatEther(in2)} ETH  out ${q.amountOutFormatted} ZEC  (min ${ethers.formatUnits(q.minAmountOut, 8)}, ~${q.timeEstimate}s, withdraw fee ${q.withdrawFee ?? '0'} zat)`)
  console.log(`       usd in ${q.amountInUsd}  usd out ${q.amountOutUsd}  platform fee ${process.env.ONECLICK_JWT ? '0 (jwt)' : '0.2% (no jwt)'}\n`)

  if (!execute || !signer) {
    console.log('Plan only. To run it: add --execute and SWEEPER_KEY for the reserve sink.\n')
    return
  }

  const sweep: Sweep = { startedAt: new Date().toISOString(), ethIn: ethIn.toString() }
  ledger.push(sweep); saveLedger(ledger)

  // hop 1 execute
  const rh = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id)
  const arb = new ethers.JsonRpcProvider(ARB.rpc, ARB.id)
  const arbBefore = await arb.getBalance(sinkEvm)
  const tx = await signer.connect(rh).sendTransaction({ to: dep.to, value: BigInt(dep.value), data: dep.data ?? '0x' })
  sweep.relay = { requestId: rq.steps[0].requestId, txHash: tx.hash }; saveLedger(ledger)
  console.log(`hop 1  sent ${tx.hash}`)
  await tx.wait()
  // arrival is judged by balance, so the status endpoint's shape cannot strand us
  for (let i = 0; i < 60; i++) {
    const b = await arb.getBalance(sinkEvm)
    // must look like THIS fill, not some unrelated dust credit
    if (b - arbBefore >= (out1 * 9n) / 10n) { sweep.relay.amountOutArb = (b - arbBefore).toString(); break }
    await sleep(5_000)
  }
  if (!sweep.relay.amountOutArb) throw new Error('hop 1: ETH never arrived on Arbitrum (or arrived short); check Relay status for ' + sweep.relay.requestId)
  saveLedger(ledger)
  console.log(`hop 1  arrived ${ethers.formatEther(sweep.relay.amountOutArb)} ETH on Arbitrum`)

  // hop 2 execute: real quote, then send to the deposit address
  const got = BigInt(sweep.relay.amountOutArb)
  const send2 = (got * 995n) / 1000n
  const real = await oneclickQuote(send2, false, sinkEvm, tAddr)
  if (!ethers.isAddress(real.quote.depositAddress)) throw new Error('1Click deposit address is not an EVM address: ' + real.quote.depositAddress)
  if (BigInt(real.quote.amountIn) !== send2) throw new Error(`1Click amountIn ${real.quote.amountIn} != requested ${send2}`)
  if (real.quoteRequest?.recipient !== tAddr) throw new Error('1Click quote recipient is not our reserve address')
  sweep.oneclick = { depositAddress: real.quote.depositAddress }; saveLedger(ledger)
  const tx2 = await signer.connect(arb).sendTransaction({ to: real.quote.depositAddress, value: BigInt(real.quote.amountIn) })
  sweep.oneclick.txHash = tx2.hash; saveLedger(ledger)
  console.log(`hop 2  sent ${tx2.hash} -> ${real.quote.depositAddress}`)
  await tx2.wait()
  await json(`${ONECLICK}/v0/deposit/submit`, { method: 'POST', body: JSON.stringify({ txHash: tx2.hash, depositAddress: real.quote.depositAddress }) }).catch(() => {})

  for (let i = 0; i < 120; i++) {
    const st = await json(`${ONECLICK}/v0/status?depositAddress=${real.quote.depositAddress}`)
    sweep.oneclick.status = st.status; saveLedger(ledger)
    if (st.status === 'SUCCESS') {
      sweep.oneclick.amountOutZec = st.swapDetails?.amountOutFormatted; sweep.done = true; saveLedger(ledger)
      console.log(`\nDONE  ${sweep.oneclick.amountOutZec} ZEC -> ${tAddr}. Run npm run attest next.\n`)
      return
    }
    if (st.status === 'REFUNDED' || st.status === 'FAILED') throw new Error(`hop 2 ${st.status}: ${st.swapDetails?.refundReason ?? ''}`)
    await sleep(10_000)
  }
  throw new Error('hop 2 still pending after 20 minutes; keep polling /v0/status')
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
