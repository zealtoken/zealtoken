import { ethers } from 'ethers'
import { CHAIN, CONTRACTS } from './config.js'

/** The slice of ZZEC the operator drives. Kept in step with contracts/ZZEC.sol. */
export const ZZEC_ABI = [
  'function attest(uint256 reserveZats, bytes32 proofRef) external',
  'function mint(address to, uint256 amount) external',
  'function reserveZats() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function coverageBps() view returns (uint256)',
  'function lastAttestationAt() view returns (uint64)',
  'function maxAttestationAge() view returns (uint64)',
  'function attestationIsFresh() view returns (bool)',
  'function mintingPaused() view returns (bool)',
  'function attestor() view returns (address)',
  'function minter() view returns (address)',
  'function redemptionCount() view returns (uint256)',
  'event RedemptionRequested(uint256 indexed id, address indexed from, uint256 amount, string zcashAddress)',
  'event Attested(uint256 reserveZats, uint256 supply, bytes32 proofRef, uint64 at)',
] as const

export const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })

export function zzec(signer?: ethers.Signer) {
  if (!CONTRACTS.zzec) throw new Error('ZZEC_ADDRESS is not set; zZEC deploys in Phase 02')
  return new ethers.Contract(CONTRACTS.zzec, ZZEC_ABI, signer ?? provider)
}

/** A role key from the environment. Attestor and minter are separate on purpose. */
export const KEYS_DIR = new URL('../.keys/', import.meta.url).pathname
export const keyPath = (role: 'attestor' | 'minter') => `${KEYS_DIR}${role}.json`

/**
 * Unlock a role key. Order: encrypted keystore in ops/.keys (passphrase from
 * ATTESTOR_PASS / MINTER_PASS or an interactive prompt), else a raw *_KEY env
 * for hosts that inject secrets themselves.
 */
export async function roleSigner(role: 'attestor' | 'minter'): Promise<ethers.Wallet> {
  const { existsSync, readFileSync } = await import('node:fs')
  const file = keyPath(role)
  const envKey = process.env[role === 'attestor' ? 'ATTESTOR_KEY' : 'MINTER_KEY']
  if (existsSync(file)) {
    let pass = process.env[role === 'attestor' ? 'ATTESTOR_PASS' : 'MINTER_PASS']
    if (!pass) {
      const { createInterface } = await import('node:readline')
      pass = await new Promise<string>((res) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        rl.question(`passphrase for ${role} key: `, (a) => { rl.close(); res(a) })
      })
    }
    const w = await ethers.Wallet.fromEncryptedJson(readFileSync(file, 'utf8'), pass)
    return new ethers.Wallet(w.privateKey, provider)
  }
  if (envKey) return new ethers.Wallet(envKey, provider)
  throw new Error(`no ${role} key: run npm run keys:create (or set ${role.toUpperCase()}_KEY)`)
}
