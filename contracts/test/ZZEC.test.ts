import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'

const T_ADDRESS = 't1ZealReserveExampleAddressReplaceMe'
const HOURS_36 = 36 * 60 * 60
const ONE_ZEC = 100_000_000n // 8 decimals, one ZEC = 1e8 zatoshi
const PROOF = ethers.id('block-hash-placeholder')

describe('ZZEC', () => {
  async function deploy() {
    const [owner, attestor, minter, alice, stranger] = await ethers.getSigners()
    const ZZEC = await ethers.getContractFactory('ZZEC')
    const zzec = await ZZEC.deploy(
      T_ADDRESS,
      owner.address,
      attestor.address,
      minter.address,
      HOURS_36,
    )
    return { zzec, owner, attestor, minter, alice, stranger }
  }

  async function deployAttested() {
    const ctx = await loadFixture(deploy)
    await ctx.zzec.connect(ctx.attestor).attest(ONE_ZEC * 100n, PROOF)
    return ctx
  }

  describe('shape', () => {
    it('uses 8 decimals so the peg is a literal 1:1 integer', async () => {
      const { zzec } = await loadFixture(deploy)
      expect(await zzec.decimals()).to.equal(8)
      expect(await zzec.symbol()).to.equal('zZEC')
    })

    it('publishes the reserve address on-chain with no setter', async () => {
      const { zzec } = await loadFixture(deploy)
      expect(await zzec.reserveAddress()).to.equal(T_ADDRESS)

      const fns = zzec.interface.fragments
        .filter((f) => f.type === 'function')
        .map((f) => (f as unknown as { name: string }).name)
      expect(fns).to.not.include('setReserveAddress')
    })

    it('refuses to deploy without a reserve address', async () => {
      const [owner, attestor, minter] = await ethers.getSigners()
      const ZZEC = await ethers.getContractFactory('ZZEC')
      await expect(
        ZZEC.deploy('', owner.address, attestor.address, minter.address, HOURS_36),
      ).to.be.revertedWithCustomError(ZZEC, 'EmptyReserveAddress')
    })

    it('refuses an attestation window outside the allowed bounds', async () => {
      const [owner, attestor, minter] = await ethers.getSigners()
      const ZZEC = await ethers.getContractFactory('ZZEC')
      await expect(
        ZZEC.deploy(T_ADDRESS, owner.address, attestor.address, minter.address, 60),
      ).to.be.revertedWithCustomError(ZZEC, 'BadAttestationAge')
      await expect(
        ZZEC.deploy(T_ADDRESS, owner.address, attestor.address, minter.address, 8 * 24 * 3600),
      ).to.be.revertedWithCustomError(ZZEC, 'BadAttestationAge')
    })
  })

  describe('the coverage guarantee', () => {
    it('mints up to exactly the attested reserve', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 100n)
      expect(await zzec.totalSupply()).to.equal(ONE_ZEC * 100n)
      expect(await zzec.coverageBps()).to.equal(10_000n)
    })

    it('reverts on the wei that would break the peg', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 100n)
      await expect(
        zzec.connect(minter).mint(alice.address, 1n),
      ).to.be.revertedWithCustomError(zzec, 'WouldExceedReserve')
    })

    it('reverts across several mints that would cumulatively over-issue', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 60n)
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 30n)
      await expect(
        zzec.connect(minter).mint(alice.address, ONE_ZEC * 11n),
      ).to.be.revertedWithCustomError(zzec, 'WouldExceedReserve')
      await expect(zzec.connect(minter).mint(alice.address, ONE_ZEC * 10n)).to.not.be.reverted
    })

    it('cannot mint against a stale attestation', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await time.increase(HOURS_36 + 1)
      expect(await zzec.attestationIsFresh()).to.equal(false)
      await expect(
        zzec.connect(minter).mint(alice.address, ONE_ZEC),
      ).to.be.revertedWithCustomError(zzec, 'StaleAttestation')
    })

    it('cannot mint before any attestation exists', async () => {
      const { zzec, minter, alice } = await loadFixture(deploy)
      await expect(
        zzec.connect(minter).mint(alice.address, ONE_ZEC),
      ).to.be.revertedWithCustomError(zzec, 'StaleAttestation')
    })

    it('separates attestor and minter, so one key cannot inflate and mint', async () => {
      const { zzec, attestor, minter, alice, stranger } = await deployAttested()
      await expect(
        zzec.connect(attestor).mint(alice.address, ONE_ZEC),
      ).to.be.revertedWithCustomError(zzec, 'NotMinter')
      await expect(
        zzec.connect(minter).attest(ONE_ZEC * 10_000n, PROOF),
      ).to.be.revertedWithCustomError(zzec, 'NotAttestor')
      await expect(
        zzec.connect(stranger).mint(alice.address, ONE_ZEC),
      ).to.be.revertedWithCustomError(zzec, 'NotMinter')
    })
  })

  describe('attestation', () => {
    it('records the reading and the supply it was checked against', async () => {
      const { zzec, attestor } = await loadFixture(deploy)
      await expect(zzec.connect(attestor).attest(ONE_ZEC * 42n, PROOF))
        .to.emit(zzec, 'Attested')
        .withArgs(ONE_ZEC * 42n, 0n, PROOF, await time.latest().then((t) => t + 1))
      expect(await zzec.reserveZats()).to.equal(ONE_ZEC * 42n)
    })

    it('reports a shortfall loudly instead of refusing to record it', async () => {
      const { zzec, attestor, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 100n)

      // The reserve is reported lower than outstanding supply. Honest reporting
      // of a bad state must always be possible.
      await expect(zzec.connect(attestor).attest(ONE_ZEC * 90n, PROOF))
        .to.emit(zzec, 'CoverageBreach')
        .withArgs(ONE_ZEC * 90n, ONE_ZEC * 100n)

      expect(await zzec.coverageBps()).to.equal(9_000n)
      // ...and further minting is now impossible until the reserve recovers.
      await expect(
        zzec.connect(minter).mint(alice.address, 1n),
      ).to.be.revertedWithCustomError(zzec, 'WouldExceedReserve')
    })

    it('reports full coverage when nothing is outstanding', async () => {
      const { zzec } = await deployAttested()
      expect(await zzec.coverageBps()).to.equal(ethers.MaxUint256)
    })
  })

  describe('redemption', () => {
    it('burns and emits a request an operator can fulfil', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 10n)

      await expect(zzec.connect(alice).requestRedeem(ONE_ZEC * 4n, 't1AliceAddress'))
        .to.emit(zzec, 'RedemptionRequested')
        .withArgs(1n, alice.address, ONE_ZEC * 4n, 't1AliceAddress')

      expect(await zzec.balanceOf(alice.address)).to.equal(ONE_ZEC * 6n)
      expect(await zzec.totalSupply()).to.equal(ONE_ZEC * 6n)
    })

    it('still works while minting is paused — the exit is never closed', async () => {
      const { zzec, owner, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 10n)
      await zzec.connect(owner).setMintingPaused(true)

      await expect(
        zzec.connect(minter).mint(alice.address, ONE_ZEC),
      ).to.be.revertedWithCustomError(zzec, 'MintingIsPaused')
      await expect(zzec.connect(alice).requestRedeem(ONE_ZEC, 't1AliceAddress')).to.not.be.reverted
    })

    it('still works when the attestation has gone stale', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 10n)
      await time.increase(HOURS_36 * 10)

      await expect(zzec.connect(alice).requestRedeem(ONE_ZEC, 't1AliceAddress')).to.not.be.reverted
    })

    it('rejects an empty destination address', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC)
      await expect(
        zzec.connect(alice).requestRedeem(ONE_ZEC, ''),
      ).to.be.revertedWithCustomError(zzec, 'EmptyZcashAddress')
    })

    it('frees headroom so redeemed supply can be re-minted', async () => {
      const { zzec, minter, alice } = await deployAttested()
      await zzec.connect(minter).mint(alice.address, ONE_ZEC * 100n)
      await zzec.connect(alice).requestRedeem(ONE_ZEC * 40n, 't1AliceAddress')
      await expect(zzec.connect(minter).mint(alice.address, ONE_ZEC * 40n)).to.not.be.reverted
    })
  })

  describe('admin', () => {
    it('gates every setter behind the owner', async () => {
      const { zzec, stranger } = await loadFixture(deploy)
      for (const call of [
        zzec.connect(stranger).proposeAttestor(stranger.address),
        zzec.connect(stranger).proposeMinter(stranger.address),
        zzec.connect(stranger).commitMinter(),
        zzec.connect(stranger).cancelRoleProposal(true),
        zzec.connect(stranger).setMintingPaused(true),
        zzec.connect(stranger).setMaxAttestationAge(3600),
      ]) {
        await expect(call).to.be.revertedWithCustomError(zzec, 'OwnableUnauthorizedAccount')
      }
    })

    it('will not install a new minter before the timelock elapses', async () => {
      const { zzec, owner, stranger, minter } = await loadFixture(deploy)
      await zzec.connect(owner).proposeMinter(stranger.address)

      await expect(zzec.connect(owner).commitMinter()).to.be.revertedWithCustomError(
        zzec,
        'TimelockNotElapsed',
      )
      expect(await zzec.minter()).to.equal(minter.address)

      await time.increase(48 * 3600)
      await zzec.connect(owner).commitMinter()
      expect(await zzec.minter()).to.equal(stranger.address)
    })

    it('cannot commit a role that was never proposed, or was cancelled', async () => {
      const { zzec, owner, stranger } = await loadFixture(deploy)
      await expect(zzec.connect(owner).commitMinter()).to.be.revertedWithCustomError(
        zzec,
        'NoPendingRole',
      )

      await zzec.connect(owner).proposeAttestor(stranger.address)
      await zzec.connect(owner).cancelRoleProposal(false)
      await time.increase(48 * 3600)
      await expect(zzec.connect(owner).commitAttestor()).to.be.revertedWithCustomError(
        zzec,
        'NoPendingRole',
      )
    })

    it('lets the owner pause minting instantly, so the timelock is survivable', async () => {
      const { zzec, owner, attestor, minter, alice } = await deployAttested()

      // The scenario the timelock is designed around: the attestor key is
      // compromised and reports a wildly inflated reserve.
      await zzec.connect(attestor).attest(ONE_ZEC * 1_000_000n, PROOF)

      // The brake is not timelocked, so the abuse window closes immediately...
      await zzec.connect(owner).setMintingPaused(true)
      await expect(
        zzec.connect(minter).mint(alice.address, ONE_ZEC * 500_000n),
      ).to.be.revertedWithCustomError(zzec, 'MintingIsPaused')

      // ...while rotating the compromised key still takes the full 48 hours.
      await zzec.connect(owner).proposeAttestor(alice.address)
      await expect(zzec.connect(owner).commitAttestor()).to.be.revertedWithCustomError(
        zzec,
        'TimelockNotElapsed',
      )
    })

    it('will not let the attestation window be widened into meaninglessness', async () => {
      const { zzec, owner } = await loadFixture(deploy)
      await expect(
        zzec.connect(owner).setMaxAttestationAge(30 * 24 * 3600),
      ).to.be.revertedWithCustomError(zzec, 'BadAttestationAge')
      await expect(zzec.connect(owner).setMaxAttestationAge(60)).to.be.revertedWithCustomError(
        zzec,
        'BadAttestationAge',
      )
      await expect(zzec.connect(owner).setMaxAttestationAge(24 * 3600)).to.not.be.reverted
    })

    it('requires a two-step ownership handover', async () => {
      const { zzec, owner, stranger } = await loadFixture(deploy)
      await zzec.connect(owner).transferOwnership(stranger.address)
      expect(await zzec.owner()).to.equal(owner.address) // not yet
      await zzec.connect(stranger).acceptOwnership()
      expect(await zzec.owner()).to.equal(stranger.address)
    })
  })
})
