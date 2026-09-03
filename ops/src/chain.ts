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
export function roleSigner(envName: 'ATTESTOR_KEY' | 'MINTER_KEY'): ethers.Wallet {
  const k = process.env[envName]
  if (!k) throw new Error(`Missing ${envName}`)
  return new ethers.Wallet(k, provider)
}
