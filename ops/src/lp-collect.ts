/**
 * Collect the 0.3% LP fees from our positions to their owner. Keep them.
 *   LP_TOKEN_IDS=1909208 npm run lp:collect               # plan
 *   LP_TOKEN_IDS=1909208 npm run lp:collect -- --execute  # deployer keystore
 */
import { ethers } from 'ethers'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { CHAIN, CONTRACTS } from './config.js'

const POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7'
const ETH = ethers.ZeroAddress
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const abi = ethers.AbiCoder.defaultAbiCoder()
const posm = new ethers.Contract(POSM, ['function modifyLiquidities(bytes,uint256) payable', 'function ownerOf(uint256) view returns (address)'], provider)
const erc20 = (a: string) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)'], provider)

async function main() {
  const execute = process.argv.includes('--execute')
  const ids = (process.env.LP_TOKEN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean).map(BigInt)
  if (!ids.length) throw new Error('LP_TOKEN_IDS required')
  const owner: string = await posm.ownerOf(ids[0])
  const actions = ethers.solidityPacked(Array(ids.length + 1).fill('uint8'), [...ids.map(() => 0x01), 0x11])
  const params = [...ids.map((id) => abi.encode(['uint256', 'uint256', 'uint128', 'uint128', 'bytes'], [id, 0n, 0n, 0n, '0x'])), abi.encode(['address', 'address', 'address'], [ETH, CONTRACTS.zzec, owner])]
  const data = posm.interface.encodeFunctionData('modifyLiquidities', [abi.encode(['bytes', 'bytes[]'], [actions, params]), Math.floor(Date.now() / 1000) + 600])
  const gas = await provider.estimateGas({ from: owner, to: POSM, data }).catch((e) => { throw new Error('simulation reverted: ' + (e.shortMessage ?? e.message)) })
  console.log(`collect LP fees from #${ids.join(', #')} -> ${owner}; simulation OK, gas ~${gas}`)
  if (!execute) { console.log('Plan only. Add --execute to sign.'); return }
  const ksPath = process.env.LP_KEYSTORE ?? new URL('../../contracts/.keystore.json', import.meta.url).pathname
  const pass = process.env.LP_PASS ?? (await new Promise<string>((res) => { if (!process.stdin.isTTY) throw new Error('no TTY; set LP_PASS'); const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true }); process.stdout.write('keystore passphrase: '); const out = process.stdout as unknown as { write: (s: string) => boolean }; const orig = out.write.bind(process.stdout); out.write = (s: string) => (s.includes('\n') ? orig(s) : true); rl.question('', (a) => { out.write = orig; process.stdout.write('\n'); rl.close(); res(a) }) }))
  const wallet = (await ethers.Wallet.fromEncryptedJson(readFileSync(ksPath, 'utf8'), pass)).connect(provider)
  if (wallet.address.toLowerCase() !== owner.toLowerCase()) throw new Error('keystore does not own these positions')
  const e0 = await provider.getBalance(owner), z0: bigint = await erc20(CONTRACTS.zzec).balanceOf(owner)
  const tx = await wallet.sendTransaction({ to: POSM, data }); console.log(`collect tx ${tx.hash}`); const rc = await tx.wait()
  const gasCost = (rc?.gasUsed ?? 0n) * (rc?.gasPrice ?? 0n)
  console.log(`kept: +${ethers.formatEther((await provider.getBalance(owner)) - e0 + gasCost)} ETH, +${Number((await erc20(CONTRACTS.zzec).balanceOf(owner)) - z0) / 1e8} zZEC`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
