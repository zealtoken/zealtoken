import { ethers } from 'ethers'
import { CHAIN, CONTRACTS, requireEnv } from './config.js'

export type DeskLiability = { amount: bigint; status: number; redemptionId: bigint }

/** Until reserve-to-float reimbursements are independently verified, keep every
 * completed desk payout encumbered. Never accept a manually entered credit here.
 * Open requests remain in ERC20 supply already; counting them twice is wrong.
 */
export function reimbursementDue(rows: DeskLiability[], redemptionCount: bigint): bigint {
  const seen = new Set<string>()
  let due = 0n
  for (const row of rows) {
    if (row.amount <= 0n || ![1, 2, 3].includes(row.status)) throw new Error('Invalid redemption accounting row')
    if (row.status !== 2) continue
    if (row.redemptionId <= 0n || row.redemptionId > redemptionCount || seen.has(String(row.redemptionId))) throw new Error('Invalid or duplicate wrapper redemption id')
    seen.add(String(row.redemptionId))
    due += row.amount
  }
  // A direct burn has already reduced supply but may still be owed native ZEC.
  // Do not silently free that backing just because it bypassed the desk.
  if (BigInt(seen.size) !== redemptionCount) throw new Error('Unreconciled direct ZEC redemption: minting requires accounting review')
  return due
}

export function mintCapacity(live: bigint, supply: bigint, reimbursement: bigint, pending: bigint): bigint {
  if ([live, supply, reimbursement, pending].some(n => n < 0n)) throw new Error('Negative reserve accounting value')
  const obligations = supply + reimbursement + pending
  return live > obligations ? live - obligations : 0n
}

/** One EVM block for supply and every liability read. No signing or money movement. */
export async function redemptionAccounting() {
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true, cacheTimeout: -1 })
  try {
    const blockTag = await provider.getBlockNumber()
    const token = new ethers.Contract(CONTRACTS.zzec, ['function totalSupply() view returns(uint256)', 'function redemptionCount() view returns(uint256)'], provider)
    const desk = new ethers.Contract(requireEnv('DESK_ADDRESS'), ['function zzec() view returns(address)', 'function requestCount() view returns(uint256)', 'function getRequest(uint256) view returns(tuple(address holder,uint256 amount,string zcashAddress,uint64 requestedAt,uint8 status,bytes32 zcashTxid,uint256 zzecRedemptionId))'], provider)
    const [supply, count, n, linkedToken] = await Promise.all([token.totalSupply({ blockTag }), token.redemptionCount({ blockTag }), desk.requestCount({ blockTag }), desk.zzec({ blockTag })])
    if (linkedToken.toLowerCase() !== CONTRACTS.zzec.toLowerCase()) throw new Error('Redemption desk token mismatch')
    if (n > 10000n) throw new Error('Redemption accounting needs a paginated index before further minting')
    const rows: DeskLiability[] = []
    for (let i = 0; i < Number(n); i += 10) {
      const batch = await Promise.all(Array.from({ length: Math.min(10, Number(n) - i) }, (_, j) => desk.getRequest(i + j, { blockTag })))
      rows.push(...batch.map(r => ({ amount: BigInt(r.amount), status: Number(r.status), redemptionId: BigInt(r.zzecRedemptionId) })))
    }
    return { block: blockTag, supply: BigInt(supply), reimbursementZats: reimbursementDue(rows, BigInt(count)), requests: Number(n) }
  } finally { provider.destroy() }
}
