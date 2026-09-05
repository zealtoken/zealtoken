import { ethers } from 'hardhat'
/** ACTION=propose|commit|status WRAP_DESK=0x... npm run zzec:minter — rotate the ZZEC minter to the WrapDesk through the 48h timelock. */
async function main() {
  const ZZEC = process.env.ZZEC_ADDRESS ?? '0x0b151Ff7a7c5250130EC16C275790961d558E402'
  const action = process.env.ACTION ?? 'status'
  const [owner] = await ethers.getSigners()
  const z = await ethers.getContractAt('ZZEC', ZZEC, owner)
  const pend = await z.pendingMinter()
  console.log(`ZZEC ${ZZEC}\nminter  ${await z.minter()}\npending ${pend.account} eta ${pend.eta ? new Date(Number(pend.eta) * 1000).toISOString() : '-'}\n`)
  if (action === 'propose') {
    const desk = process.env.WRAP_DESK
    if (!desk || !ethers.isAddress(desk)) throw new Error('WRAP_DESK must be an address')
    const tx = await z.proposeMinter(desk); console.log(`proposeMinter(${desk}) ${tx.hash}`); await tx.wait()
    console.log(`commit after ${new Date((Math.floor(Date.now() / 1000) + 48 * 3600) * 1000).toISOString()} with ACTION=commit`)
  } else if (action === 'commit') {
    const tx = await z.commitMinter(); console.log(`commitMinter ${tx.hash}`); await tx.wait(); console.log(`minter now ${await z.minter()}`)
  }
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
