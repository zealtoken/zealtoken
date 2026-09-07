import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ethers } from 'ethers'
import { findReserveKey, publicKeyHash, transparentAddress } from './reserve-key.js'

test('matches upstream Zcash BIP32 account public key and HASH160 vector', () => {
  // zcash/zcash-test-vectors transparent/bip_0032.py, account 0.
  const seed = Uint8Array.from({ length: 32 }, (_, i) => i)
  const account = ethers.HDNodeWallet.fromSeed(seed).derivePath("m/44'/133'/0'")
  assert.equal(account.publicKey, '0x02ed638532c475f67400350fb1d6eda559cdc289a19b4319eb175140aa86893836')
  assert.equal(publicKeyHash(account.publicKey).toString('hex'), '6725f262bba6422fd47c305b8378c4994241c442')
})
test('finds the exact address and returns only the individual key', () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const expected = ethers.HDNodeWallet.fromPhrase(phrase, '', "m/44'/133'/0'/0/3")
  const result = findReserveKey(phrase, transparentAddress(expected.publicKey), 1, 4)
  assert.equal(result.privateKey, expected.privateKey)
  assert.equal(result.path, "m/44'/133'/0'/0/3")
  assert.deepEqual(Object.keys(result).sort(), ['address', 'path', 'privateKey', 'publicKey'])
  assert.throws(() => findReserveKey(phrase, transparentAddress(expected.publicKey), 1, 3), /not found/)
})
test('encoded mainnet address has correct prefix and checksum', () => {
  const pub = ethers.SigningKey.computePublicKey('0x' + '0'.repeat(63) + '1', true)
  const encoded = transparentAddress(pub)
  const raw = ethers.getBytes(ethers.toBeHex(ethers.decodeBase58(encoded), 26))
  assert.equal(Buffer.from(raw.subarray(0, 2)).toString('hex'), '1cb8')
  assert.equal(Buffer.from(raw.subarray(2, 22)).toString('hex'), '751e76e8199196d454941c45d1b3a323f1433bd6')
  const expected = ethers.getBytes(ethers.sha256(ethers.sha256(raw.subarray(0, 22)))).subarray(0, 4)
  assert.deepEqual(raw.subarray(22), expected)
})

test('encrypted standalone key round-trips without mnemonic or HD metadata', async () => {
  const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  const child = ethers.HDNodeWallet.fromPhrase(phrase, '', "m/44'/133'/0'/0/0")
  const encrypted = await new ethers.Wallet(child.privateKey).encrypt('synthetic-test-password-only')
  const parsed = JSON.parse(encrypted)
  assert.equal(parsed['x-ethers'], undefined)
  assert.equal(encrypted.includes(phrase), false)
  assert.equal(encrypted.includes(child.privateKey.slice(2)), false)
  const restored = await ethers.Wallet.fromEncryptedJson(encrypted, 'synthetic-test-password-only')
  assert.equal(transparentAddress(restored.signingKey.publicKey), transparentAddress(child.publicKey))
})
