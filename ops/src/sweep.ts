/**
 * Sweep: turn the reserve's ETH on Robinhood Chain into native ZEC in the
 * reserve t-address. Two hops, because no venue quotes 4663 -> ZEC directly:
 *
 *   1. Relay      ETH on 4663      -> ETH on Arbitrum (42161)   ~1s, ~0.1%
 *   2. 1Click     ETH on Arbitrum  -> native ZEC to t-address   NEAR Intents
 *
 * Default is PREPARE ONLY: both hops are quoted (1Click in dry mode), the plan
 * is printed with the exact Relay deposit transaction, and nothing is signed.
 * To sign, point SWEEPER_KEYSTORE at an encrypted keystore for the reserve sink
 * (prompted for its passphrase, or SWEEPER_PASS). A raw SWEEPER_KEY is refused
 * unless ALLOW_RAW_KEY=1. Every sweep is appended to sweeps.json
 * and an unfinished entry blocks another execution. Interrupted runs require
 * checking the recorded bridge/swap before proceeding; they are not retried.
 *
 *   SWEEP_ETH=0.05 npm run sweep            # quote + plan, nothing moves
 *   SWEEP_ROLE=keeper SWEEP_ETH=0.5 SWEEP_MIN_ZEC=1 npm run sweep
 *   Add -- --execute only after reviewing the plan; keeper signer uses KEEPER_PASS.
 *   Keeper mode retains 1 ETH by default (SWEEP_RETAIN_ETH overrides it).
 */
import { ethers } from 'ethers'
import { readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, RESERVE, requireEnv } from './config.js'
import { managedSend } from './managed-send.js'
import { roleSigner } from './chain.js'
import { checkRelay, checkOneClick, checkRetainedBalance } from './sweep-checks.js'

const RELAY = process.env.RELAY_API ?? 'https://api.relay.link'
const ONECLICK = process.env.ONECLICK_API ?? 'https://1click.chaindefuser.com'
const ARB = { id: 42161, rpc: process.env.ARB_RPC ?? 'https://arb1.arbitrum.io/rpc' }
const ETH0 = ethers.ZeroAddress
const ASSET = { ethArb: 'nep141:arb.omft.near', zec: 'nep141:zec.omft.near' } as const
const LEDGER = process.env.SWEEP_LEDGER ?? new URL('../sweeps.json', import.meta.url).pathname

type Sweep = {
  startedAt: string
  ethIn: string
  source?: string
  reserve?: string
  minZec?: string
  relay?: { requestId?: string; txHash?: string; amountOutArb?: string }
  oneclick?: { depositAddress?: string; txHash?: string; amountOutZec?: string; status?: string }
  done?: boolean
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
function askHidden(q: string): Promise<string> {
  return new Promise((res) => {
    if (!process.stdin.isTTY) throw new Error('no TTY for a passphrase prompt; set SWEEPER_PASS')
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(q)
    const out = process.stdout as unknown as { write: (s: string) => boolean }
    const orig = out.write.bind(process.stdout)
    out.write = (s: string) => (s.includes('\n') ? orig(s) : true)
    rl.question('', (a) => { out.write = orig; process.stdout.write('\n'); rl.close(); res(a) })
  })
}
const json = async (url: string, init?: RequestInit) => {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init?.headers as Record<string, string>) }
  if (process.env.ONECLICK_JWT && url.startsWith(ONECLICK)) headers.authorization = `Bearer ${process.env.ONECLICK_JWT}`
  const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${url} -> ${r.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}
const loadLedger = (): Sweep[] => (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [])
const saveLedger = (l: Sweep[]) => {
  const temp = `${LEDGER}.tmp`
  writeFileSync(temp, JSON.stringify(l, null, 2))
  renameSync(temp, LEDGER)
}

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
  const role = process.env.SWEEP_ROLE
  if (role && role !== 'keeper') throw new Error('SWEEP_ROLE must be keeper or omitted for the reserve sink')
  const sinkEvm = role === 'keeper' ? '0x19cece80126b79F76D8b8297B876310a56349738' : RESERVE.sinkEvm
  const minZec = ethers.parseUnits(process.env.SWEEP_MIN_ZEC ?? '0', 8)
  const retain = ethers.parseEther(process.env.SWEEP_RETAIN_ETH ?? (role === 'keeper' ? '1' : '0.02'))
  if (ethIn <= 0n || retain < 0n || minZec < 0n) throw new Error('invalid sweep amount or limits')
  if (execute && minZec <= 0n) throw new Error('SWEEP_MIN_ZEC must set a positive minimum before execution')
  if (!/^t[13][a-zA-Z0-9]{33}$/.test(tAddr)) throw new Error('invalid reserve Zcash address')
  let signer: ethers.Wallet | null = null
  if (execute && role === 'keeper') {
    signer = await roleSigner('keeper')
  } else if (execute && process.env.SWEEPER_KEYSTORE) {
    const pass = process.env.SWEEPER_PASS ?? (await askHidden('passphrase for the reserve sink keystore: '))
    const w = await ethers.Wallet.fromEncryptedJson(readFileSync(process.env.SWEEPER_KEYSTORE, 'utf8'), pass)
    delete process.env.SWEEPER_PASS
    signer = new ethers.Wallet(w.privateKey)
  } else if (execute && process.env.SWEEPER_KEY) {
    if (process.env.ALLOW_RAW_KEY !== '1') throw new Error('SWEEPER_KEY is set; use SWEEPER_KEYSTORE (or ALLOW_RAW_KEY=1 on purpose)')
    signer = new ethers.Wallet(process.env.SWEEPER_KEY)
  }
  if (signer && signer.address.toLowerCase() !== sinkEvm.toLowerCase()) {
    throw new Error(`SWEEPER_KEY is ${signer.address}, not the reserve sink ${sinkEvm}. Refusing.`)
  }

  if (execute && !signer) throw new Error('execution requires a configured signer')
  const rh = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id)
  const arb = new ethers.JsonRpcProvider(ARB.rpc, ARB.id)
  const [sourceBalance, sourceFees] = await Promise.all([rh.getBalance(sinkEvm), rh.getFeeData()])
  const gasPrice = sourceFees.maxFeePerGas ?? sourceFees.gasPrice
  if (!gasPrice) throw new Error('source gas price unavailable')

  const ledger = loadLedger()
  const open = ledger.find((s) => !s.done)
  if (open && execute) throw new Error(`an unfinished sweep is in sweeps.json (${open.startedAt}); finish or mark it done first`)

  console.log(`\nSWEEP  ${ethers.formatEther(ethIn)} ETH  ${CHAIN.name} -> Arbitrum -> ZEC ${tAddr}`)
  console.log(`mode   ${execute && signer ? 'EXECUTE' : 'prepare only (nothing is signed)'}\n`)

  // hop 1 quote
  const rq = await relayQuote(sinkEvm, ethIn)
  const { output: out1, minimum: relayMinimum, dep } = checkRelay(rq, sinkEvm, ethIn, CHAIN.id, ARB.id)
  const gas = await rh.estimateGas({ from: sinkEvm, to: dep.to, value: ethIn, data: dep.data ?? '0x' })
  checkRetainedBalance(sourceBalance, ethIn, gas * gasPrice * 2n, retain)
  console.log(`source ${sinkEvm} · keep at least ${ethers.formatEther(retain)} ETH on Robinhood Chain`)
  console.log(`hop 1  Relay      in ${ethers.formatEther(ethIn)}  out ${ethers.formatEther(out1)} ETH on Arbitrum  (~${rq.details.timeEstimate}s)`)
  console.log(`       deposit tx to ${dep.to}  value ${dep.value}  chainId ${dep.chainId}`)

  // hop 2 quote (dry). Use 99.5% of hop-1 output so gas on Arbitrum is covered.
  const in2 = (out1 * 995n) / 1000n
  const oq = await oneclickQuote(in2, true, sinkEvm, tAddr)
  checkOneClick(oq, in2, sinkEvm, tAddr, minZec, true)
  const q = oq.quote
  console.log(`hop 2  1Click     in ${ethers.formatEther(in2)} ETH  out ${q.amountOutFormatted} ZEC  (min ${ethers.formatUnits(q.minAmountOut, 8)}, ~${q.timeEstimate}s, withdraw fee ${q.withdrawFee ?? '0'} zat)`)
  console.log(`       usd in ${q.amountInUsd}  usd out ${q.amountOutUsd} · minimum required ${ethers.formatUnits(minZec, 8)} ZEC\n`)

  if (!execute || !signer) {
    console.log('Plan only. Execution requires --execute, a signer, and SWEEP_MIN_ZEC.\n')
    return
  }

  const sweep: Sweep = { startedAt: new Date().toISOString(), ethIn: ethIn.toString(), source: sinkEvm, reserve: tAddr, minZec: minZec.toString() }
  ledger.push(sweep); saveLedger(ledger)

  // hop 1 execute
  checkRetainedBalance(await rh.getBalance(sinkEvm), ethIn, gas * gasPrice * 2n, retain)
  const arbBefore = await arb.getBalance(sinkEvm)
  const tx = await managedSend(signer.connect(rh), { to: dep.to, value: BigInt(dep.value), data: dep.data ?? '0x' })
  sweep.relay = { requestId: rq.steps[0].requestId, txHash: tx.hash }; saveLedger(ledger)
  console.log(`hop 1  sent ${tx.hash}`)
  await tx.wait()
  // Require Relay to identify this deposit as filled before considering balance changes.
  for (let i = 0; i < 60; i++) {
    const status = await json(`${RELAY}/intents/status/v3?requestId=${encodeURIComponent(rq.steps[0].requestId)}`)
    if (status.status === 'refund' || status.status === 'failure') throw new Error(`Relay ${status.status}; review the recorded request before retrying`)
    const matches = status.status === 'success' && Number(status.originChainId) === CHAIN.id &&
      Number(status.destinationChainId) === ARB.id && status.inTxHashes?.some((hash: string) => hash.toLowerCase() === tx.hash.toLowerCase())
    const b = await arb.getBalance(sinkEvm)
    if (matches && b - arbBefore >= relayMinimum) {
      // Never include more than this conversion's quoted bridge output.
      sweep.relay.amountOutArb = (b - arbBefore < out1 ? b - arbBefore : out1).toString(); break
    }
    await sleep(5_000)
  }
  if (!sweep.relay.amountOutArb) throw new Error('hop 1: ETH never arrived on Arbitrum (or arrived short); check Relay status for ' + sweep.relay.requestId)
  saveLedger(ledger)
  console.log(`hop 1  arrived ${ethers.formatEther(sweep.relay.amountOutArb)} ETH on Arbitrum`)

  // hop 2 execute: real quote, then send to the deposit address
  const got = BigInt(sweep.relay.amountOutArb)
  const send2 = (got * 995n) / 1000n
  const real = await oneclickQuote(send2, false, sinkEvm, tAddr)
  checkOneClick(real, send2, sinkEvm, tAddr, minZec, false)
  const [arbGas, arbFees, arbBalance] = await Promise.all([
    arb.estimateGas({ from: sinkEvm, to: real.quote.depositAddress, value: send2 }), arb.getFeeData(), arb.getBalance(sinkEvm),
  ])
  const arbGasPrice = arbFees.maxFeePerGas ?? arbFees.gasPrice
  if (!arbGasPrice) throw new Error('Arbitrum gas price unavailable')
  checkRetainedBalance(arbBalance, send2, arbGas * arbGasPrice * 2n, arbBefore)
  sweep.oneclick = { depositAddress: real.quote.depositAddress }; saveLedger(ledger)
  const tx2 = await managedSend(signer.connect(arb), { to: real.quote.depositAddress, value: BigInt(real.quote.amountIn) })
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

async function run() {
  if (!process.argv.includes('--execute')) return main()
  const lock = `${LEDGER}.lock`
  let fd: number
  try { fd = openSync(lock, 'wx', 0o600) }
  catch { throw new Error('sweep execution lock exists; check the running process and ledger before retrying') }
  try { writeFileSync(fd, String(process.pid)); await main() }
  finally { closeSync(fd); unlinkSync(lock) }
}
run().catch((e) => { console.error(e.message ?? e); process.exitCode = 1 })
