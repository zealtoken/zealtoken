// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey, SwapParams} from "../ZealFurnaceV4.sol";

interface IZealzToken { function reflect(uint256 zats) external; }

interface IPoolManagerZ {
    function take(address currency, address to, uint256 amount) external;
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256 delta);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
}

/**
 * @title ZealzHook
 * @notice One hook for every zealz.fun launch. Two jobs:
 *
 *   1. THE BATCH OPENING. For the first OPENING_WINDOW after a launch, every buy is a
 *      bid instead of a trade: the hook takes the zZEC, the pool is not touched, and
 *      sells are refused. When the window closes anyone calls settle(): the hook
 *      executes ONE swap for the whole batch and every bidder claims tokens pro rata.
 *      Everyone in the window pays the same price. Being first buys nothing.
 *
 *   2. THE FEE. After the opening, afterSwap takes a fixed share of each swap's output
 *      and splits it inside the swap, with no custody: zZEC output (a sell) pays the
 *      Furnace, the creator and the treasury; token output (a buy) pays creator and
 *      treasury only, since the Furnace burns $ZEAL and cannot use a random token.
 *
 * @dev Flags 0xCC: beforeSwap + beforeSwapReturnsDelta + afterSwap + afterSwapReturnsDelta.
 *      Pools are registered by the factory, which records each pool's creator and launch
 *      time. Shares and the window are immutable. No owner. The only funds the hook ever
 *      holds are open bids and unclaimed batch tokens, and only their owners can move them.
 */
contract ZealzHook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    bytes4 private constant BEFORE_SWAP_SELECTOR = 0x575e24b4; // beforeSwap(address,PoolKey,SwapParams,bytes)
    bytes4 private constant AFTER_SWAP_SELECTOR = 0xb47b2fb1; // afterSwap(address,PoolKey,SwapParams,int256,bytes)
    uint160 private constant MIN_SQRT_PRICE = 4295128739;
    uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;

    uint64 public constant OPENING_WINDOW = 10 minutes;

    address public immutable poolManager;
    address public immutable factory;
    address public immutable furnace;
    address public immutable treasury;
    address public immutable zzec;

    /// @notice Every launched pool pays 2% of the zZEC side of every trade. The platform's 0.25% is fixed;
    ///         the creator chooses the rest at launch: at least 0.25% to the Furnace, at most 0.5% to
    ///         themselves, and whatever is left is reflected to the token's holders in zZEC.
    uint16 public constant TOTAL_BPS = 200;
    uint16 public constant TREASURY_BPS = 25;
    uint16 public constant MIN_BURN_BPS = 25;
    uint16 public constant MAX_CREATOR_BPS = 50;

    struct Split { uint16 burn; uint16 creator; uint16 reflect; }
    mapping(bytes32 poolId => Split) public splitOf;
    mapping(bytes32 poolId => address token) public tokenOf;

    struct Opening { uint64 launchedAt; uint64 window; bool settled; uint256 totalBids; uint256 tokensOut; PoolKey key; }
    mapping(bytes32 poolId => address creator) public creatorOf;
    mapping(bytes32 poolId => Opening) public openings;
    mapping(bytes32 poolId => mapping(address bidder => uint256 zats)) public bids;

    event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint64 launchedAt, uint64 openingWindow, uint16 burnBps, uint16 creatorBps, uint16 reflectBps);
    event Bid(bytes32 indexed poolId, address indexed bidder, uint256 zats, uint256 totalBids);
    event OpeningSettled(bytes32 indexed poolId, uint256 zatsIn, uint256 tokensOut);
    event Claimed(bytes32 indexed poolId, address indexed bidder, uint256 tokens);
    event FeeTaken(bytes32 indexed poolId, address indexed currency, uint256 toBurn, uint256 toCreator, uint256 toTreasury, uint256 toReflect);

    error NotPoolManager();
    error NotFactory();
    error UnknownPool();
    error BadSplit();
    error ZeroAddress();
    error HookNotImplemented();
    error OpeningInProgress();
    error OpeningNotOver();
    error AlreadySettled();
    error NotSettled();
    error NothingToClaim();
    error ExactInputOnly();

    constructor(address poolManager_, address factory_, address furnace_, address treasury_, address zzec_) {
        if (poolManager_ == address(0) || factory_ == address(0) || furnace_ == address(0) || treasury_ == address(0) || zzec_ == address(0)) revert ZeroAddress();
        poolManager = poolManager_; factory = factory_; furnace = furnace_; treasury = treasury_; zzec = zzec_;
    }

    /// @param batchOpening true = the first OPENING_WINDOW is a batch (bids, one settlement price); false = instant trading.
    /// @param burnBps share of every trade's zZEC to the Furnace, at least MIN_BURN_BPS.
    /// @param creatorBps share to the creator, at most MAX_CREATOR_BPS. The remainder after the platform's cut is reflected to holders.
    function register(PoolKey calldata key, address token, address creator, bool batchOpening, uint16 burnBps, uint16 creatorBps) external {
        if (msg.sender != factory) revert NotFactory();
        if (creator == address(0)) revert ZeroAddress();
        if (burnBps < MIN_BURN_BPS || creatorBps > MAX_CREATOR_BPS || burnBps + creatorBps + TREASURY_BPS > TOTAL_BPS) revert BadSplit();
        bytes32 id = keccak256(abi.encode(key));
        creatorOf[id] = creator;
        tokenOf[id] = token;
        splitOf[id] = Split(burnBps, creatorBps, TOTAL_BPS - TREASURY_BPS - burnBps - creatorBps);
        Opening storage o = openings[id];
        o.launchedAt = uint64(block.timestamp);
        o.window = batchOpening ? OPENING_WINDOW : 0;
        o.key = key;
        if (!batchOpening) o.settled = true; // nothing to settle on an instant launch
        emit PoolRegistered(id, token, creator, uint64(block.timestamp), o.window, burnBps, creatorBps, splitOf[id].reflect);
    }

    // ------------------------------------------------------------ the opening

    function openingEndsAt(bytes32 poolId) public view returns (uint64) { Opening storage o = openings[poolId]; return o.launchedAt + o.window; }
    function inOpening(bytes32 poolId) public view returns (bool) { Opening storage o = openings[poolId]; return o.launchedAt != 0 && o.window != 0 && block.timestamp < o.launchedAt + o.window; }

    /**
     * @dev During the opening a buy becomes a bid. The hook takes the whole zZEC input
     *      (custom accounting: the returned delta consumes the specified amount, so the
     *      pool swaps nothing) and records it to the bidder: the address in hookData if
     *      the caller passed one, else the transaction origin. Sells and exact-output
     *      buys are refused until the window closes.
     */
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData) external returns (bytes4, int256, uint24) {
        if (msg.sender != poolManager) revert NotPoolManager();
        bytes32 id = keccak256(abi.encode(key));
        address creator = creatorOf[id];
        if (creator == address(0)) revert UnknownPool();
        bool zzecIs0 = key.currency0 == zzec;
        if (!inOpening(id) || sender == address(this)) {
            // The fee always comes off the zZEC leg. When zZEC is the specified amount (an
            // exact-input buy, or an exact-output sell) it is taken here, before the swap;
            // when zZEC is the unspecified amount, afterSwap takes it from the result.
            bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
            if (specifiedIs0 != zzecIs0) return (BEFORE_SWAP_SELECTOR, 0, 0);
            uint256 amt = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 total = _payShares(id, creator, amt);
            return (BEFORE_SWAP_SELECTOR, int256(int128(uint128(total))) << 128, 0);
        }
        bool isBuy = params.zeroForOne == zzecIs0; // zZEC is the input
        if (!isBuy) revert OpeningInProgress();
        if (params.amountSpecified >= 0) revert ExactInputOnly();
        uint256 zats = uint256(-params.amountSpecified);
        address bidder = hookData.length == 32 ? abi.decode(hookData, (address)) : tx.origin;
        IPoolManagerZ(poolManager).take(zzec, address(this), zats);
        Opening storage o = openings[id];
        o.totalBids += zats;
        bids[id][bidder] += zats;
        emit Bid(id, bidder, zats, o.totalBids);
        // positive specified delta: the swapper owes the hook the whole input; nothing left for the pool
        return (BEFORE_SWAP_SELECTOR, int256(int128(uint128(zats))) << 128, 0);
    }

    /// @notice After the window: swap the whole batch in one go. Anyone may call.
    function settle(bytes32 poolId) external nonReentrant {
        Opening storage o = openings[poolId];
        if (o.launchedAt == 0) revert UnknownPool();
        if (block.timestamp < o.launchedAt + o.window) revert OpeningNotOver();
        if (o.settled) revert AlreadySettled();
        o.settled = true;
        if (o.totalBids == 0) { emit OpeningSettled(poolId, 0, 0); return; }
        bytes memory ret = IPoolManagerZ(poolManager).unlock(abi.encode(poolId, o.totalBids));
        o.tokensOut = abi.decode(ret, (uint256));
        emit OpeningSettled(poolId, o.totalBids, o.tokensOut);
    }

    /// @dev The batch swap, inside unlock. Pays the zZEC held, takes the tokens here.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != poolManager) revert NotPoolManager();
        (bytes32 poolId, uint256 zats) = abi.decode(data, (bytes32, uint256));
        PoolKey memory key = openings[poolId].key;
        bool zzecIs0 = key.currency0 == zzec;
        IPoolManagerZ pm = IPoolManagerZ(poolManager);
        // The pool manager does not run a hook's callbacks on the hook's own swap, so the
        // batch pays its 2% here, straight from the bids it holds: the same split as any buy.
        {
            Split memory sp = splitOf[poolId];
            uint256 toBurn = (zats * sp.burn) / BPS; uint256 toCreator = (zats * sp.creator) / BPS; uint256 toTreasury = (zats * TREASURY_BPS) / BPS; uint256 toReflect = (zats * sp.reflect) / BPS;
            if (toBurn != 0) IERC20(zzec).safeTransfer(furnace, toBurn);
            if (toCreator != 0) IERC20(zzec).safeTransfer(creatorOf[poolId], toCreator);
            if (toTreasury != 0) IERC20(zzec).safeTransfer(treasury, toTreasury);
            if (toReflect != 0) { address tk = tokenOf[poolId]; IERC20(zzec).safeTransfer(tk, toReflect); IZealzToken(tk).reflect(toReflect); }
            emit FeeTaken(poolId, zzec, toBurn, toCreator, toTreasury, toReflect);
            zats -= toBurn + toCreator + toTreasury + toReflect;
        }
        int256 d = pm.swap(key, SwapParams(zzecIs0, -int256(zats), zzecIs0 ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1), "");
        int128 zIn = zzecIs0 ? _amount0(d) : _amount1(d);
        int128 tOut = zzecIs0 ? _amount1(d) : _amount0(d);
        pm.sync(zzec);
        IERC20(zzec).safeTransfer(poolManager, uint256(uint128(-zIn)));
        pm.settle();
        // the fee came off the zZEC input in beforeSwap; every token that came out belongs to the bidders
        uint256 tokens = uint256(uint128(tOut));
        pm.take(zzecIs0 ? key.currency1 : key.currency0, address(this), tokens);
        return abi.encode(tokens);
    }

    /// @notice Claim your share of the batch. Pro rata to your bid.
    function claim(bytes32 poolId) external nonReentrant {
        Opening storage o = openings[poolId];
        if (!o.settled) revert NotSettled();
        uint256 z = bids[poolId][msg.sender];
        if (z == 0) revert NothingToClaim();
        bids[poolId][msg.sender] = 0;
        uint256 tokens = (o.tokensOut * z) / o.totalBids;
        address token = o.key.currency0 == zzec ? o.key.currency1 : o.key.currency0;
        IERC20(token).safeTransfer(msg.sender, tokens);
        emit Claimed(poolId, msg.sender, tokens);
    }

    // ------------------------------------------------------------ the fee

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata) external returns (bytes4, int128) {
        if (msg.sender != poolManager) revert NotPoolManager();
        bytes32 id = keccak256(abi.encode(key));
        address creator = creatorOf[id];
        if (creator == address(0)) revert UnknownPool();
        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        bool zzecIs0 = key.currency0 == zzec;
        if (specifiedIsCurrency0 == zzecIs0) return (AFTER_SWAP_SELECTOR, 0); // zZEC was specified: beforeSwap already took the fee
        int128 unspecified = specifiedIsCurrency0 ? _amount1(delta) : _amount0(delta);
        if (unspecified < 0) unspecified = -unspecified;
        if (unspecified == 0) return (AFTER_SWAP_SELECTOR, 0);
        uint256 total = _payShares(id, creator, uint256(uint128(unspecified)));
        return (AFTER_SWAP_SELECTOR, int128(uint128(total)));
    }

    /// @dev Split `amt` of zZEC by the pool's split and pay it straight from the PoolManager. Returns the total taken.
    function _payShares(bytes32 id, address creator, uint256 amt) private returns (uint256 total) {
        Split memory sp = splitOf[id];
        uint256 toBurn = (amt * sp.burn) / BPS; uint256 toCreator = (amt * sp.creator) / BPS; uint256 toTreasury = (amt * TREASURY_BPS) / BPS; uint256 toReflect = (amt * sp.reflect) / BPS;
        total = toBurn + toCreator + toTreasury + toReflect;
        if (total == 0) return 0;
        IPoolManagerZ pm = IPoolManagerZ(poolManager);
        if (toBurn != 0) pm.take(zzec, furnace, toBurn);
        if (toCreator != 0) pm.take(zzec, creator, toCreator);
        if (toTreasury != 0) pm.take(zzec, treasury, toTreasury);
        if (toReflect != 0) { address tk = tokenOf[id]; pm.take(zzec, tk, toReflect); IZealzToken(tk).reflect(toReflect); }
        emit FeeTaken(id, zzec, toBurn, toCreator, toTreasury, toReflect);
    }

    function _amount0(int256 d) private pure returns (int128 a) { assembly { a := sar(128, d) } }
    function _amount1(int256 d) private pure returns (int128 a) { assembly { a := signextend(15, d) } }

    fallback() external { revert HookNotImplemented(); }
}
