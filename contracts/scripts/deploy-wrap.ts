import { ethers } from 'hardhat'
/**
 * Deploy the WrapDesk. Then make it the ZZEC minter with set-minter.ts (48h timelock).
 *   WRAP_OPERATOR=0x... [WRAP_MIN_ZZEC=0.001] npm run wrap:deploy
 */
async function main() {
  const [deployer] = await ethers.getSigners()
  const ZZEC = process.env.ZZEC_ADDRESS ?? '0x0b151Ff7a7c5250130EC16C275790961d558E402'
  const operator = process.env.WRAP_OPERATOR
  if (!operator || !ethers.isAddress(operator)) throw new Error('WRAP_OPERATOR must be an address (the minter key)')
  const min = BigInt(Math.round(parseFloat(process.env.WRAP_MIN_ZZEC ?? '0.001') * 1e8))
  console.log(`\nDeployer ${deployer.address}\nowner    ${deployer.address}\noperator ${operator}\nmin      ${Number(min) / 1e8} zZEC\n`)
  const desk = await (await ethers.getContractFactory('WrapDesk')).deploy(ZZEC, deployer.address, operator, min)
  await desk.waitForDeployment()
  console.log(`WrapDesk ${await desk.getAddress()}\n\nNext: WRAP_DESK=${await desk.getAddress()} ACTION=propose npm run zzec:minter  (commit after 48h), CONTRACTS.wrapDesk in src/config.ts, WRAP_DESK_ADDRESS in ops/.env, verify source.`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
