import { ethers } from 'hardhat'
import { ask, unlock } from './lib/secure'

/**
 * Point $ZEAL's creator fees at the Foundry via the Pons locker.
 *
 * The docs describe feeRedirects(token) as the way creator fees reach a
 * contract instead of the deployer wallet. This script never guesses on a
 * live transaction: it simulates setFeeRedirect with eth_call from the
 * keystore wallet first, in both plausible argument orders, and only sends
 * the one whose simulation succeeds. Afterwards it reads feeRedirects(token)
 * back and exits non-zero unless it equals the Foundry.
 *
 *   ZEAL_TOKEN=0x... npx hardhat run scripts/set-redirect.ts --network rhMainnet
 */
const LOCKER = '0x736D76699C26D0d966744cAe304C000d471f7F35'
const FOUNDRY = '0xa1C1Fb281cCC47C587565a01700bF61a03D885a6'
const GET = ethers.id('feeRedirects(address)').slice(0, 10)
const SET = ethers.id('setFeeRedirect(address,address)').slice(0, 10)
const pad = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0')

async function readRedirect(token: string): Promise<string> {
  const raw = await ethers.provider.call({ to: LOCKER, data: GET + pad(token) })
  return raw && raw.length >= 66 ? ethers.getAddress('0x' + raw.slice(-40)) : ethers.ZeroAddress
}

async function main() {
  const tokenRaw = (process.env.ZEAL_TOKEN ?? '').trim()
  if (!ethers.isAddress(tokenRaw)) throw new Error('ZEAL_TOKEN must be the $ZEAL token address')
  const token = ethers.getAddress(tokenRaw)

  const before = await readRedirect(token)
  console.log(`\n$ZEAL token       ${token}`)
  console.log(`Foundry           ${FOUNDRY}`)
  console.log(`feeRedirects now  ${before}${before === FOUNDRY ? '   (already set, nothing to do)' : ''}`)
  if (before === FOUNDRY) return

  const wallet = await unlock(ethers.provider)
  console.log(`Signing as        ${wallet.address}   (must be the token creator)`)

  const candidates = [
    { label: 'setFeeRedirect(token, foundry)', data: SET + pad(token) + pad(FOUNDRY) },
    { label: 'setFeeRedirect(foundry, token)', data: SET + pad(FOUNDRY) + pad(token) },
  ]
  const ok: typeof candidates = []
  for (const c of candidates) {
    try {
      await ethers.provider.call({ to: LOCKER, from: wallet.address, data: c.data })
      console.log(`  simulate ${c.label}   OK`)
      ok.push(c)
    } catch (e) {
      console.log(`  simulate ${c.label}   reverts: ${(e as Error).message.split('\n')[0].slice(0, 90)}`)
    }
  }
  if (ok.length !== 1) {
    throw new Error(
      ok.length === 0
        ? 'Neither simulation succeeded. Most likely this wallet is not the creator, or Pons restricts the setter. Do not retry blindly; ask Pons.'
        : 'Both argument orders simulate successfully, which is ambiguous. Stopping rather than guessing.',
    )
  }

  const go = await ask(`\nSend ${ok[0].label} for real? [y/N] `)
  if (go.toLowerCase() !== 'y') { console.log('Aborted. Nothing sent.'); return }

  const tx = await wallet.sendTransaction({ to: LOCKER, data: ok[0].data })
  console.log(`sent              ${tx.hash}`)
  const rc = await tx.wait()
  console.log(`mined             block ${rc?.blockNumber}, status ${rc?.status}`)

  const after = await readRedirect(token)
  console.log(`feeRedirects now  ${after}`)
  if (after !== FOUNDRY) {
    console.log('\nNOT LIVE: the redirect did not land on the Foundry.\n')
    process.exitCode = 2
    return
  }
  console.log('\nLIVE: creator fees for $ZEAL route to the Foundry.\n')
}

main().catch((e) => { console.error(`\n${(e as Error).message}\n`); process.exitCode = 1 })
