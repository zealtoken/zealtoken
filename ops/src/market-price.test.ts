import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { agree } from './market-price.js'
test('price disagreement and invalid data halt trading', () => {
  assert.equal(agree(100, 101), 100.5)
  assert.throws(() => agree(100, 103))
  assert.throws(() => agree(NaN, 100))
  assert.throws(() => agree(0, 100))
})
