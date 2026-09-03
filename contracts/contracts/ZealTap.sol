// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev The subset of Pons V2FeeEscrow the Tap needs. Both pay `msg.sender`.
interface IV2FeeEscrow {
    function claim() external returns (uint256);
    function claimToken(address token) external returns (uint256);
}

/// @dev The Foundry's permissionless routing entry points.
interface IZealFoundry {
    function route(address token) external returns (uint256);
    function routeNative() external returns (uint256);
}

/**
 * @title ZealTap
 * @notice The creator-fee recipient for $ZEAL on Pons V2.
 *
 * @dev Pons V2 credits creator fees to a recipient inside V2FeeEscrow and only
 *      ever pays them to `msg.sender` on claim. A contract with no way to call
 *      the escrow can therefore never receive its own fees. The Foundry is
 *      exactly such a contract, by design, so it cannot be the recipient.
 *
 *      The Tap is the recipient instead. It has one job and one door: pull
 *      whatever the escrow owes it and hand it to the Foundry, where route()
 *      splits it. Like the Foundry it has no owner, no admin, no withdraw and
 *      no way to send value anywhere except the Foundry. pull() is
 *      permissionless, so nobody controls timing.
 */
contract ZealTap is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IV2FeeEscrow public immutable escrow;
    IZealFoundry public immutable foundry;

    uint256 public totalNativeForwarded;
    mapping(address token => uint256 amount) public totalTokenForwarded;

    event Pulled(address indexed caller, uint256 nativeAmount);
    event PulledToken(address indexed caller, address indexed token, uint256 amount);

    error ZeroAddress();
    error NothingToPull();
    error ForwardFailed();

    constructor(IV2FeeEscrow escrow_, IZealFoundry foundry_) {
        if (address(escrow_) == address(0) || address(foundry_) == address(0)) revert ZeroAddress();
        escrow = escrow_;
        foundry = foundry_;
    }

    /**
     * @notice Claim the Tap's native-ETH balance from the escrow, forward it to
     *         the Foundry, and route it. Callable by anyone.
     * @dev Also forwards any ETH already sitting here, so a direct send can
     *      never strand value.
     */
    function pull() external nonReentrant returns (uint256 forwarded) {
        // Escrow reverts with NoBalance when there is nothing; treat that as zero
        // so a stray direct send can still be forwarded.
        try escrow.claim() returns (uint256) {} catch {}

        forwarded = address(this).balance;
        if (forwarded == 0) revert NothingToPull();

        totalNativeForwarded += forwarded;
        emit Pulled(msg.sender, forwarded);

        (bool ok, ) = payable(address(foundry)).call{value: forwarded}("");
        if (!ok) revert ForwardFailed();
        foundry.routeNative();
    }

    /**
     * @notice Same for an ERC-20 quote asset (a WETH-paired launch, for example).
     */
    function pullToken(address token) external nonReentrant returns (uint256 forwarded) {
        if (token == address(0)) revert ZeroAddress();
        try escrow.claimToken(token) returns (uint256) {} catch {}

        forwarded = IERC20(token).balanceOf(address(this));
        if (forwarded == 0) revert NothingToPull();

        totalTokenForwarded[token] += forwarded;
        emit PulledToken(msg.sender, token, forwarded);

        IERC20(token).safeTransfer(address(foundry), forwarded);
        foundry.route(token);
    }

    /// @dev The escrow pays native ETH with a plain call; this must exist.
    receive() external payable {}
}
