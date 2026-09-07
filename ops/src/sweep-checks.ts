import { ethers } from 'ethers'

const sameAddress = (a: unknown, b: string) => typeof a === 'string' && ethers.isAddress(a) && a.toLowerCase() === b.toLowerCase()

/** Reject extra instructions or a different asset, network, sender or recipient. */
export function checkRelay(q: any, sender: string, amount: bigint, chain: number, arb: number) {
  const out = q.details?.currencyOut
  if (Number(out?.currency?.chainId) !== arb || !sameAddress(out?.currency?.address, ethers.ZeroAddress)) throw new Error('Relay output is not native ETH on Arbitrum')
  if (q.steps?.length !== 1 || q.steps[0].kind !== 'transaction' || q.steps[0].items?.length !== 1) throw new Error('unsupported Relay transaction sequence')
  if (typeof q.steps[0].requestId !== 'string' || !/^0x[0-9a-f]{64}$/i.test(q.steps[0].requestId)) throw new Error('Relay request ID missing')
  const dep = q.steps[0].items[0].data
  if (!dep || Number(dep.chainId) !== chain || BigInt(dep.value) !== amount || !sameAddress(dep.from, sender) || !ethers.isAddress(dep.to)) throw new Error('Relay deposit does not match requested sender, chain or amount')
  const output = BigInt(out.amount)
  const minimum = BigInt(out.minimumAmount)
  if (minimum <= 0n || output < minimum) throw new Error('invalid Relay output amounts')
  return { dep, output, minimum }
}

export function checkOneClick(q: any, amount: bigint, sender: string, reserve: string, minimum: bigint, dry: boolean) {
  const r = q.quoteRequest
  if (!r || r.dry !== dry || r.swapType !== 'EXACT_INPUT' ||
      r.originAsset !== 'nep141:arb.omft.near' || r.destinationAsset !== 'nep141:zec.omft.near' ||
      r.depositType !== 'ORIGIN_CHAIN' || r.recipientType !== 'DESTINATION_CHAIN' || r.refundType !== 'ORIGIN_CHAIN' ||
      r.recipient !== reserve || !sameAddress(r.refundTo, sender) || BigInt(r.amount) !== amount ||
      Number(r.slippageTolerance) !== 100) throw new Error('1Click quote route, amount, recipient or refund address mismatch')
  if (BigInt(q.quote?.amountIn) !== amount || BigInt(q.quote?.minAmountOut) <= 0n || BigInt(q.quote.minAmountOut) < minimum) throw new Error('1Click quote misses the minimum ZEC output')
  if (!dry && (!ethers.isAddress(q.quote.depositAddress) || q.quote.depositMemo)) throw new Error('unsupported 1Click deposit instructions')
  if (!Number.isFinite(Date.parse(r.deadline)) || Date.parse(r.deadline) <= Date.now()) throw new Error('1Click quote has expired')
}

export function checkRetainedBalance(balance: bigint, spend: bigint, gas: bigint, retain: bigint) {
  if (spend <= 0n || gas < 0n || retain < 0n || balance < spend + gas + retain) throw new Error('insufficient ETH to convert while preserving the retained balance and gas')
}
