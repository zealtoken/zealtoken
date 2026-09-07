import { ethers } from 'hardhat'
import { unlock } from './lib/secure'
/** ACTION=propose|commit|status WRAP_DESK=0x... npm run zzec:minter — rotate the ZZEC minter to the WrapDesk through the 48h timelock. */
async function main() {
  const ZZEC = process.env.ZZEC_ADDRESS ?? '0x0b151Ff7a7c5250130EC16C275790961d558E402'
  const action = process.env.ACTION ?? 'status'
  const z = await ethers.getContractAt('ZZEC', ZZEC)
  const pend = await z.pendingMinter()
  console.log(`ZZEC ${ZZEC}\nminter  ${await z.minter()}\npending ${pend.account} eta ${pend.eta ? new Date(Number(pend.eta) * 1000).toISOString() : '-'}\n`)
  if (action === 'propose') {
    const desk = process.env.WRAP_DESK
    if (!desk || !ethers.isAddress(desk)) throw new Error('WRAP_DESK must be an address')
    if ((await ethers.provider.getNetwork()).chainId !== 4663n) throw new Error('Expected Robinhood mainnet')
    if (await ethers.provider.getCode(desk) === '0x') throw new Error('Proposed desk has no deployed code')
    if (pend.account.toLowerCase() === desk.toLowerCase()) { console.log('This desk is already proposed; keep the existing timelock'); return }
    if (pend.account !== ethers.ZeroAddress) throw new Error('Another minter proposal exists; reconcile before replacing it')
    const owner = await unlock(ethers.provider)
    if (owner.address.toLowerCase() !== (await z.owner()).toLowerCase()) throw new Error('Keystore is not the token owner')
    const tx = await z.connect(owner).proposeMinter(desk); console.log(`proposeMinter(${desk}) ${tx.hash}`); await tx.wait()
    const proposed = await z.pendingMinter()
    console.log(`commit eligible after ${new Date(Number(proposed.eta) * 1000).toISOString()}; verify readiness before committing with WRAP_DESK=${desk} ACTION=commit`)
  } else if (action === 'commit') {
    const expected = process.env.WRAP_DESK ?? '0xb53E3CD58668D1fC9082b51a7d74879733e9E118'
    if ((await ethers.provider.getNetwork()).chainId !== 4663n) throw new Error('Expected Robinhood mainnet')
    if ((await z.minter()).toLowerCase() === expected.toLowerCase()) { console.log('Expected desk is already minter; no transaction needed'); return }
    if (pend.account.toLowerCase() !== expected.toLowerCase()) throw new Error('Pending minter differs from expected WrapDesk')
    const block = await ethers.provider.getBlock('latest')
    if (!block || BigInt(block.timestamp) < pend.eta) throw new Error('Minter timelock has not elapsed')
    if (await ethers.provider.getCode(expected) === '0x') throw new Error('Expected desk has no code')
    const owner = await unlock(ethers.provider)
    if (owner.address.toLowerCase() !== (await z.owner()).toLowerCase()) throw new Error('Keystore is not the token owner')
    const tx = await z.connect(owner).commitMinter(); console.log(`commitMinter ${tx.hash}`); await tx.wait(); console.log(`minter now ${await z.minter()}`)
  }
}
main().catch((e) => { console.error(e?.shortMessage ?? e?.message ?? e); process.exitCode = 1 })
