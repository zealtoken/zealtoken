/**
 * Withdraw liquidity from one or more of our zZEC/ETH positions back to their owner.
 * Used to migrate liquidity to the hooked market. Nothing here touches the Furnace.
 *
 *   LP_TOKEN_IDS=1829215,1835853 npm run lp:exit               # plan
 *   LP_TOKEN_IDS=1829215,1835853 npm run lp:exit -- --execute  # signs with the deployer keystore
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, CONTRACTS } from './config.js'

const POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7'
const ETH = ethers.ZeroAddress
const ACT = { DECREASE_LIQUIDITY: 0x01, TAKE_PAIR: 0x11, BURN_POSITION: 0x03 } as const
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const abi = ethers.AbiCoder.defaultAbiCoder()
const posm = new ethers.Contract(POSM, ['function modifyLiquidities(bytes,uint256) payable', 'function ownerOf(uint256) view returns (address)', 'function getPositionLiquidity(uint256) view returns (uint128)'], provider)

async function main() {
  const execute = process.argv.includes('--execute')
  const ids = (process.env.LP_TOKEN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(BigInt)
  if (!ids.length) throw new Error('LP_TOKEN_IDS required')
  const owners: string[] = await Promise.all(ids.map((id) => posm.ownerOf(id)))
  const owner = owners[0]
  if (owners.some((o) => o.toLowerCase() !== owner.toLowerCase())) throw new Error('positions have different owners')
  const liq: bigint[] = await Promise.all(ids.map((id) => posm.getPositionLiquidity(id)))
  ids.forEach((id, i) => console.log(`position #${id}: liquidity ${liq[i]} (owner ${owner})`))
  // one DECREASE per position for its full liquidity, then TAKE_PAIR everything to the owner.
  // Amount minimums are zero on purpose: a full-range withdrawal cannot be sandwiched into a worse ratio
  // than the pool's own; the owner gets exactly the pool's current mix.
  const actions = ethers.solidityPacked(Array(ids.length + 1).fill('uint8'), [...ids.map(() => ACT.DECREASE_LIQUIDITY), ACT.TAKE_PAIR])
  const params = [...ids.map((id, i) => abi.encode(['uint256', 'uint256', 'uint128', 'uint128', 'bytes'], [id, liq[i], 0n, 0n, '0x'])), abi.encode(['address', 'address', 'address'], [ETH, CONTRACTS.zzec, owner])]
  const data = posm.interface.encodeFunctionData('modifyLiquidities', [abi.encode(['bytes', 'bytes[]'], [actions, params]), Math.floor(Date.now() / 1000) + 600])
  const gas = await provider.estimateGas({ from: owner, to: POSM, data }).catch((e) => { throw new Error('simulation reverted: ' + (e.shortMessage ?? e.message)) })
  console.log(`simulation OK: withdrawing all liquidity from ${ids.length} position(s) to ${owner}; gas ~${gas}`)
  if (!execute) { console.log('Plan only. Add --execute to sign.'); return }
  const ksPath = process.env.LP_KEYSTORE ?? new URL('../../contracts/.keystore.json', import.meta.url).pathname
  const pass = process.env.LP_PASS ?? (await new Promise<string>((res) => { const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); process.stdout.write('keystore passphrase: '); const out = process.stdout as unknown as { write: (s: string) => boolean }; const orig = out.write.bind(process.stdout); out.write = (s: string) => (s.includes('\n') ? orig(s) : true); rl.question('', (a) => { out.write = orig; process.stdout.write('\n'); rl.close(); res(a) }) }))
  const wallet = (await ethers.Wallet.fromEncryptedJson(readFileSync(ksPath, 'utf8'), pass)).connect(provider)
  if (wallet.address.toLowerCase() !== owner.toLowerCase()) throw new Error('keystore does not own these positions')
  const e0 = await provider.getBalance(owner)
  const tx = await wallet.sendTransaction({ to: POSM, data }); console.log(`exit tx ${tx.hash}`); const rc = await tx.wait()
  const gasCost = (rc?.gasUsed ?? 0n) * (rc?.gasPrice ?? 0n)
  console.log(`done: +${ethers.formatEther((await provider.getBalance(owner)) - e0 + gasCost)} ETH (before gas) to ${owner}; check zZEC balance too`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
