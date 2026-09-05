/**
 * Redemption Desk operator tool.
 *   npm run desk                                   # list open requests
 *   FULFILL_ID=3 ZEC_TXID=<64 hex> npm run desk    # after paying that request's ZEC: record the txid, burn the escrow
 * Signs with ops/.keys/fulfiller.json (ROLES=fulfiller npm run keys:create) or FULFILLER_PASS.
 */
import { ethers } from 'ethers'
import { CHAIN, requireEnv } from './config.js'
import { roleSigner } from './chain.js'

const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })
const ABI = [
  'function requestCount() view returns (uint256)',
  'function getRequest(uint256) view returns (tuple(address holder,uint256 amount,string zcashAddress,uint64 requestedAt,uint8 status,bytes32 zcashTxid,uint256 zzecRedemptionId))',
  'function fulfill(uint256 id, bytes32 zcashTxid)',
  'function operator() view returns (address)',
]
async function main() {
  const desk = new ethers.Contract(requireEnv('DESK_ADDRESS'), ABI, provider)
  const n = Number(await desk.requestCount())
  const open: number[] = []
  for (let i = 0; i < n; i++) {
    const r = await desk.getRequest(i)
    const st = ['none', 'OPEN', 'fulfilled', 'reclaimed'][Number(r.status)]
    if (Number(r.status) === 1) open.push(i)
    console.log(`#${i} ${st.padEnd(9)} ${Number(r.amount) / 1e8} zZEC -> ${r.zcashAddress}  from ${r.holder.slice(0, 10)}…  at ${new Date(Number(r.requestedAt) * 1000).toISOString().slice(0, 16)}${Number(r.status) === 2 ? '  txid ' + r.zcashTxid : ''}`)
  }
  console.log(`${open.length} open`)
  const id = process.env.FULFILL_ID, txid = process.env.ZEC_TXID
  if (id === undefined) return
  if (!txid || !/^(0x)?[0-9a-fA-F]{64}$/.test(txid)) throw new Error('ZEC_TXID must be the 64-hex Zcash transaction id of the payout you already sent')
  const r = await desk.getRequest(Number(id))
  if (Number(r.status) !== 1) throw new Error(`#${id} is not open`)
  console.log(`\nfulfilling #${id}: ${Number(r.amount) / 1e8} zZEC -> ${r.zcashAddress} paid in ${txid}`)
  const signer = await roleSigner('fulfiller' as never)
  if ((await desk.operator()).toLowerCase() !== signer.address.toLowerCase()) throw new Error('this key is not the desk operator')
  const tx = await (desk.connect(signer) as ethers.Contract).fulfill(Number(id), txid.startsWith('0x') ? txid : '0x' + txid)
  console.log(`fulfil tx ${tx.hash}`); await tx.wait(); console.log('done: escrow burned, txid recorded on chain')
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exit(1) })
