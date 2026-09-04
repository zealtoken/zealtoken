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
    function extsload(bytes32 slot) external view returns (bytes32);
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256 delta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// @dev Uniswap v4 PositionManager: the Furnace only ever decreases by zero to collect fees.
interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
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
    /// @dev v4-core: pools[poolId] lives at storage slot 6; slot0 packs sqrtPriceX96 in its low 160 bits.
    bytes32 private constant POOLS_SLOT = bytes32(uint256(6));
    uint256 private constant BPS = 10_000;
    uint64 public constant PROPOSAL_WINDOW = 7 days;

    IPoolManager public immutable poolManager;
    IPositionManager public immutable positionManager;
    IERC20 public immutable zeal;
    IERC20 public immutable zzec;
    /// @dev ETH/zZEC market: currency0 = ETH, currency1 = zZEC.
    PoolKey public zzecPool;
    /// @dev ETH/$ZEAL market: currency0 = ETH, currency1 = $ZEAL.
    PoolKey public zealPool;
    /// @notice Each ignite leg may move its pool's SQRT price by at most this much (bps). Price moves by
    ///         roughly twice that: 250 bps here is about a 5% price bound per leg. Bounds a bad fill.
    uint256 public immutable maxImpactBps;

    address public igniter;
    struct PendingRole { address account; uint64 eta; }
    PendingRole public pendingIgniter;

    /// @notice LP positions this contract holds. Only their fees are ever touched; liquidity never leaves.
    uint256[] public positionIds;

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
    error NotHeld();
    error AlreadyListed();
    error InsufficientOutput(uint256 got, uint256 min);
    error BadPoolKey();
    error PoolNotInitialized(bytes32 poolId);
    error BadImpact();
    error NotOwnerDeposit();
    error WrongPool();
    error NoPendingRole();
    error TimelockNotElapsed(uint64 eta);
    error ProposalExpired(uint64 eta);
    error CannotRenounce();

    modifier onlyIgniter() { if (msg.sender != igniter) revert NotIgniter(); _; }

    constructor(
        IPoolManager poolManager_,
        IPositionManager positionManager_,
        IERC20 zeal_,
        IERC20 zzec_,
        PoolKey memory zzecPool_,
        PoolKey memory zealPool_,
        uint256 maxImpactBps_,
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
        if (maxImpactBps_ == 0 || maxImpactBps_ > 5_000) revert BadImpact();
        // Both pools must already exist; a key typo here would otherwise lock every inflow forever.
        if (_sqrtPrice(poolManager_, _id(zzecPool_)) == 0) revert PoolNotInitialized(_id(zzecPool_));
        if (_sqrtPrice(poolManager_, _id(zealPool_)) == 0) revert PoolNotInitialized(_id(zealPool_));
        maxImpactBps = maxImpactBps_;
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

    function positionCount() external view returns (uint256) { return positionIds.length; }

    /// @notice Register a zZEC-pool position that reached this contract without the receiver hook
    ///         (a plain transferFrom). Owner only; the NFT must already be held here. Opens no exit.
    function adoptPosition(uint256 tokenId) external onlyOwner {
        if (positionManager.ownerOf(tokenId) != address(this)) revert NotHeld();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        if (_id(key) != _id(zzecPool)) revert WrongPool();
        for (uint256 i = 0; i < positionIds.length; ++i) if (positionIds[i] == tokenId) revert AlreadyListed();
        positionIds.push(tokenId);
        emit PositionReceived(tokenId, msg.sender);
    }

    /// @notice Pull the LP fees of every position held into the Furnace. Anyone may call.
    /// @dev DECREASE_LIQUIDITY with liquidity = 0 collects fees only; one TAKE_PAIR delivers them all here.
    function collectFees() external nonReentrant {
        uint256 n = positionIds.length;
        if (n == 0) revert NoPosition();
        bytes memory actions;
        bytes[] memory params = new bytes[](n + 1);
        for (uint256 i = 0; i < n; ++i) {
            actions = abi.encodePacked(actions, ACTION_DECREASE_LIQUIDITY);
            params[i] = abi.encode(positionIds[i], uint256(0), uint128(0), uint128(0), bytes(""));
            emit FeesCollected(msg.sender, positionIds[i]);
        }
        actions = abi.encodePacked(actions, ACTION_TAKE_PAIR);
        params[n] = abi.encode(zzecPool.currency0, zzecPool.currency1, address(this));
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    /// @dev Accept LP NFTs: sent by the owner, via the PositionManager, in the zZEC/ETH pool only.
    ///      Any number, so the liquidity share can keep adding positions whose fees feed the burn.
    ///      The real PositionManager only invokes this on safeTransferFrom, so mint to the owner first.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        if (from != owner()) revert NotOwnerDeposit();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        if (_id(key) != _id(zzecPool)) revert WrongPool();
        positionIds.push(tokenId);
        emit PositionReceived(tokenId, from);
        return IERC721Receiver.onERC721Received.selector;
    }

    // -------------------------------------------------------------- ignite

    /**
     * @notice Swap the zZEC held into ETH, then the ETH held into $ZEAL, then burn it all.
     *         Each leg stops at maxImpactBps of price movement; whatever is left waits for the next ignite.
     * @param minZealOut Floor on $ZEAL received across the whole ignition. Reverts below it.
     * @param hookData  Passed to the $ZEAL pool's hook (Pons); empty today.
     */
    function ignite(uint256 minZealOut, bytes calldata hookData) external onlyIgniter nonReentrant returns (uint256 zealOut) {
        uint256 zzecHeld = zzec.balanceOf(address(this));
        uint256 ethHeld = address(this).balance;
        if (zzecHeld == 0 && ethHeld == 0) revert NothingToIgnite();

        uint256 zealBefore = zeal.balanceOf(address(this));
        bytes memory ret = poolManager.unlock(abi.encode(zzecHeld, hookData));
        (uint256 zzecIn, uint256 ethIn) = abi.decode(ret, (uint256, uint256));
        zealOut = zeal.balanceOf(address(this)) - zealBefore;
        if (zealOut < minZealOut) revert InsufficientOutput(zealOut, minZealOut);

        totalZzecConsumed += zzecIn;
        totalEthConsumed += ethIn;
        emit Ignited(zzecIn, ethIn, zealOut, msg.sender);
        _burnHeld();
    }


    /// @dev Called by the PoolManager inside unlock(). Two legs: zZEC -> ETH, then ETH -> $ZEAL.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint256 zzecHeld, bytes memory hookData) = abi.decode(data, (uint256, bytes));
        uint256 zzecIn;
        uint256 ethIn;

        if (zzecHeld != 0) {
            // zZEC is currency1 of its pool: selling it is oneForZero, price moves up.
            uint160 limit = _limit(_sqrtPrice(poolManager, _id(zzecPool)), false);
            int256 d = poolManager.swap(zzecPool, SwapParams(false, -int256(zzecHeld), limit), "");
            _settle(zzecPool.currency1, _amount1(d));
            _take(zzecPool.currency0, _amount0(d));
            zzecIn = uint256(uint128(-_amount1(d)));
        }

        uint256 ethHeld = address(this).balance;
        if (ethHeld != 0) {
            // ETH is currency0 of the $ZEAL pool: buying $ZEAL is zeroForOne, price moves down.
            uint160 limit = _limit(_sqrtPrice(poolManager, _id(zealPool)), true);
            int256 d = poolManager.swap(zealPool, SwapParams(true, -int256(ethHeld), limit), hookData);
            _settle(zealPool.currency0, _amount0(d));
            _take(zealPool.currency1, _amount1(d));
            ethIn = uint256(uint128(-_amount0(d)));
        }
        return abi.encode(zzecIn, ethIn);
    }

    function _id(PoolKey memory key) private pure returns (bytes32) { return keccak256(abi.encode(key)); }

    function _sqrtPrice(IPoolManager pm, bytes32 poolId) private view returns (uint160) {
        bytes32 slot0 = pm.extsload(keccak256(abi.encodePacked(poolId, POOLS_SLOT)));
        return uint160(uint256(slot0));
    }

    /// @dev Price limit maxImpactBps away from the current sqrt price, clamped inside v4's bounds.
    function _limit(uint160 sqrtPriceX96, bool zeroForOne) private view returns (uint160) {
        if (zeroForOne) {
            uint256 lo = (uint256(sqrtPriceX96) * (BPS - maxImpactBps)) / BPS;
            return lo <= MIN_SQRT_PRICE ? MIN_SQRT_PRICE + 1 : uint160(lo);
        }
        uint256 hi = (uint256(sqrtPriceX96) * BPS) / (BPS - maxImpactBps);
        return hi >= MAX_SQRT_PRICE ? MAX_SQRT_PRICE - 1 : uint160(hi);
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
        if (block.timestamp > p.eta + PROPOSAL_WINDOW) revert ProposalExpired(p.eta);
        emit IgniterSet(igniter, p.account);
        igniter = p.account;
        delete pendingIgniter;
    }

    function cancelIgniterProposal() external onlyOwner {
        emit IgniterProposalCancelled(pendingIgniter.account);
        delete pendingIgniter;
    }

    /// @dev An ownerless Furnace could never rotate a lost igniter, locking every inflow. Not allowed.
    function renounceOwnership() public pure override {
        revert CannotRenounce();
    }
}
