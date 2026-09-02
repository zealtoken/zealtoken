// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ZealFoundry
 * @notice Receives the $ZEAL creator-fee stream from the Pons locker and splits
 *         it on a fixed, immutable schedule.
 *
 * @dev Design constraints, in priority order:
 *
 *      1. There is no owner, no admin, no pause, no upgrade path and no rescue
 *         function. Once deployed, the only thing this contract can do is move
 *         value to three addresses in one ratio. That is the entire point: the
 *         website claims the split is enforced by code rather than by promise,
 *         and this is what has to be true for that claim to hold.
 *
 *      2. Sinks and basis points are immutable. A compromised key cannot
 *         redirect the reserve share to operations, because nothing on this
 *         contract can change where the reserve share goes.
 *
 *      3. route() is permissionless. Nobody has discretion over *when* funds
 *         move, only the sinks decide what happens after. Anyone — a holder, a
 *         bot, a watcher — can push the queue forward.
 *
 *      Fees arrive as plain ERC-20 transfers (WETH and $ZEAL from the locked
 *      LP position), which trigger no callback, so accounting is pull-based:
 *      route() reads the current balance and splits whatever it finds.
 */
contract ZealFoundry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Share swapped to native ZEC and moved into the reserve.
    uint256 public immutable reserveBps;
    /// @notice Share paired into zZEC liquidity on Robinhood Chain.
    uint256 public immutable liquidityBps;
    /// @notice Share covering audits, attestation and infrastructure.
    uint256 public immutable opsBps;

    /// @notice The only address the reserve share can ever reach.
    address public immutable reserveSink;
    address public immutable liquiditySink;
    address public immutable opsSink;

    /// @notice Lifetime totals, per token, for public accounting.
    mapping(address token => uint256 amount) public totalRouted;
    mapping(address token => uint256 amount) public totalToReserve;

    uint256 public totalRoutedNative;
    uint256 public totalToReserveNative;

    event Routed(
        address indexed token,
        address indexed caller,
        uint256 amount,
        uint256 toReserve,
        uint256 toLiquidity,
        uint256 toOps
    );

    event RoutedNative(
        address indexed caller,
        uint256 amount,
        uint256 toReserve,
        uint256 toLiquidity,
        uint256 toOps
    );

    error BadSplit();
    error ZeroAddress();
    error NothingToRoute();
    error NativeTransferFailed(address to);

    constructor(
        uint256 reserveBps_,
        uint256 liquidityBps_,
        uint256 opsBps_,
        address reserveSink_,
        address liquiditySink_,
        address opsSink_
    ) {
        if (reserveBps_ + liquidityBps_ + opsBps_ != BPS_DENOMINATOR) revert BadSplit();
        // A zero reserve share would make the contract pointless and is almost
        // certainly a deployment mistake rather than an intent.
        if (reserveBps_ == 0) revert BadSplit();
        if (reserveSink_ == address(0) || liquiditySink_ == address(0) || opsSink_ == address(0)) {
            revert ZeroAddress();
        }

        reserveBps = reserveBps_;
        liquidityBps = liquidityBps_;
        opsBps = opsBps_;

        reserveSink = reserveSink_;
        liquiditySink = liquiditySink_;
        opsSink = opsSink_;
    }

    /**
     * @notice Split this contract's entire balance of `token` across the three
     *         sinks. Callable by anyone.
     * @dev The reserve takes the rounding remainder rather than operations, so
     *      dust can only ever accumulate in favour of the reserve.
     */
    function route(address token) external nonReentrant returns (uint256 amount) {
        if (token == address(0)) revert ZeroAddress();

        amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert NothingToRoute();

        uint256 toLiquidity = (amount * liquidityBps) / BPS_DENOMINATOR;
        uint256 toOps = (amount * opsBps) / BPS_DENOMINATOR;
        uint256 toReserve = amount - toLiquidity - toOps;

        totalRouted[token] += amount;
        totalToReserve[token] += toReserve;

        emit Routed(token, msg.sender, amount, toReserve, toLiquidity, toOps);

        IERC20(token).safeTransfer(reserveSink, toReserve);
        if (toLiquidity > 0) IERC20(token).safeTransfer(liquiditySink, toLiquidity);
        if (toOps > 0) IERC20(token).safeTransfer(opsSink, toOps);
    }

    /**
     * @notice Same split, for native ETH that lands here (gas refunds, direct
     *         sends, or a locker that pays in the chain's native asset).
     */
    function routeNative() external nonReentrant returns (uint256 amount) {
        amount = address(this).balance;
        if (amount == 0) revert NothingToRoute();

        uint256 toLiquidity = (amount * liquidityBps) / BPS_DENOMINATOR;
        uint256 toOps = (amount * opsBps) / BPS_DENOMINATOR;
        uint256 toReserve = amount - toLiquidity - toOps;

        totalRoutedNative += amount;
        totalToReserveNative += toReserve;

        emit RoutedNative(msg.sender, amount, toReserve, toLiquidity, toOps);

        _sendNative(reserveSink, toReserve);
        if (toLiquidity > 0) _sendNative(liquiditySink, toLiquidity);
        if (toOps > 0) _sendNative(opsSink, toOps);
    }

    /// @notice Preview the split for an arbitrary amount, for UIs and auditors.
    function previewSplit(uint256 amount)
        external
        view
        returns (uint256 toReserve, uint256 toLiquidity, uint256 toOps)
    {
        toLiquidity = (amount * liquidityBps) / BPS_DENOMINATOR;
        toOps = (amount * opsBps) / BPS_DENOMINATOR;
        toReserve = amount - toLiquidity - toOps;
    }

    function _sendNative(address to, uint256 value) private {
        (bool ok, ) = payable(to).call{value: value}("");
        if (!ok) revert NativeTransferFailed(to);
    }

    receive() external payable {}
}
