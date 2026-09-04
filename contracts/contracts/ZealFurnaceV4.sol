// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev The slice of Uniswap v4 core the Furnace uses. Currencies are plain addresses; address(0) is native ETH.
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256 delta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @dev Uniswap v4 PositionManager: the Furnace only ever decreases by zero to collect fees.
interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
}

/**
 * @title ZealFurnaceV4
 * @notice Turns zZEC trading fees into burned $ZEAL, on Uniswap v4.
 *
 * @dev ONE DOOR. Value comes in as zZEC, ETH, or LP fees. The only outbound
 *      transfer this contract can make is $ZEAL to the burn address. No
 *      withdraw, no rescue, no sweep, no owner path to any balance. If it
 *      holds an LP position, it can collect that position's fees and nothing
 *      else: liquidity itself can never be decreased.
 *
 *      Roles, deliberately unequal:
 *        ignite(minZealOut)  swaps everything held into $ZEAL and burns it.
 *                            Needs a price-aware caller, so it is gated to an
 *                            igniter behind a 48h rotation timelock. A bad
 *                            igniter can get a bad fill within its own floor;
 *                            it cannot get the tokens.
 *        collectFees()       pulls LP fees into the Furnace. Permissionless.
 *        burn()              sends every $ZEAL held to 0x…dEaD. Permissionless.
 */
contract ZealFurnaceV4 is Ownable2Step, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint64 public constant ROLE_TIMELOCK = 48 hours;
    uint160 private constant MIN_SQRT_PRICE = 4295128739;
    uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;
    uint8 private constant ACTION_DECREASE_LIQUIDITY = 0x01;
    uint8 private constant ACTION_TAKE_PAIR = 0x11;

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IERC20 public immutable zeal;
    IERC20 public immutable zzec;
    /// @dev ETH/zZEC market: currency0 = ETH, currency1 = zZEC.
    PoolKey public zzecPool;
    /// @dev ETH/$ZEAL market: currency0 = ETH, currency1 = $ZEAL.
    PoolKey public zealPool;

    address public igniter;
    struct PendingRole { address account; uint64 eta; }
    PendingRole public pendingIgniter;

    /// @notice LP position this contract holds, if any. Only its fees are ever touched.
    uint256 public positionId;

    uint256 public totalZealBurned;
    uint256 public totalEthConsumed;
    uint256 public totalZzecConsumed;
    uint256 public burnCount;

    event Ignited(uint256 zzecIn, uint256 ethIn, uint256 zealOut, address indexed igniter);
    event Burned(address indexed caller, uint256 amount, uint256 totalZealBurned);
    event FeesCollected(address indexed caller, uint256 positionId);
    event PositionReceived(uint256 indexed tokenId, address indexed from);
    event IgniterProposed(address indexed account, uint64 eta);
    event IgniterSet(address indexed previous, address indexed current);
    event IgniterProposalCancelled(address indexed account);

    error NotIgniter();
    error NotPoolManager();
    error NotPositionManager();
    error ZeroAddress();
    error NothingToIgnite();
    error NothingToBurn();
    error NoPosition();
    error AlreadyHoldsPosition();
    error InsufficientOutput(uint256 got, uint256 min);
    error BadPoolKey();
    error NoPendingRole();
    error TimelockNotElapsed(uint64 eta);

    modifier onlyIgniter() { if (msg.sender != igniter) revert NotIgniter(); _; }

    constructor(
        IPoolManager poolManager_,
        IPositionManager positionManager_,
        IERC20 zeal_,
        IERC20 zzec_,
        PoolKey memory zzecPool_,
        PoolKey memory zealPool_,
        address owner_,
        address igniter_
    ) Ownable(owner_) {
        if (
            address(poolManager_) == address(0) || address(positionManager_) == address(0) || address(zeal_) == address(0)
                || address(zzec_) == address(0) || igniter_ == address(0)
        ) revert ZeroAddress();
        // Both markets are quoted in native ETH, which always sorts first.
        if (zzecPool_.currency0 != address(0) || zzecPool_.currency1 != address(zzec_)) revert BadPoolKey();
        if (zealPool_.currency0 != address(0) || zealPool_.currency1 != address(zeal_)) revert BadPoolKey();
        poolManager = poolManager_;
        positionManager = positionManager_;
        zeal = zeal_;
        zzec = zzec_;
        zzecPool = zzecPool_;
        zealPool = zealPool_;
        igniter = igniter_;
        emit IgniterSet(address(0), igniter_);
    }

    // ------------------------------------------------------------- collect

    /// @notice Pull this contract's LP fees into the Furnace. Anyone may call.
    /// @dev DECREASE_LIQUIDITY with liquidity = 0 collects fees only; TAKE_PAIR delivers them here.
    function collectFees() external nonReentrant {
        uint256 id = positionId;
        if (id == 0) revert NoPosition();
        bytes memory actions = abi.encodePacked(ACTION_DECREASE_LIQUIDITY, ACTION_TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(id, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(zzecPool.currency0, zzecPool.currency1, address(this));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        emit FeesCollected(msg.sender, id);
    }

    /// @dev Accept exactly one LP NFT, from the PositionManager only. It never leaves.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        if (positionId != 0) revert AlreadyHoldsPosition();
        positionId = tokenId;
        emit PositionReceived(tokenId, from);
        return IERC721Receiver.onERC721Received.selector;
    }

    // -------------------------------------------------------------- ignite

    /**
     * @notice Swap every zZEC held into ETH, then every ETH held into $ZEAL, then burn it all.
     * @param minZealOut Floor on $ZEAL received across the whole ignition. Reverts below it.
     */
    function ignite(uint256 minZealOut) external onlyIgniter nonReentrant returns (uint256 zealOut) {
        uint256 zzecIn = zzec.balanceOf(address(this));
        uint256 ethHeld = address(this).balance;
        if (zzecIn == 0 && ethHeld == 0) revert NothingToIgnite();

        uint256 zealBefore = zeal.balanceOf(address(this));
        bytes memory ret = poolManager.unlock(abi.encode(zzecIn));
        uint256 ethFromZzec = abi.decode(ret, (uint256));
        zealOut = zeal.balanceOf(address(this)) - zealBefore;
        if (zealOut < minZealOut) revert InsufficientOutput(zealOut, minZealOut);

        uint256 ethIn = ethHeld + ethFromZzec;
        totalZzecConsumed += zzecIn;
        totalEthConsumed += ethIn;
        emit Ignited(zzecIn, ethIn, zealOut, msg.sender);
        _burnHeld();
    }


    /// @dev Called by the PoolManager inside unlock(). Two legs: zZEC -> ETH, then ETH -> $ZEAL.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        uint256 zzecIn = abi.decode(data, (uint256));
        uint256 ethFromZzec;

        if (zzecIn != 0) {
            // zZEC is currency1 of its pool: selling it is oneForZero.
            int256 d = poolManager.swap(zzecPool, SwapParams(false, -int256(zzecIn), MAX_SQRT_PRICE - 1), "");
            _settle(zzecPool.currency1, _amount1(d));
            _take(zzecPool.currency0, _amount0(d));
            ethFromZzec = uint256(uint128(_amount0(d)));
        }

        uint256 ethIn = address(this).balance;
        if (ethIn != 0) {
            // ETH is currency0 of the $ZEAL pool: buying $ZEAL is zeroForOne.
            int256 d = poolManager.swap(zealPool, SwapParams(true, -int256(ethIn), MIN_SQRT_PRICE + 1), "");
            _settle(zealPool.currency0, _amount0(d));
            _take(zealPool.currency1, _amount1(d));
        }
        return abi.encode(ethFromZzec);
    }

    function _settle(address currency, int128 amount) private {
        if (amount >= 0) return;
        uint256 owed = uint256(uint128(-amount));
        if (currency == address(0)) {
            poolManager.sync(currency);
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(currency);
            IERC20(currency).safeTransfer(address(poolManager), owed);
            poolManager.settle();
        }
    }

    function _take(address currency, int128 amount) private {
        if (amount <= 0) return;
        poolManager.take(currency, address(this), uint256(uint128(amount)));
    }

    function _amount0(int256 delta) private pure returns (int128 a) { assembly { a := sar(128, delta) } }
    function _amount1(int256 delta) private pure returns (int128 a) { assembly { a := signextend(15, delta) } }

    // ---------------------------------------------------------------- burn

    function burn() external nonReentrant returns (uint256 amount) {
        amount = _burnHeld();
        if (amount == 0) revert NothingToBurn();
    }

    function _burnHeld() private returns (uint256 amount) {
        amount = zeal.balanceOf(address(this));
        if (amount == 0) return 0;
        totalZealBurned += amount;
        unchecked { ++burnCount; }
        emit Burned(msg.sender, amount, totalZealBurned);
        zeal.safeTransfer(BURN_ADDRESS, amount);
    }

    /// @dev Fees and swap output arrive as native ETH.
    receive() external payable {}

    // --------------------------------------------------------------- admin

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
