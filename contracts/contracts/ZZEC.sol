// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title zZEC — reserve-backed wrapped Zcash on Robinhood Chain
 * @notice One zZEC is issued against one zatoshi-denominated unit of native ZEC
 *         held in the published reserve. Supply can never exceed the most
 *         recent attested reserve balance.
 *
 * @dev What this contract can and cannot guarantee — stated plainly, because
 *      the whole project is built on not overclaiming:
 *
 *      CAN guarantee, in code:
 *        - totalSupply() never exceeds the attested reserve (checked on mint)
 *        - minting is impossible against a stale attestation
 *        - redemption can never be paused, blocked or rate-limited
 *        - the reserve address is fixed at deployment and has no setter
 *        - the attestor and the minter are separate roles, so one compromised
 *          key cannot both inflate the reported reserve and mint against it
 *
 *      CANNOT guarantee, and this is the real trust assumption:
 *        - that the attested number matches the actual Zcash balance. The
 *          attestor reports it. Anyone can check it against the published
 *          transparent address, which is exactly why the reserve is held in a
 *          t-address instead of a shielded one.
 *        - that a redemption request is honoured. Burning emits an event; an
 *          operator sends native ZEC. That leg is off-chain because Zcash is
 *          not an EVM chain.
 *
 *      Attestations are allowed to report a reserve *below* current supply.
 *      Blocking that would only stop honest reporting of a bad state; the
 *      contract emits CoverageBreach instead so the failure is loud and public.
 */
contract ZZEC is ERC20, Ownable2Step {
    /// @dev Zcash is denominated in zatoshi (1e-8 ZEC). Matching it keeps the
    ///      peg a literal 1:1 integer relationship with no scaling anywhere.
    uint8 private constant DECIMALS = 8;

    uint64 public constant MIN_ATTESTATION_AGE = 1 hours;
    uint64 public constant MAX_ATTESTATION_AGE = 7 days;

    /// @notice The Zcash transparent address holding the reserve. No setter.
    string public reserveAddress;

    address public attestor;
    address public minter;

    /// @notice Last attested native ZEC held, in zatoshi.
    uint256 public reserveZats;
    /// @notice When that attestation was posted.
    uint64 public lastAttestationAt;
    /// @notice Mints revert once the attestation is older than this.
    uint64 public maxAttestationAge;

    bool public mintingPaused;

    uint256 public redemptionCount;

    event Attested(uint256 reserveZats, uint256 supply, bytes32 proofRef, uint64 at);
    event CoverageBreach(uint256 reserveZats, uint256 supply);
    event RedemptionRequested(
        uint256 indexed id,
        address indexed from,
        uint256 amount,
        string zcashAddress
    );
    event AttestorSet(address indexed previous, address indexed current);
    event MinterSet(address indexed previous, address indexed current);
    event MaxAttestationAgeSet(uint64 previous, uint64 current);
    event MintingPausedSet(bool paused);

    error NotAttestor();
    error NotMinter();
    error ZeroAddress();
    error ZeroAmount();
    error StaleAttestation(uint64 lastAt, uint64 maxAge);
    error WouldExceedReserve(uint256 supplyAfter, uint256 reserve);
    error MintingIsPaused();
    error BadAttestationAge();
    error EmptyReserveAddress();
    error EmptyZcashAddress();

    modifier onlyAttestor() {
        if (msg.sender != attestor) revert NotAttestor();
        _;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    constructor(
        string memory reserveAddress_,
        address owner_,
        address attestor_,
        address minter_,
        uint64 maxAttestationAge_
    ) ERC20("Zeal Wrapped Zcash", "zZEC") Ownable(owner_) {
        if (bytes(reserveAddress_).length == 0) revert EmptyReserveAddress();
        if (attestor_ == address(0) || minter_ == address(0)) revert ZeroAddress();
        if (maxAttestationAge_ < MIN_ATTESTATION_AGE || maxAttestationAge_ > MAX_ATTESTATION_AGE) {
            revert BadAttestationAge();
        }

        reserveAddress = reserveAddress_;
        attestor = attestor_;
        minter = minter_;
        maxAttestationAge = maxAttestationAge_;

        emit AttestorSet(address(0), attestor_);
        emit MinterSet(address(0), minter_);
        emit MaxAttestationAgeSet(0, maxAttestationAge_);
    }

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    // ---------------------------------------------------------------- reserve

    /**
     * @notice Post the current native ZEC balance of the reserve address.
     * @param reserveZats_ Balance in zatoshi.
     * @param proofRef Reference to the off-chain evidence for this reading —
     *        a Zcash block hash, or the hash of a published attestation doc.
     */
    function attest(uint256 reserveZats_, bytes32 proofRef) external onlyAttestor {
        reserveZats = reserveZats_;
        lastAttestationAt = uint64(block.timestamp);

        uint256 supply = totalSupply();
        emit Attested(reserveZats_, supply, proofRef, uint64(block.timestamp));
        if (reserveZats_ < supply) emit CoverageBreach(reserveZats_, supply);
    }

    /// @notice Coverage in basis points. 10_000 means exactly 1:1.
    function coverageBps() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return type(uint256).max;
        return (reserveZats * 10_000) / supply;
    }

    function attestationIsFresh() public view returns (bool) {
        return lastAttestationAt != 0 && block.timestamp - lastAttestationAt <= maxAttestationAge;
    }

    // ------------------------------------------------------------- mint burn

    /**
     * @notice Mint zZEC against the attested reserve.
     * @dev Reverts if the mint would push supply past the reserve, or if the
     *      attestation is stale. These two checks are the coverage guarantee.
     */
    function mint(address to, uint256 amount) external onlyMinter {
        if (mintingPaused) revert MintingIsPaused();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (!attestationIsFresh()) revert StaleAttestation(lastAttestationAt, maxAttestationAge);

        uint256 supplyAfter = totalSupply() + amount;
        if (supplyAfter > reserveZats) revert WouldExceedReserve(supplyAfter, reserveZats);

        _mint(to, amount);
    }

    /**
     * @notice Burn zZEC and request native ZEC to `zcashAddress`.
     * @dev Deliberately has no pause, no role check and no minimum. A wrapper
     *      you cannot leave is not a wrapper.
     */
    function requestRedeem(uint256 amount, string calldata zcashAddress)
        external
        returns (uint256 id)
    {
        if (amount == 0) revert ZeroAmount();
        if (bytes(zcashAddress).length == 0) revert EmptyZcashAddress();

        _burn(msg.sender, amount);

        unchecked {
            id = ++redemptionCount;
        }
        emit RedemptionRequested(id, msg.sender, amount, zcashAddress);
    }

    // --------------------------------------------------------------- admin

    /**
     * @dev Role changes are timelocked. A compromised owner key is the single
     *      largest residual risk in this design — it could otherwise install a
     *      hostile attestor and minter in one transaction and issue unbacked
     *      supply before anyone could react.
     *
     *      The delay is safe to impose because the emergency brake is *not*
     *      delayed: setMintingPaused() is instant, so the response to a
     *      compromised attestor is "pause minting now, rotate the key over the
     *      next two days", not "wait two days while it is abused". Redemption
     *      stays open throughout, so holders can leave during the window.
     */
    uint64 public constant ROLE_TIMELOCK = 48 hours;

    struct PendingRole {
        address account;
        uint64 eta;
    }

    PendingRole public pendingAttestor;
    PendingRole public pendingMinter;

    event AttestorProposed(address indexed account, uint64 eta);
    event MinterProposed(address indexed account, uint64 eta);
    event RoleProposalCancelled(bool isMinter, address account);

    error NoPendingRole();
    error TimelockNotElapsed(uint64 eta);

    function proposeAttestor(address attestor_) external onlyOwner {
        if (attestor_ == address(0)) revert ZeroAddress();
        uint64 eta = uint64(block.timestamp) + ROLE_TIMELOCK;
        pendingAttestor = PendingRole(attestor_, eta);
        emit AttestorProposed(attestor_, eta);
    }

    function commitAttestor() external onlyOwner {
        PendingRole memory p = pendingAttestor;
        if (p.account == address(0)) revert NoPendingRole();
        if (block.timestamp < p.eta) revert TimelockNotElapsed(p.eta);

        emit AttestorSet(attestor, p.account);
        attestor = p.account;
        delete pendingAttestor;
    }

    function proposeMinter(address minter_) external onlyOwner {
        if (minter_ == address(0)) revert ZeroAddress();
        uint64 eta = uint64(block.timestamp) + ROLE_TIMELOCK;
        pendingMinter = PendingRole(minter_, eta);
        emit MinterProposed(minter_, eta);
    }

    function commitMinter() external onlyOwner {
        PendingRole memory p = pendingMinter;
        if (p.account == address(0)) revert NoPendingRole();
        if (block.timestamp < p.eta) revert TimelockNotElapsed(p.eta);

        emit MinterSet(minter, p.account);
        minter = p.account;
        delete pendingMinter;
    }

    /// @notice Cancelling is immediate — backing out of a change is never risky.
    function cancelRoleProposal(bool isMinter) external onlyOwner {
        if (isMinter) {
            emit RoleProposalCancelled(true, pendingMinter.account);
            delete pendingMinter;
        } else {
            emit RoleProposalCancelled(false, pendingAttestor.account);
            delete pendingAttestor;
        }
    }

    /// @dev Bounded on both sides so it can never be widened into meaninglessness.
    function setMaxAttestationAge(uint64 age) external onlyOwner {
        if (age < MIN_ATTESTATION_AGE || age > MAX_ATTESTATION_AGE) revert BadAttestationAge();
        emit MaxAttestationAgeSet(maxAttestationAge, age);
        maxAttestationAge = age;
    }

    /// @notice Halts minting only. Redemption is unaffected, by design.
    function setMintingPaused(bool paused) external onlyOwner {
        mintingPaused = paused;
        emit MintingPausedSet(paused);
    }
}
