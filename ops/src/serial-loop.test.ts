import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSerialLoop } from './serial-loop.js'
test('stop drains a pending tick and prevents another tick', async () => {
  const stop = new AbortController()
  let release!: () => void
  let count = 0, finished = false
  const pending = new Promise<void>(r => { release = r })
  const loop = runSerialLoop(async () => { count++; await pending; finished = true }, 0, stop.signal)
  stop.abort()
  assert.equal(finished, false)
  release(); await loop
  assert.equal(count, 1); assert.equal(finished, true)
})
test('tick errors stop the loop instead of allowing another trade', async () => {
  let count = 0
  await assert.rejects(runSerialLoop(async () => { count++; throw new Error('RPC failed') }, 0, new AbortController().signal), /RPC failed/)
  assert.equal(count, 1)
})
test('ticks run serially until stopped', async () => {
  const stop = new AbortController(); let active = 0, count = 0
  await runSerialLoop(async () => {
    assert.equal(active++, 0)
    await new Promise(r => setTimeout(r, 2))
    active--; if (++count === 3) stop.abort()
  }, 1, stop.signal)
  assert.equal(count, 3)
})
