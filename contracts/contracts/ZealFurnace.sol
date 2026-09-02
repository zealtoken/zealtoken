// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @dev Uniswap V3 SwapRouter surface. Deploy against a router with this ABI.
interface ISwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title ZealFurnace
 * @notice Turns zZEC trading fees into burned $ZEAL.
 *
 * @dev The one property everything else hangs on: THIS CONTRACT HAS ONE DOOR.
 *
 *      Fee tokens come in. The only outbound transfer the contract is capable of
 *      making is $ZEAL to the burn address. There is no withdraw, no rescue, no
 *      sweep, no owner path to the balance, and no function that can send any
 *      token to any other destination. Read the ABI: the test suite pins it.
 *
 *      Two roles, deliberately unequal:
 *
 *        ignite()  turns fee tokens into $ZEAL via a swap. Swapping needs a
 *                  price-aware caller (a minimum output, a sane path), so this is
 *                  gated to an igniter. A bad igniter can get a bad fill; it cannot
 *                  get the tokens. Rotation is timelocked like zZEC's roles.
 *
 *        burn()    sends every $ZEAL the Furnace holds to 0x…dEaD. Needs no
 *                  judgement, so it is permissionless. Anyone can pull the lever.
 *
 *      The swap path is validated to start at tokenIn and end at $ZEAL, and the
 *      swap recipient is always this contract, so even a hostile igniter cannot
 *      route value anywhere but into the next burn.
 */
contract ZealFurnace is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice No private key exists for this address. Explorers treat it as burned.
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    uint64 public constant ROLE_TIMELOCK = 48 hours;
    uint256 private constant ADDR_SIZE = 20;

    IERC20 public immutable zeal;
    ISwapRouter public immutable router;

    address public igniter;

    struct PendingRole {
        address account;
        uint64 eta;
    }

    PendingRole public pendingIgniter;

    /// @notice Lifetime $ZEAL sent to the burn address.
    uint256 public totalZealBurned;
    /// @notice Lifetime fee tokens consumed, per token.
    mapping(address token => uint256 amount) public totalConsumed;
    uint256 public burnCount;

    event Ignited(address indexed tokenIn, uint256 amountIn, uint256 zealOut, address indexed igniter);
    event Burned(address indexed caller, uint256 amount, uint256 totalZealBurned);
    event IgniterProposed(address indexed account, uint64 eta);
    event IgniterSet(address indexed previous, address indexed current);
    event IgniterProposalCancelled(address indexed account);

    error NotIgniter();
    error ZeroAddress();
    error ZeroAmount();
    error NothingToBurn();
    error CannotIgniteZeal();
    error BadPath();
    error InsufficientBalance(uint256 requested, uint256 held);
    error NoPendingRole();
    error TimelockNotElapsed(uint64 eta);

    modifier onlyIgniter() {
        if (msg.sender != igniter) revert NotIgniter();
        _;
    }

    constructor(IERC20 zeal_, ISwapRouter router_, address owner_, address igniter_) Ownable(owner_) {
        if (address(zeal_) == address(0) || address(router_) == address(0) || igniter_ == address(0)) {
            revert ZeroAddress();
        }
        zeal = zeal_;
        router = router_;
        igniter = igniter_;
        emit IgniterSet(address(0), igniter_);
    }

    // ---------------------------------------------------------------- ignite

    /**
     * @notice Swap `amountIn` of `tokenIn` held by the Furnace into $ZEAL, then burn
     *         everything held.
     * @param path Uniswap V3 path. Must start with `tokenIn` and end with $ZEAL.
     * @param minZealOut Slippage floor. The router reverts below it.
     */
    function ignite(address tokenIn, uint256 amountIn, uint256 minZealOut, bytes calldata path)
        external
        onlyIgniter
        nonReentrant
        returns (uint256 zealOut)
    {
        if (tokenIn == address(zeal)) revert CannotIgniteZeal();
        if (amountIn == 0) revert ZeroAmount();
        _requirePath(path, tokenIn);

        uint256 held = IERC20(tokenIn).balanceOf(address(this));
        if (amountIn > held) revert InsufficientBalance(amountIn, held);

        IERC20(tokenIn).forceApprove(address(router), amountIn);
        zealOut = router.exactInput(
            ISwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: minZealOut
            })
        );
        IERC20(tokenIn).forceApprove(address(router), 0);

        totalConsumed[tokenIn] += amountIn;
        emit Ignited(tokenIn, amountIn, zealOut, msg.sender);

        _burnHeld();
    }

    /// @notice Burn every $ZEAL the Furnace holds. Callable by anyone.
    function burn() external nonReentrant returns (uint256 amount) {
        amount = _burnHeld();
        if (amount == 0) revert NothingToBurn();
    }

    function _burnHeld() private returns (uint256 amount) {
        amount = zeal.balanceOf(address(this));
        if (amount == 0) return 0;

        totalZealBurned += amount;
        unchecked {
            ++burnCount;
        }
        emit Burned(msg.sender, amount, totalZealBurned);

        zeal.safeTransfer(BURN_ADDRESS, amount);
    }

    /// @dev V3 path layout: token(20) fee(3) token(20) [fee(3) token(20)]...
    function _requirePath(bytes calldata path, address tokenIn) private view {
        if (path.length < ADDR_SIZE * 2 + 3) revert BadPath();
        if ((path.length - ADDR_SIZE) % 23 != 0) revert BadPath();
        if (address(bytes20(path[:ADDR_SIZE])) != tokenIn) revert BadPath();
        if (address(bytes20(path[path.length - ADDR_SIZE:])) != address(zeal)) revert BadPath();
    }

    // ----------------------------------------------------------------- admin

    function proposeIgniter(address igniter_) external onlyOwner {
        if (igniter_ == address(0)) revert ZeroAddress();
        uint64 eta = uint64(block.timestamp) + ROLE_TIMELOCK;
        pendingIgniter = PendingRole(igniter_, eta);
        emit IgniterProposed(igniter_, eta);
    }

    function commitIgniter() external onlyOwner {
        PendingRole memory p = pendingIgniter;
        if (p.account == address(0)) revert NoPendingRole();
        if (block.timestamp < p.eta) revert TimelockNotElapsed(p.eta);
        emit IgniterSet(igniter, p.account);
        igniter = p.account;
        delete pendingIgniter;
    }

    function cancelIgniterProposal() external onlyOwner {
        emit IgniterProposalCancelled(pendingIgniter.account);
        delete pendingIgniter;
    }
}
