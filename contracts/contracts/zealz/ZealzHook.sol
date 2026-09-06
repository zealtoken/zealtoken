// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey, SwapParams} from "../ZealFurnaceV4.sol";

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
    uint256 public immutable totalBps;
    uint256 public immutable burnBps;
    uint256 public immutable creatorBps;
    uint256 public immutable treasuryBps;

    struct Opening { uint64 launchedAt; uint64 window; bool settled; uint256 totalBids; uint256 tokensOut; PoolKey key; }
    mapping(bytes32 poolId => address creator) public creatorOf;
    mapping(bytes32 poolId => Opening) public openings;
    mapping(bytes32 poolId => mapping(address bidder => uint256 zats)) public bids;

    event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint64 launchedAt, uint64 openingWindow);
    event Bid(bytes32 indexed poolId, address indexed bidder, uint256 zats, uint256 totalBids);
    event OpeningSettled(bytes32 indexed poolId, uint256 zatsIn, uint256 tokensOut);
    event Claimed(bytes32 indexed poolId, address indexed bidder, uint256 tokens);
    event FeeTaken(bytes32 indexed poolId, address indexed currency, uint256 toBurn, uint256 toCreator, uint256 toTreasury);

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

    constructor(address poolManager_, address factory_, address furnace_, address treasury_, address zzec_, uint256 burnBps_, uint256 creatorBps_, uint256 treasuryBps_) {
        if (poolManager_ == address(0) || factory_ == address(0) || furnace_ == address(0) || treasury_ == address(0) || zzec_ == address(0)) revert ZeroAddress();
        uint256 total = burnBps_ + creatorBps_ + treasuryBps_;
        if (total == 0 || total > 500) revert BadSplit(); // never more than 5% of a trade
        poolManager = poolManager_; factory = factory_; furnace = furnace_; treasury = treasury_; zzec = zzec_;
        burnBps = burnBps_; creatorBps = creatorBps_; treasuryBps = treasuryBps_; totalBps = total;
    }

    /// @param batchOpening true = the first OPENING_WINDOW is a batch (bids, one settlement price); false = instant trading.
    function register(PoolKey calldata key, address token, address creator, bool batchOpening) external {
        if (msg.sender != factory) revert NotFactory();
        if (creator == address(0)) revert ZeroAddress();
        bytes32 id = keccak256(abi.encode(key));
        creatorOf[id] = creator;
        Opening storage o = openings[id];
        o.launchedAt = uint64(block.timestamp);
        o.window = batchOpening ? OPENING_WINDOW : 0;
        o.key = key;
        if (!batchOpening) o.settled = true; // nothing to settle on an instant launch
        emit PoolRegistered(id, token, creator, uint64(block.timestamp), o.window);
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
        if (creatorOf[id] == address(0)) revert UnknownPool();
        if (!inOpening(id) || sender == address(this)) return (BEFORE_SWAP_SELECTOR, 0, 0);
        bool zzecIs0 = key.currency0 == zzec;
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
        int256 d = pm.swap(key, SwapParams(zzecIs0, -int256(zats), zzecIs0 ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1), "");
        int128 zIn = zzecIs0 ? _amount0(d) : _amount1(d);
        int128 tOut = zzecIs0 ? _amount1(d) : _amount0(d);
        pm.sync(zzec);
        IERC20(zzec).safeTransfer(poolManager, uint256(uint128(-zIn)));
        pm.settle();
        // the fee hook (afterSwap) has already taken its share of the output; the rest comes here for the bidders
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
        int128 unspecified = specifiedIsCurrency0 ? _amount1(delta) : _amount0(delta);
        if (unspecified < 0) unspecified = -unspecified;
        if (unspecified == 0) return (AFTER_SWAP_SELECTOR, 0);
        address currency = specifiedIsCurrency0 ? key.currency1 : key.currency0;
        uint256 total = _payShares(id, currency, creator, uint256(uint128(unspecified)));
        return (AFTER_SWAP_SELECTOR, int128(uint128(total)));
    }

    /// @dev Split `out` of `currency` and pay it straight from the PoolManager. Returns the total taken.
    function _payShares(bytes32 id, address currency, address creator, uint256 out) private returns (uint256 total) {
        uint256 toBurn; uint256 toCreator; uint256 toTreasury;
        if (currency == zzec) {
            toBurn = (out * burnBps) / BPS; toCreator = (out * creatorBps) / BPS; toTreasury = (out * treasuryBps) / BPS;
        } else {
            uint256 half = (out * burnBps) / BPS / 2; // token output: the burn's share is split between creator and treasury
            toCreator = (out * creatorBps) / BPS + half; toTreasury = (out * treasuryBps) / BPS + half;
        }
        total = toBurn + toCreator + toTreasury;
        if (total == 0) return 0;
        IPoolManagerZ pm = IPoolManagerZ(poolManager);
        if (toBurn != 0) pm.take(currency, furnace, toBurn);
        if (toCreator != 0) pm.take(currency, creator, toCreator);
        if (toTreasury != 0) pm.take(currency, treasury, toTreasury);
        emit FeeTaken(id, currency, toBurn, toCreator, toTreasury);
    }

    function _amount0(int256 d) private pure returns (int128 a) { assembly { a := sar(128, d) } }
    function _amount1(int256 d) private pure returns (int128 a) { assembly { a := signextend(15, d) } }

    fallback() external { revert HookNotImplemented(); }
}
