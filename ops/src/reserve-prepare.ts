/** Local-only preparation. No AWS client, network calls, broadcast or activation. */
import { ethers } from 'ethers'
import { createInterface } from 'node:readline'
import { mkdirSync, writeFileSync, existsSync, lstatSync, chmodSync, readFileSync } from 'node:fs'
import { findReserveKey, RESERVE_ADDRESS, transparentAddress } from './reserve-key.js'

class SetupError extends Error {}
async function hidden(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const write = process.stdout.write.bind(process.stdout)
  write(label)
  process.stdout.write = (() => true) as typeof process.stdout.write
  try {
    return await new Promise<string>((resolve, reject) => {
      rl.once('SIGINT', () => reject(new SetupError('Cancelled')))
      rl.once('close', () => reject(new SetupError('Input closed')))
      rl.question('', resolve)
    })
  } finally { process.stdout.write = write; rl.close(); write('\n') }
}
async function main() {
  if (process.platform !== 'darwin' || !process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) throw new SetupError('Run npm run reserve:prepare in your Mac terminal, without arguments')
  process.umask(0o077)
  const dir = new URL('../.keys/', import.meta.url).pathname
  const file = dir + 'reserve-transparent.json'
  if (existsSync(file)) throw new SetupError('An encrypted reserve key already exists; preserved without changes')
  if (existsSync(dir) && (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory())) throw new SetupError('Unsafe key directory')
  mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700)
  console.log('Local preparation only: no upload, no transfer, no cloud activation.')
  console.log(`Must match the existing reserve: ${RESERVE_ADDRESS}`)
  console.log('Enter secrets only at the hidden prompts below, never as commands or chat messages.')
  let phrase = await hidden('Zodl recovery phrase (hidden, used only in this process): ')
  let derived: ReturnType<typeof findReserveKey>
  try { derived = findReserveKey(phrase) }
  catch { throw new SetupError('Could not match the reserve address. Nothing saved. Check the wallet and phrase; do not send the phrase to anyone.') }
  finally { phrase = '' }
  console.log(`Address verified: ${derived.address}`)
  let password = await hidden('Create a new encryption passphrase (at least 16 characters): ')
  let confirmation = await hidden('Repeat the encryption passphrase: ')
  if (password.length < 16 || password !== confirmation) throw new SetupError('Encryption passphrases must match and contain at least 16 characters. Nothing saved.')
  confirmation = ''
  // Plain Wallet deliberately discards all HD metadata and the recovery phrase.
  const encryptedKey = await new ethers.Wallet(derived.privateKey).encrypt(password)
  const restored = await ethers.Wallet.fromEncryptedJson(encryptedKey, password)
  if (transparentAddress(restored.signingKey.publicKey) !== RESERVE_ADDRESS) throw new SetupError('Encrypted key verification failed; nothing saved')
  const record = { version: 1, network: 'zcash-mainnet', address: derived.address, publicKey: derived.publicKey, derivationPath: derived.path, createdAt: new Date().toISOString(), encryptedKey: JSON.parse(encryptedKey) }
  writeFileSync(file, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 })
  const reread = JSON.parse(readFileSync(file, 'utf8'))
  if (reread.address !== RESERVE_ADDRESS || JSON.stringify(reread.encryptedKey) !== JSON.stringify(record.encryptedKey)) throw new SetupError('Saved key verification failed; retain the original Zodl wallet')
  password = ''; derived.privateKey = ''
  console.log('Encrypted single-address key saved and decrypt-tested locally.')
  console.log('Nothing uploaded or transferred. Cloud reserve signing remains disabled.')
  console.log('Keep your Zodl backup and the new encryption passphrase. Return to Codex with only this success message.')
}
main().catch(e => {
  // Never emit library errors: crypto libraries may include secret inputs in them.
  console.error(e instanceof SetupError ? e.message : 'Local reserve preparation failed; secret details withheld. No cloud upload or transfer occurred.')
  process.exitCode = 1
})
