import { test, after } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ethers } from 'ethers'
const dir = mkdtempSync(join(tmpdir(), 'zeal-lock-test-'))
process.env.OPS_STATE_DIR = dir
const { managedSend } = await import('./managed-send.js')
const { withLock, Busy } = await import('./ops-lock.js')
after(() => rmSync(dir, { recursive: true, force: true }))
function fake(address: string, broadcast: () => Promise<unknown>, pending = 0) {
  return { address, provider: { getNetwork: async () => ({ chainId: 4663n }), getTransactionCount: async (_: string, tag: string) => tag === 'pending' ? pending : 0, getTransactionReceipt: async () => null, broadcastTransaction: broadcast }, populateTransaction: async (x: unknown) => x, signTransaction: async () => '0x1234' } as unknown as ethers.Wallet
}
test('only one owner can enter a process lock', async () => {
  await withLock('concurrent', async () => { await assert.rejects(withLock('concurrent', async () => {}), Busy) })
  await withLock('concurrent', async () => {})
})
test('an uncertain broadcast persists its hash and prevents another submission', async () => {
  let sends = 0
  const w = fake('0x0000000000000000000000000000000000000001', async () => { sends++; throw new Error('network disappeared') })
  await assert.rejects(managedSend(w, {}), /network disappeared/)
  await assert.rejects(managedSend(w, {}), /unresolved transaction/)
  assert.equal(sends, 1)
})
test('foreign pending transaction blocks a send', async () => {
  const w = fake('0x0000000000000000000000000000000000000002', async () => { throw new Error('must not broadcast') }, 1)
  await assert.rejects(managedSend(w, {}), /already has a pending/)
})
test('confirmed successful sends clear the pending marker', async () => {
  let sends = 0
  const w = fake('0x0000000000000000000000000000000000000003', async () => { sends++; return { wait: async () => ({ status: 1 }) } })
  await managedSend(w, {}); await managedSend(w, {}); assert.equal(sends, 2)
})
