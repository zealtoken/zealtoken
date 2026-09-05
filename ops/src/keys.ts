/**
 * Create the two role keys as encrypted keystores. Prints ADDRESSES only.
 * Attestor and minter are separate files with separate passphrases so one
 * leak can neither both inflate the reserve number and mint against it.
 *
 *   npm run keys:create
 */
import { ethers } from 'ethers'
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { KEYS_DIR, keyPath } from './chain.js'

function ask(q: string): Promise<string> {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const out = process.stdout as NodeJS.WriteStream & { _mute?: boolean }
    process.stdout.write(q)
    const orig = out.write.bind(out)
    ;(out as unknown as { write: (s: string) => boolean }).write = (s: string) => (s.includes('\n') ? orig(s) : true)
    rl.question('', (a) => { ;(out as unknown as { write: typeof orig }).write = orig; process.stdout.write('\n'); rl.close(); res(a) })
  })
}

async function main() {
  mkdirSync(KEYS_DIR, { recursive: true })
  const roles = (process.env.ROLES ?? 'attestor,minter').split(',') as ('attestor' | 'minter' | 'keeper' | 'fulfiller')[]
  for (const role of roles) {
    const file = keyPath(role)
    if (existsSync(file)) { console.log(`${role}: exists at ${file}, leaving it`); continue }
    const a = await ask(`passphrase for ${role} key: `)
    const b = await ask(`again: `)
    if (a !== b || a.length < 8) throw new Error('passphrases differ or are under 8 chars')
    const w = ethers.Wallet.createRandom()
    writeFileSync(file, await w.encrypt(a)); chmodSync(file, 0o600)
    console.log(`${role}: ${w.address}   (${file})`)
  }
  console.log('\nPut the addresses into contracts/.env as ZZEC_ATTESTOR / ZZEC_MINTER. Keys never leave this directory.\n')
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
