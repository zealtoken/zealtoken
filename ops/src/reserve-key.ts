import { createHash } from 'node:crypto'
import { ethers } from 'ethers'

export const RESERVE_ADDRESS = 't1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw'
export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest()
export function publicKeyHash(publicKey: string): Buffer {
  return createHash('ripemd160').update(sha256(ethers.getBytes(ethers.SigningKey.computePublicKey(publicKey, true)))).digest()
}
export function transparentAddress(publicKey: string): string {
  const payload = Buffer.concat([Buffer.from([0x1c, 0xb8]), publicKeyHash(publicKey)])
  return ethers.encodeBase58(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]))
}
/** Derive only standard external transparent keys. Never return an account key or mnemonic. */
export function findReserveKey(phrase: string, expected = RESERVE_ADDRESS, accounts = 4, indices = 100) {
  if (!Number.isInteger(accounts) || accounts < 1 || accounts > 10 || !Number.isInteger(indices) || indices < 1 || indices > 1000) throw new Error('Invalid derivation search bounds')
  // ethers errors can contain their input, so callers must not print exceptions.
  const normalized = phrase.trim().toLowerCase().split(/\s+/).join(' ')
  if (!ethers.Mnemonic.isValidMnemonic(normalized)) throw new Error('Invalid recovery phrase')
  for (let account = 0; account < accounts; account++) {
    const branch = ethers.HDNodeWallet.fromPhrase(normalized, '', `m/44'/133'/${account}'/0`)
    for (let index = 0; index < indices; index++) {
      const child = branch.deriveChild(index)
      if (transparentAddress(child.publicKey) === expected) {
        return { privateKey: child.privateKey, publicKey: child.publicKey, path: `m/44'/133'/${account}'/0/${index}`, address: expected }
      }
    }
  }
  throw new Error('Reserve address not found')
}
