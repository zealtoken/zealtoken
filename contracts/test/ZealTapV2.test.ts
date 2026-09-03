import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const POOL = ethers.keccak256(ethers.toUtf8Bytes('zeal-pool'))

describe('ZealTapV2', () => {
  async function deploy() {
    const [deployer, reserve, liquidity, ops, steward, operator, stranger] = await ethers.getSigners()
    const foundry = await (await ethers.getContractFactory('ZealFoundry')).deploy(6_000n, 2_500n, 1_500n, reserve.address, liquidity.address, ops.address)
    const escrow = await (await ethers.getContractFactory('MockV2FeeEscrow')).deploy()
    const hook = await (await ethers.getContractFactory('MockMemeHook')).deploy(await escrow.getAddress(), operator.address)
    const factory = await (await ethers.getContractFactory('MockPonsFactory')).deploy(await hook.getAddress())
    const token = await (await ethers.getContractFactory('MockERC20')).deploy('Zeal', 'ZEAL', 18)
    const tap = await (await ethers.getContractFactory('ZealTapV2')).deploy(
      await escrow.getAddress(), await foundry.getAddress(), await hook.getAddress(), await factory.getAddress(),
      await token.getAddress(), POOL, steward.address,
    )
    const a = { tap: await tap.getAddress(), foundry: await foundry.getAddress(), token: await token.getAddress() }
    // Pons has pointed the recipient at the Tap (what the timelocked change does)
    await factory.register(a.token, POOL, a.tap)
    return { tap, escrow, hook, factory, foundry, token, deployer, reserve, liquidity, ops, steward, operator, stranger, a }
  }

  it('has no owner, no withdraw: only pull, sweep, and a timelocked migration', async () => {
    const { tap } = await loadFixture(deploy)
    const fns = tap.interface.fragments.filter((f) => f.type === 'function').map((f) => (f as unknown as { name: string }).name).sort()
    expect(fns).to.deep.equal([
      'MIGRATION_DELAY', 'cancelMigration', 'commitMigration', 'escrow', 'factory', 'foundry', 'hook', 'migrationReadyAt',
      'pendingRecipient', 'poolId', 'proposeMigration', 'pull', 'pullToken', 'setBuybackEnabled', 'steward', 'sweep', 'token',
      'totalNativeForwarded', 'totalTokenForwarded',
    ])
  })

  it('sweeps the pool as its creator and routes the result through the Foundry, permissionlessly', async () => {
    const { tap, hook, stranger, reserve, liquidity, ops, a } = await loadFixture(deploy)
    const fee = ethers.parseEther('1')
    await hook.accrue(POOL, { value: fee })
    const before = await Promise.all([reserve, liquidity, ops].map((s) => ethers.provider.getBalance(s.address)))
    await expect(tap.connect(stranger).sweep(0, 0)).to.emit(tap, 'Swept').withArgs(stranger.address).and.to.emit(tap, 'Pulled').withArgs(stranger.address, fee)
    const after = await Promise.all([reserve, liquidity, ops].map((s) => ethers.provider.getBalance(s.address)))
    expect(after[0] - before[0]).to.equal((fee * 6_000n) / 10_000n)
    expect(after[1] - before[1]).to.equal((fee * 2_500n) / 10_000n)
    expect(after[2] - before[2]).to.equal((fee * 1_500n) / 10_000n)
    expect(await ethers.provider.getBalance(a.tap)).to.equal(0n)
    expect(await ethers.provider.getBalance(a.foundry)).to.equal(0n)
    expect(await tap.totalNativeForwarded()).to.equal(fee)
  })

  it('cannot sweep a pool it is not the creator of', async () => {
    const { tap, hook, factory, stranger, a } = await loadFixture(deploy)
    await factory.register(a.token, POOL, stranger.address) // someone else is the recipient
    await hook.accrue(POOL, { value: 1n })
    await expect(tap.sweep(0, 0)).to.be.revertedWithCustomError(hook, 'NotFeeSweepOperator')
  })

  it('pull() still works when the operator swept for us', async () => {
    const { tap, hook, operator, stranger, reserve } = await loadFixture(deploy)
    const fee = ethers.parseEther('0.4')
    await hook.accrue(POOL, { value: fee })
    await hook.connect(operator).sweepPoolFees(POOL, 0, 0)
    const before = await ethers.provider.getBalance(reserve.address)
    await tap.connect(stranger).pull()
    expect((await ethers.provider.getBalance(reserve.address)) - before).to.equal((fee * 6_000n) / 10_000n)
  })

  it('reverts when there is nothing anywhere', async () => {
    const { tap } = await loadFixture(deploy)
    await expect(tap.pull()).to.be.revertedWithCustomError(tap, 'NothingToPull')
  })

  it('migration: steward only, 48h delay, anyone commits, recipient moves at Pons', async () => {
    const { tap, factory, hook, steward, stranger, a } = await loadFixture(deploy)
    const successor = ethers.Wallet.createRandom().address
    await expect(tap.connect(stranger).proposeMigration(successor)).to.be.revertedWithCustomError(tap, 'NotSteward')
    await expect(tap.commitMigration()).to.be.revertedWithCustomError(tap, 'NoMigration')
    await expect(tap.connect(steward).proposeMigration(successor)).to.emit(tap, 'MigrationProposed')
    await expect(tap.commitMigration()).to.be.revertedWithCustomError(tap, 'MigrationNotReady')
    await time.increase(48 * 3600 - 10)
    await expect(tap.commitMigration()).to.be.revertedWithCustomError(tap, 'MigrationNotReady')
    await time.increase(20)
    await expect(tap.connect(stranger).commitMigration()).to.emit(tap, 'Migrated').withArgs(successor)
    expect(await factory.creatorFeeRecipient(a.token)).to.equal(successor)
    expect(await hook.creator(POOL)).to.equal(successor)
    expect(await tap.pendingRecipient()).to.equal(ethers.ZeroAddress)
  })

  it('migration can be cancelled by the steward and never by anyone else', async () => {
    const { tap, steward, stranger } = await loadFixture(deploy)
    await tap.connect(steward).proposeMigration(stranger.address)
    await expect(tap.connect(stranger).cancelMigration()).to.be.revertedWithCustomError(tap, 'NotSteward')
    await expect(tap.connect(steward).cancelMigration()).to.emit(tap, 'MigrationCancelled')
    await expect(tap.commitMigration()).to.be.revertedWithCustomError(tap, 'NoMigration')
  })

  it('steward can toggle Pons buyback; strangers cannot', async () => {
    const { tap, factory, steward, stranger, a } = await loadFixture(deploy)
    await expect(tap.connect(stranger).setBuybackEnabled(true)).to.be.revertedWithCustomError(tap, 'NotSteward')
    await tap.connect(steward).setBuybackEnabled(true)
    expect(await factory.buybackEnabled(a.token)).to.equal(true)
  })

  it('forwards ETH sent directly to it', async () => {
    const { tap, deployer, reserve, a } = await loadFixture(deploy)
    await deployer.sendTransaction({ to: a.tap, value: ethers.parseEther('0.5') })
    const before = await ethers.provider.getBalance(reserve.address)
    await tap.pull()
    expect((await ethers.provider.getBalance(reserve.address)) - before).to.equal(ethers.parseEther('0.3'))
  })
})
