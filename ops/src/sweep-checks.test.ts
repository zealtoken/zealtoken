import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ethers } from 'ethers'
import { checkOneClick, checkRelay, checkRetainedBalance } from './sweep-checks.js'

const sender = '0x19cece80126b79F76D8b8297B876310a56349738'
const reserve = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
const amount = ethers.parseEther('0.5')
const relay = () => ({
  details: { currencyOut: { currency: { chainId: 42161, address: ethers.ZeroAddress }, amount: '499000000000000000', minimumAmount: '490000000000000000' } },
  steps: [{ requestId: '0x' + '1'.repeat(64), kind: 'transaction', items: [{ data: { chainId: 4663, from: sender, to: ethers.ZeroAddress, value: amount.toString() } }] }],
})
const swap = () => ({
  quote: { amountIn: amount.toString(), minAmountOut: '101000000', depositAddress: sender, depositMemo: '' },
  quoteRequest: { dry: false, swapType: 'EXACT_INPUT', originAsset: 'nep141:arb.omft.near', destinationAsset: 'nep141:zec.omft.near', depositType: 'ORIGIN_CHAIN', recipientType: 'DESTINATION_CHAIN', refundType: 'ORIGIN_CHAIN', recipient: reserve, refundTo: sender, amount: amount.toString(), slippageTolerance: 100, deadline: new Date(Date.now() + 60_000).toISOString() },
})
test('accept quoted native ETH bridge and exact reserve ZEC payout', () => {
  assert.equal(checkRelay(relay(), sender, amount, 4663, 42161).minimum, 490000000000000000n)
  checkOneClick(swap(), amount, sender, reserve, 100000000n, false)
})
test('reject changed bridge chain, sender, asset, amount and extra transactions', () => {
  for (const mutate of [
    (q: ReturnType<typeof relay>) => { q.details.currencyOut.currency.chainId = 1 },
    (q: ReturnType<typeof relay>) => { q.details.currencyOut.currency.address = sender },
    (q: ReturnType<typeof relay>) => { q.steps[0].items[0].data.from = ethers.ZeroAddress },
    (q: ReturnType<typeof relay>) => { q.steps[0].items[0].data.value = '1' },
    (q: ReturnType<typeof relay>) => { q.steps.push(q.steps[0]) },
  ]) { const q = relay(); mutate(q); assert.throws(() => checkRelay(q, sender, amount, 4663, 42161)) }
})
test('reject changed payout, refund, token, input amount, expiry and memo', () => {
  for (const mutate of [
    (q: ReturnType<typeof swap>) => { q.quoteRequest.recipient = 'another reserve' },
    (q: ReturnType<typeof swap>) => { q.quoteRequest.refundTo = ethers.ZeroAddress },
    (q: ReturnType<typeof swap>) => { q.quoteRequest.destinationAsset = 'nep141:other' },
    (q: ReturnType<typeof swap>) => { q.quote.amountIn = '1' },
    (q: ReturnType<typeof swap>) => { q.quoteRequest.deadline = '2020-01-01' },
    (q: ReturnType<typeof swap>) => { q.quote.depositMemo = 'required memo' },
    (q: ReturnType<typeof swap>) => { q.quoteRequest.dry = true },
  ]) { const q = swap(); mutate(q); assert.throws(() => checkOneClick(q, amount, sender, reserve, 100000000n, false)) }
})
test('reject a worse minimum payout before sending', () => {
  const q = swap(); q.quote.minAmountOut = '99999999'
  assert.throws(() => checkOneClick(q, amount, sender, reserve, 100000000n, false))
})
test('preserve ETH budget including gas; reject nonpositive spend', () => {
  checkRetainedBalance(ethers.parseEther('1.57'), amount, ethers.parseEther('0.001'), ethers.parseEther('1'))
  assert.throws(() => checkRetainedBalance(ethers.parseEther('1.5'), amount, 1n, ethers.parseEther('1')))
  assert.throws(() => checkRetainedBalance(ethers.parseEther('2'), 0n, 1n, ethers.parseEther('1')))
})
