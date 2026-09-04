/**
 * Role-change watchdog. The 48h timelocks on ZZEC and the Tap only protect
 * anyone if someone is watching. This polls every pending change that a
 * compromised key could start, keeps the last state on disk, and prints an
 * ALERT line (non-zero exit) the moment something new is pending. Run it
 * from launchd every 5 minutes; the log is the alarm.
 */
import { ethers } from 'ethers'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { CHAIN, CONTRACTS } from './config.js'

const FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const TAP = '0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47'
const ZEAL = '0x9fA1C5E90A11294F83A9F135b81ad1b537A5FFdC'
const STATE = new URL('../launchd/roles-state.json', import.meta.url).pathname
const provider = new ethers.JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true })

const zzec = new ethers.Contract(CONTRACTS.zzec, [
  'function owner() view returns (address)', 'function pendingOwner() view returns (address)',
  'function attestor() view returns (address)', 'function minter() view returns (address)',
  'function pendingAttestor() view returns (address account, uint64 eta)', 'function pendingMinter() view returns (address account, uint64 eta)',
  'function mintingPaused() view returns (bool)', 'function maxAttestationAge() view returns (uint64)',
], provider)
const tap = new ethers.Contract(TAP, ['function pendingRecipient() view returns (address)', 'function migrationReadyAt() view returns (uint256)'], provider)
const factory = new ethers.Contract(FACTORY, ['function pendingCreatorFeeRecipient(address) view returns (address newRecipient, uint256 effectiveAt, uint256 expiresAt)'], provider)

async function snapshot() {
  const [owner, pendingOwner, attestor, minter, pa, pm, paused, age, tapPending, tapReady, pons] = await Promise.all([
    zzec.owner(), zzec.pendingOwner(), zzec.attestor(), zzec.minter(), zzec.pendingAttestor(), zzec.pendingMinter(), zzec.mintingPaused(), zzec.maxAttestationAge(),
    tap.pendingRecipient(), tap.migrationReadyAt(), factory.pendingCreatorFeeRecipient(ZEAL),
  ])
  return {
    zzec: { owner, pendingOwner, attestor, minter, pendingAttestor: pa.account, pendingAttestorEta: Number(pa.eta), pendingMinter: pm.account, pendingMinterEta: Number(pm.eta), mintingPaused: paused, maxAttestationAge: Number(age) },
    tap: { pendingRecipient: tapPending, migrationReadyAt: Number(tapReady) },
    pons: { proposedRecipient: pons.newRecipient, effectiveAt: Number(pons.effectiveAt), expiresAt: Number(pons.expiresAt) },
  }
}

async function main() {
  const now = await snapshot()
  const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null
  writeFileSync(STATE, JSON.stringify(now, null, 2))
  const zero = ethers.ZeroAddress
  const alerts: string[] = []
  if (now.zzec.pendingOwner !== zero) alerts.push(`ZZEC ownership handover pending to ${now.zzec.pendingOwner}`)
  if (now.zzec.pendingAttestor !== zero) alerts.push(`ZZEC attestor change proposed -> ${now.zzec.pendingAttestor} (eta ${new Date(now.zzec.pendingAttestorEta * 1000).toISOString()})`)
  if (now.zzec.pendingMinter !== zero) alerts.push(`ZZEC minter change proposed -> ${now.zzec.pendingMinter} (eta ${new Date(now.zzec.pendingMinterEta * 1000).toISOString()})`)
  if (now.zzec.mintingPaused) alerts.push('ZZEC minting is PAUSED')
  if (now.tap.pendingRecipient !== zero) alerts.push(`Tap migration proposed -> ${now.tap.pendingRecipient} (ready ${new Date(now.tap.migrationReadyAt * 1000).toISOString()})`)
  if (now.pons.proposedRecipient !== zero) alerts.push(`Pons recipient change proposed -> ${now.pons.proposedRecipient} (executes ${new Date(now.pons.effectiveAt * 1000).toISOString()})`)
  const changed = prev && JSON.stringify(prev) !== JSON.stringify(now)
  const stamp = new Date().toISOString()
  if (alerts.length) { for (const a of alerts) console.log(`${stamp} ALERT ${a}`); process.exitCode = 2 }
  else console.log(`${stamp} ok · nothing pending${changed ? ' · state changed (see roles-state.json)' : ''}`)
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
