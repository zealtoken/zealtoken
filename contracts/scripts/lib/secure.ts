import { createInterface } from 'node:readline'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ethers } from 'ethers'

/**
 * Key handling for launch.
 *
 * The private key is never written to disk in the clear, never passed as an
 * argument (which would land in shell history), never placed in an env var,
 * and never printed. It is typed into a hidden prompt once, encrypted with a
 * password using scrypt, and thereafter only the password is entered.
 *
 * These prompts need a real terminal, which means YOU run the commands. No
 * agent, script or log ever sees the secret.
 */

export const KEYSTORE_PATH = join(__dirname, '..', '..', '.keystore.json')

/** Reads a line with the echo suppressed, so nothing appears on screen. */
export function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) {
      const asAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream }
      asAny._writeToOutput = (s: string) => {
        // echo the question itself, swallow everything the user types
        if (s.includes(question)) asAny.output.write(s)
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer.trim())
    })
  })
}

export function keystoreExists(): boolean {
  return existsSync(KEYSTORE_PATH)
}

/** Address of the stored key, without decrypting it. */
export function keystoreAddress(): string | null {
  if (!keystoreExists()) return null
  try {
    const j = JSON.parse(readFileSync(KEYSTORE_PATH, 'utf8')) as { address?: string }
    return j.address ? ethers.getAddress('0x' + j.address.replace(/^0x/, '')) : null
  } catch {
    return null
  }
}

/** Prompts for the password and returns an unlocked wallet held only in memory. */
export async function unlock(provider: ethers.Provider): Promise<ethers.Wallet> {
  if (!keystoreExists()) {
    throw new Error('No keystore. Run: npm run key:create')
  }
  const json = readFileSync(KEYSTORE_PATH, 'utf8')
  const password = await ask('Keystore password: ', true)
  process.stdout.write('Decrypting (scrypt, this is deliberately slow)... ')
  const wallet = await ethers.Wallet.fromEncryptedJson(json, password)
  process.stdout.write('ok\n')
  return (wallet as ethers.Wallet).connect(provider) as ethers.Wallet
}

/** One-time setup: encrypt a private key into the keystore. */
export async function createKeystore(): Promise<void> {
  if (keystoreExists()) {
    const ow = await ask(`A keystore already exists (${keystoreAddress()}). Overwrite? [y/N] `)
    if (ow.toLowerCase() !== 'y') {
      console.log('Left alone.')
      return
    }
  }

  console.log('\nPaste the deployer private key. It will not be shown as you type.')
  const pk = await ask('Private key: ', true)
  const clean = pk.startsWith('0x') ? pk : '0x' + pk
  if (!/^0x[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error('That is not a 32-byte private key.')
  }

  const wallet = new ethers.Wallet(clean)
  console.log(`\nThat key controls: ${wallet.address}`)
  console.log('Check that against your wallet before continuing.\n')

  const p1 = await ask('Choose a password: ', true)
  if (p1.length < 8) throw new Error('Use at least 8 characters.')
  const p2 = await ask('Confirm password: ', true)
  if (p1 !== p2) throw new Error('Passwords do not match.')

  process.stdout.write('\nEncrypting (scrypt, this is deliberately slow)... ')
  const json = await wallet.encrypt(p1)
  writeFileSync(KEYSTORE_PATH, json, { mode: 0o600 })
  process.stdout.write('done\n')

  console.log(`\nWrote ${KEYSTORE_PATH} (permissions 600, gitignored).`)
  console.log('The plaintext key is not stored anywhere. Only this password opens it.')
  console.log('If you lose the password, create the keystore again from the key.\n')
}
