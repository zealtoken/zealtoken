import { ethers } from 'hardhat'

/**
 * Run after the Pons launch. Reads the deployed Foundry's immutables and asks
 * the Pons locker where $ZEAL's creator fees go. If the last line is not the
 * Foundry address, the mechanism is not live, whatever the website says.
 *
 *   FOUNDRY=0x... ZEAL_TOKEN=0x... npx hardhat run scripts/verify-launch.ts --network rhMainnet
 */
const LOCKER = '0x736D76699C26D0d966744cAe304C000d471f7F35'
const FEE_REDIRECTS_SELECTOR = ethers.id('feeRedirects(address)').slice(0, 10)

function need(name: string): string {
  const v = process.env[name]
  if (!v || !ethers.isAddress(v)) throw new Error(`${name} must be a valid address`)
  return ethers.getAddress(v)
}

async function main() {
  const foundryAddr = need('FOUNDRY')
  const zeal = need('ZEAL_TOKEN')
  const foundry = await ethers.getContractAt('ZealFoundry', foundryAddr)

  const [rb, lb, ob, rs, ls, os] = await Promise.all([
    foundry.reserveBps(), foundry.liquidityBps(), foundry.opsBps(),
    foundry.reserveSink(), foundry.liquiditySink(), foundry.opsSink(),
  ])
  console.log(`\nFoundry ${foundryAddr}`)
  console.log(`  split        ${rb / 100n}% / ${lb / 100n}% / ${ob / 100n}%   ${rb + lb + ob === 10_000n ? 'ok' : 'WRONG'}`)
  console.log(`  reserve sink ${rs}`)
  console.log(`  liquidity    ${ls}`)
  console.log(`  ops          ${os}`)

  const data = FEE_REDIRECTS_SELECTOR + zeal.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const raw = await ethers.provider.call({ to: LOCKER, data })
  const redirect = raw && raw.length >= 66 ? ethers.getAddress('0x' + raw.slice(-40)) : ethers.ZeroAddress
  const live = redirect === foundryAddr
  console.log(`\nPons locker feeRedirects($ZEAL) -> ${redirect}`)
  console.log(live ? '\nLIVE: creator fees route to the Foundry.\n'
                   : '\nNOT LIVE: the redirect does not point at the Foundry. Set it on Pons before announcing.\n')
  if (!live) process.exitCode = 2
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
