// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IV2FeeEscrow {
    function claim() external returns (uint256);
    function claimToken(address token) external returns (uint256);
}

interface IZealFoundry {
    function route(address token) external returns (uint256);
    function routeNative() external returns (uint256);
}

/// @dev Pons V2MemeHook. sweepPoolFees is callable by the fee-sweep operator or the pool's creator.
interface IV2MemeHook {
    function sweepPoolFees(bytes32 poolId, uint256 minConversionQuoteOut, uint256 minBuybackTokensOut) external;
}

/// @dev Pons V2 launch factory. Both are callable only by the current creator-fee recipient.
interface IPonsV2LaunchFactory {
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
    function setBuybackEnabled(address token, bool enabled) external;
}

/**
 * @title ZealTapV2
 * @notice The creator-fee recipient for $ZEAL on Pons V2, second edition.
 *
 * @dev When Pons points a token's creator fees at an address, the hook also
 *      records that address as the pool's `creator`. The creator may sweep the
 *      pool's pending fees itself and may move the recipient again without
 *      Pons. V1 could do neither, which would have left $ZEAL dependent on the
 *      Pons operator for every sweep and on the Pons owner for every change.
 *
 *      Money still has exactly one exit: the Foundry. There is no withdraw and
 *      no owner. A steward exists for one purpose, moving the recipient to a
 *      successor contract, and even that sits behind a 48-hour timelock so
 *      holders can see it coming.
 */
contract ZealTapV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MIGRATION_DELAY = 48 hours;

    IV2FeeEscrow public immutable escrow;
    IZealFoundry public immutable foundry;
    IV2MemeHook public immutable hook;
    IPonsV2LaunchFactory public immutable factory;
    address public immutable token;
    bytes32 public immutable poolId;
    address public immutable steward;

    uint256 public totalNativeForwarded;
    mapping(address token => uint256 amount) public totalTokenForwarded;

    address public pendingRecipient;
    uint256 public migrationReadyAt;

    event Pulled(address indexed caller, uint256 nativeAmount);
    event PulledToken(address indexed caller, address indexed token, uint256 amount);
    event Swept(address indexed caller);
    event MigrationProposed(address indexed newRecipient, uint256 readyAt);
    event MigrationCancelled(address indexed newRecipient);
    event Migrated(address indexed newRecipient);

    error ZeroAddress();
    error NothingToPull();
    error ForwardFailed();
    error NotSteward();
    error NoMigration();
    error MigrationNotReady(uint256 readyAt);

    modifier onlySteward() {
        if (msg.sender != steward) revert NotSteward();
        _;
    }

    constructor(
        IV2FeeEscrow escrow_,
        IZealFoundry foundry_,
        IV2MemeHook hook_,
        IPonsV2LaunchFactory factory_,
        address token_,
        bytes32 poolId_,
        address steward_
    ) {
        if (
            address(escrow_) == address(0) || address(foundry_) == address(0) || address(hook_) == address(0)
                || address(factory_) == address(0) || token_ == address(0) || steward_ == address(0)
        ) revert ZeroAddress();
        escrow = escrow_;
        foundry = foundry_;
        hook = hook_;
        factory = factory_;
        token = token_;
        poolId = poolId_;
        steward = steward_;
    }

    // ------------------------------------------------------------ money in

    /// @notice Sweep the pool's pending fees into the escrow, then pull them through. Callable by anyone.
    /// @dev Pending fees held in $ZEAL need the Pons operator's conversion; in that case the hook
    ///      reverts and the operator's own sweep will credit us instead. ETH-only pending sweeps fine.
    function sweep(uint256 minConversionQuoteOut, uint256 minBuybackTokensOut) external nonReentrant returns (uint256 forwarded) {
        hook.sweepPoolFees(poolId, minConversionQuoteOut, minBuybackTokensOut);
        emit Swept(msg.sender);
        forwarded = _pull();
    }

    /// @notice Claim what the escrow owes us and route it through the Foundry. Callable by anyone.
    function pull() external nonReentrant returns (uint256 forwarded) {
        forwarded = _pull();
    }

    function _pull() private returns (uint256 forwarded) {
        try escrow.claim() returns (uint256) {} catch {}
        forwarded = address(this).balance;
        if (forwarded == 0) revert NothingToPull();
        totalNativeForwarded += forwarded;
        emit Pulled(msg.sender, forwarded);
        (bool ok,) = payable(address(foundry)).call{value: forwarded}("");
        if (!ok) revert ForwardFailed();
        foundry.routeNative();
    }

    /// @notice Same for an ERC-20 quote asset.
    function pullToken(address quote) external nonReentrant returns (uint256 forwarded) {
        if (quote == address(0)) revert ZeroAddress();
        try escrow.claimToken(quote) returns (uint256) {} catch {}
        forwarded = IERC20(quote).balanceOf(address(this));
        if (forwarded == 0) revert NothingToPull();
        totalTokenForwarded[quote] += forwarded;
        emit PulledToken(msg.sender, quote, forwarded);
        IERC20(quote).safeTransfer(address(foundry), forwarded);
        foundry.route(quote);
    }

    // ------------------------------------------------------------ stewardship

    /// @notice Propose moving the Pons creator-fee recipient to a successor. Takes effect after 48h.
    function proposeMigration(address newRecipient) external onlySteward {
        if (newRecipient == address(0)) revert ZeroAddress();
        pendingRecipient = newRecipient;
        migrationReadyAt = block.timestamp + MIGRATION_DELAY;
        emit MigrationProposed(newRecipient, migrationReadyAt);
    }

    function cancelMigration() external onlySteward {
        address r = pendingRecipient;
        if (r == address(0)) revert NoMigration();
        delete pendingRecipient;
        delete migrationReadyAt;
        emit MigrationCancelled(r);
    }

    /// @notice Execute a matured migration. Callable by anyone once the delay has passed.
    function commitMigration() external nonReentrant {
        address r = pendingRecipient;
        if (r == address(0)) revert NoMigration();
        if (block.timestamp < migrationReadyAt) revert MigrationNotReady(migrationReadyAt);
        delete pendingRecipient;
        delete migrationReadyAt;
        factory.transferCreatorFeeRecipient(token, r);
        emit Migrated(r);
    }

    /// @notice Toggle the Pons buyback feature for $ZEAL. Spends only fees Pons would route to buybacks.
    function setBuybackEnabled(bool enabled) external onlySteward {
        factory.setBuybackEnabled(token, enabled);
    }

    /// @dev The escrow pays native ETH with a plain call; this must exist.
    receive() external payable {}
}
