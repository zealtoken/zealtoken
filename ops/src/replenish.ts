/** One bounded refill workflow. --execute advances jobs; --daemon repeats every minute.
 * --session unlocks the minter locally once, without writing its passphrase to disk.
 */
import { ethers } from 'ethers'
import { assertLocalSigningActive } from './local-signing.js'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, CONTRACTS, RESERVE } from './config.js'
import { keyPath } from './chain.js'
import { atomicJson, readJson, stateDir, withLock, Busy } from './ops-lock.js'
import { marketPrices } from './market-price.js'
import { refillAmount, assertMintBudget, assertResumable } from './refill-policy.js'
import { addressUtxos, chainTip } from './zcash-light.js'

const KEEPER = '0x19cece80126b79F76D8b8297B876310a56349738'
const FILE = `${stateDir}refill.json`
const SWEEPS = process.env.SWEEP_LEDGER ?? new URL('../sweeps.json', import.meta.url).pathname
const ROOT = new URL('../', import.meta.url).pathname
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const token = new ethers.Contract(CONTRACTS.zzec, ['function balanceOf(address) view returns(uint256)', 'function minter() view returns(address)', 'function reserveAddress() view returns(string)', 'function totalSupply() view returns(uint256)', 'function reserveZats() view returns(uint256)', 'function attestationIsFresh() view returns(bool)'], provider)
const sv = new ethers.Contract('0xf3334192d15450cdd385c8b70e03f9a6bd9e673b', ['function getSlot0(bytes32) view returns(uint160,int24,uint24,uint24)'], provider)
const POOL = '0xa6d41767e205c89fe05d7ad78354af7bb98cbe9b0c3c60f8371b05e7087fdb84'
const EXECUTE = process.argv.includes('--execute')
let sessionPass: string | undefined

type Job = { startedAt: number; eth: string; minimum: string; phase: 'converting' | 'confirming' | 'attesting' | 'minting' | 'complete' | 'attention'; sweepIndex: number; amount?: string; txid?: string; attestTx?: string; mintTx?: string; completedAt?: number; error?: string }
type Sweep = { startedAt: string; ethIn: string; source?: string; reserve?: string; done?: boolean; oneclick?: { depositAddress?: string; amountOutZec?: string; txHash?: string } }
const jobs = () => readJson<Job[]>(FILE, [])
const sweeps = () => readJson<Sweep[]>(SWEEPS, [])
const save = (all: Job[]) => atomicJson(FILE, all)
const getSecret = (service: string) => {
  const role = service.replace(/^zeal-/, '').toUpperCase()
  const value = process.env[`${role}_PASS`]
  if (value) return value
  if (process.platform !== 'darwin') throw new Error(`${role} signing credential unavailable`)
  return execFileSync('/usr/bin/security', ['find-generic-password', '-s', service, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}
function minterPass() { return sessionPass ?? getSecret('zeal-minter') }
async function validateMinter() {
  assertLocalSigningActive()
  let pass: string
  try { pass = minterPass() } catch { throw new Error('minter is locked; run npm run replenish:session locally before enabling refill execution') }
  const wallet = await ethers.Wallet.fromEncryptedJson(readFileSync(keyPath('minter'), 'utf8'), pass)
  const current = await token.minter() as string
  const direct = current.toLowerCase() === wallet.address.toLowerCase()
  const desk = process.env.WRAP_DESK_ADDRESS
  if (!direct) {
    if (!desk || current.toLowerCase() !== desk.toLowerCase()) throw new Error('unexpected minter role; refill stopped')
    const op = await new ethers.Contract(desk, ['function operator() view returns(address)'], provider).operator()
    if (op.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('minter signer does not control WrapDesk')
  }
  if ((await token.reserveAddress()) !== RESERVE.zcashTAddress) throw new Error('reserve address mismatch')
  return pass
}
async function child(file: string, vars: NodeJS.ProcessEnv) {
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.endsWith('_PASS') || key.endsWith('_KEY')) delete env[key]
  Object.assign(env, vars)
  return new Promise<string>((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', `src/${file}`], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    p.stdout.on('data', b => { const s = String(b); process.stdout.write(s); output = (output + s).slice(-20000) })
    p.stderr.on('data', b => { const s = String(b); process.stderr.write(s); output = (output + s).slice(-20000) })
    p.on('error', reject); p.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`${file} exited ${code}; inspect refill logs`)))
  })
}
async function confirmed(job: Job, sweep: Sweep) {
  if (!sweep.oneclick?.depositAddress) throw new Error('conversion missing deposit address; inspect sweep ledger')
  const r = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(sweep.oneclick.depositAddress)}`, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`swap status HTTP ${r.status}`)
  const st = await r.json()
  if (st.quoteResponse?.quoteRequest?.recipient !== RESERVE.zcashTAddress) throw new Error('swap recipient mismatch')
  if (st.status === 'REFUNDED' || st.status === 'FAILED') throw new Error(`swap ${st.status}; manual reconciliation required`)
  if (st.status !== 'SUCCESS') return false
  const amount = BigInt(st.swapDetails.amountOut)
  if (amount < ethers.parseUnits(job.minimum, 8)) throw new Error('delivered amount below authorized minimum')
  const hashes: string[] = st.swapDetails.destinationChainTxHashes.map((t: { hash: string }) => '0x' + t.hash.replace(/^0x/, '').toLowerCase())
  if (hashes.length !== 1) throw new Error('expected one Zcash payout; inspect split payout manually')
  const checks = await Promise.all(['na.zec.rocks:443', 'eu.zec.rocks:443'].map(async host => {
    const [utxos, tip] = await Promise.all([addressUtxos(RESERVE.zcashTAddress, host), chainTip(host)])
    if (tip.chain !== 'main') throw new Error('wrong Zcash chain')
    const outputs = utxos.filter(u => u.txid.toLowerCase() === hashes[0] && u.height > 0 && tip.height - u.height + 1 >= 3)
    return outputs.reduce((n, u) => n + u.valueZat, 0n) >= amount
  }))
  if (!checks.every(Boolean)) { console.log('waiting for three Zcash confirmations'); return false }
  job.amount = ethers.formatUnits(amount, 8); job.txid = hashes[0]
  return true
}
async function tick() {
  const all = jobs()
  const active = all.find(j => j.phase !== 'complete')
  if (active?.phase === 'attention') throw new Error(`refill needs attention: ${active.error}`)
  if (!EXECUTE) {
    const prices = await marketPrices()
    const [inv, eth, slot] = await Promise.all([token.balanceOf(KEEPER), provider.getBalance(KEEPER), sv.getSlot0(POOL)])
    const history = sweeps(), now = Date.now()
    const spent = history.filter(s => now - Date.parse(s.startedAt) < 86400000).reduce((n, s) => n + Number(ethers.formatEther(s.ethIn)), 0)
    const last = Math.max(0, ...history.map(s => Date.parse(s.startedAt)))
    const fair = prices.zecUsd / prices.ethUsd
    console.log(JSON.stringify({ mode: 'preview', inventory: ethers.formatUnits(inv, 8), keeperEth: ethers.formatEther(eth), spent24h: spent, proposedEth: refillAmount(Number(inv) / 1e8, Number(eth) / 1e18, fair, (2 ** 96 / Number(slot[0])) ** 2 / 1e10, spent, last, now), active: active ?? null }))
    return
  }
  if (process.env.REFILL_ENABLED !== '1') throw new Error('refill execution disabled; set REFILL_ENABLED=1 after local signer setup')
  const pass = await validateMinter() // No money is converted unless minting can be completed.
  let job = active
  if (!job) {
    const history = sweeps()
    if (history.some(s => !s.done)) throw new Error('unfinished manual sweep; reconcile before automatic refill')
    const prices = await marketPrices(), now = Date.now()
    const [inv, eth, slot] = await Promise.all([token.balanceOf(KEEPER), provider.getBalance(KEEPER), sv.getSlot0(POOL)])
    const spent = history.filter(s => now - Date.parse(s.startedAt) < 86400000).reduce((n, s) => n + Number(ethers.formatEther(s.ethIn)), 0)
    const last = Math.max(0, ...history.map(s => Date.parse(s.startedAt)))
    const fair = prices.zecUsd / prices.ethUsd
    const ethAmount = refillAmount(Number(inv) / 1e8, Number(eth) / 1e18, fair, (2 ** 96 / Number(slot[0])) ** 2 / 1e10, spent, last, now)
    if (!ethAmount) { console.log('refill not needed or budget/cooldown prevents it'); return }
    const minimum = (Math.floor(ethAmount / fair * 0.97 * 1e8) / 1e8).toFixed(8)
    job = { startedAt: now, eth: ethAmount.toFixed(6), minimum, phase: 'converting', sweepIndex: history.length }
    all.push(job); save(all)
    try {
      // sweep.ts uses an explicit execute argument, added by the wrapper below.
      await child('replenish-sweep.ts', { KEEPER_PASS: getSecret('zeal-keeper'), SWEEP_ROLE: 'keeper', SWEEP_ETH: job.eth, SWEEP_MIN_ZEC: minimum, SWEEP_RETAIN_ETH: '1' })
      job.phase = 'confirming'; save(all)
    } catch (e) { job.phase = 'attention'; job.error = (e as Error).message; save(all); throw e }
  }
  // A crash around a transfer or mint must never cause automatic duplicate issuance.
  try { assertResumable(job.phase) } catch (e) {
    job.error = (e as Error).message; job.phase = 'attention'; save(all); throw e
  }
  const sweep = sweeps()[job.sweepIndex]
  if (!sweep || sweep.source?.toLowerCase() !== KEEPER.toLowerCase() || sweep.reserve !== RESERVE.zcashTAddress || BigInt(sweep.ethIn) !== ethers.parseEther(job.eth)) throw new Error('refill sweep does not match planned source and amount')
  if (!await confirmed(job, sweep)) return
  save(all)
  // Never mint the same Zcash payout for two refill jobs.
  if (all.some(j => j !== job && j.txid === job.txid)) throw new Error('Zcash deposit already assigned to another refill')
  try {
    const priorMinted = all.filter(j => j !== job && j.phase === 'complete' && Date.now() - (j.completedAt ?? j.startedAt) < 86400000).reduce((n, j) => n + ethers.parseUnits(j.amount!, 8), 0n)
    assertMintBudget(ethers.parseUnits(job.amount!, 8), priorMinted)
    job.phase = 'attesting'; save(all)
    const attested = await child('attest.ts', { ATTESTOR_PASS: getSecret('zeal-attestor') })
    job.attestTx = attested.match(/attest\s+(0x[0-9a-f]{64})/i)?.[1]
    if (!job.attestTx) throw new Error('attestation receipt missing')
    job.phase = 'minting'; save(all)
    const minted = await child('mint.ts', { MINTER_PASS: pass, MINT_TO: KEEPER, MINT_ZEC: job.amount })
    job.mintTx = minted.match(/mint .*?(0x[0-9a-f]{64})/i)?.[1]
    if (!job.mintTx) throw new Error('mint transaction missing')
    const receipt = await provider.getTransactionReceipt(job.mintTx)
    if (receipt?.status !== 1) throw new Error('mint not confirmed')
    job.phase = 'complete'; job.completedAt = Date.now(); save(all)
    console.log(`REFILL COMPLETE ${job.amount} zZEC; mint ${job.mintTx}`)
  } catch (e) { job.phase = 'attention'; job.error = (e as Error).message; save(all); throw e }
}
async function unlock() {
  if (!process.stdin.isTTY) throw new Error('session unlock requires a local terminal')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  process.stdout.write('Minter passphrase (session only): ')
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = (() => true) as typeof process.stdout.write
  try { sessionPass = await new Promise<string>(r => rl.question('', r)) }
  finally { process.stdout.write = original; rl.close(); process.stdout.write('\n') }
  await validateMinter()
}
async function run() {
  if (process.argv.includes('--ipc-unlock')) {
    if (!process.send) throw new Error('background unlock requires a private parent IPC channel')
    const secret = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('background unlock timed out')), 20000)
      process.once('message', (m: { pass?: string }) => { clearTimeout(timer); typeof m.pass === 'string' ? resolve(m.pass) : reject(new Error('missing unlock secret')) })
    })
    sessionPass = secret
    try { await validateMinter() } catch { process.send({ error: 'Minter unlock failed; check the passphrase and current role.' }); throw new Error('background minter unlock failed') }
    const start = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('background activation timed out')), 20000)
      process.once('message', (m: { start?: boolean }) => { clearTimeout(timer); m.start ? resolve() : reject(new Error('activation cancelled')) })
    })
    process.send({ ready: true })
    await start
  }
  if (process.argv.includes('--session')) await unlock()
  do {
    try { await withLock('refill', tick) }
    catch (e) { if (!(e instanceof Busy)) { console.error(new Date().toISOString(), (e as Error).message); if (!process.argv.includes('--daemon')) throw e } }
    if (!process.argv.includes('--daemon')) break
    await new Promise(r => setTimeout(r, 60_000))
  } while (true)
}
run().catch(e => { console.error((e as Error).message); process.exitCode = 1 })
