// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey, SwapParams} from "../ZealFurnaceV4.sol";

interface IZealzToken { function distribute(uint256 zats) external; }

interface IPoolManagerZ {
    function take(address currency, address to, uint256 amount) external;
    function mint(address to, uint256 id, uint256 amount) external;
    function burn(address from, uint256 id, uint256 amount) external;
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
 *   2. THE FEE. Every swap pays the pool's fee from its zZEC leg, inside the swap: a buy
 *      pays it from the zZEC going in (beforeSwap), a sell from the zZEC coming out
 *      (afterSwap). It is split to the Furnace, the creator, the platform and the token's
 *      dividend ledger by the shares the creator fixed at launch.
 *
 *      MONEY MOVEMENT. Inside a swap callback the swapper has not settled yet, so the hook
 *      never takes real tokens there. It converts its credited delta into PoolManager
 *      ERC-6909 claims (mint) and books who is owed what. Bids stay as claims until settle()
 *      burns them to pay the batch swap. Fees stay as claims until anyone calls flush(),
 *      which burns them and pays every recipient real zZEC. Claims are always backed by
 *      zZEC the swapper settled into the PoolManager, so flush cannot fail for want of funds.
 *
 * @dev Flags 0x20CC: beforeInitialize (only the factory may open a pool with this hook) +
 *      beforeSwap + beforeSwapReturnsDelta + afterSwap + afterSwapReturnsDelta.
 *      Pools are registered by the factory, which records each pool's creator and launch
 *      time. Shares and the window are immutable. No owner. The only funds the hook ever
 *      holds are open bids, unclaimed batch tokens, refunds and unflushed fees, and every
 *      one of them has exactly one address that can receive it.
 */
contract ZealzHook is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    bytes4 private constant BEFORE_SWAP_SELECTOR = 0x575e24b4; // beforeSwap(address,PoolKey,SwapParams,bytes)
    bytes4 private constant AFTER_SWAP_SELECTOR = 0xb47b2fb1; // afterSwap(address,PoolKey,SwapParams,int256,bytes)
    bytes4 private constant BEFORE_INITIALIZE_SELECTOR = 0xdc98354e; // beforeInitialize(address,PoolKey,uint160)
    uint8 private constant MODE_SETTLE = 0;
    uint8 private constant MODE_FLUSH = 1;
    uint160 private constant MIN_SQRT_PRICE = 4295128739;
    uint160 private constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;

    uint64 public constant OPENING_WINDOW = 10 minutes;

    address public immutable poolManager;
    address public immutable factory;
    address public immutable furnace;
    address public immutable treasury;
    address public immutable zzec;

    /// @notice Every launched pool pays a fee on the zZEC side of every trade, chosen by the creator at
    ///         launch between 1% and 5%. The platform's 0.5% is fixed; at least 0.5% goes to the
    ///         Furnace; at most 0.5% goes to the creator; whatever is left goes to holders as claimable zZEC dividends.
    uint16 public constant MIN_TOTAL_BPS = 100;
    uint16 public constant MAX_TOTAL_BPS = 500;
    uint16 public constant TREASURY_BPS = 50;
    uint16 public constant MIN_BURN_BPS = 50;
    uint16 public constant MAX_CREATOR_BPS = 50;

    struct Split { uint16 total; uint16 burn; uint16 creator; uint16 holders; }
    mapping(bytes32 poolId => Split) public splitOf;
    mapping(bytes32 poolId => address token) public tokenOf;

    struct Opening { uint64 launchedAt; uint64 window; bool settled; uint256 totalBids; uint256 tokensOut; uint256 refund; PoolKey key; }
    /// @notice zZEC owed to an address (Furnace, platform, creators), held as PoolManager claims until flush().
    mapping(address => uint256) public owed;
    /// @notice zZEC owed to a token's dividend ledger, held as claims until flush().
    mapping(address => uint256) public owedToHolders;
    mapping(bytes32 poolId => address creator) public creatorOf;
    mapping(bytes32 poolId => Opening) public openings;
    mapping(bytes32 poolId => mapping(address bidder => uint256 zats)) public bids;

    event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint64 launchedAt, uint64 openingWindow, uint16 totalBps, uint16 burnBps, uint16 creatorBps, uint16 holdersBps);
    event Bid(bytes32 indexed poolId, address indexed bidder, uint256 zats, uint256 totalBids);
    event OpeningSettled(bytes32 indexed poolId, uint256 zatsIn, uint256 tokensOut, uint256 refund);
    event Flushed(address indexed to, uint256 zats, bool dividends);
    event Claimed(bytes32 indexed poolId, address indexed bidder, uint256 tokens);
    event FeeTaken(bytes32 indexed poolId, address indexed currency, uint256 toBurn, uint256 toCreator, uint256 toTreasury, uint256 toHolders);

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
    error SettlementPending();
    error AlreadyRegistered();
    error BadBidder();

    constructor(address poolManager_, address factory_, address furnace_, address treasury_, address zzec_) {
        if (poolManager_ == address(0) || factory_ == address(0) || furnace_ == address(0) || treasury_ == address(0) || zzec_ == address(0)) revert ZeroAddress();
        poolManager = poolManager_; factory = factory_; furnace = furnace_; treasury = treasury_; zzec = zzec_;
    }

    /// @param batchOpening true = the first OPENING_WINDOW is a batch (bids, one settlement price); false = instant trading.
    /// @param totalBps the whole fee on the zZEC leg, MIN_TOTAL_BPS..MAX_TOTAL_BPS.
    /// @param burnBps share of every trade's zZEC to the Furnace, at least MIN_BURN_BPS.
    /// @param creatorBps share to the creator, at most MAX_CREATOR_BPS. The remainder after the platform's cut goes to holders as dividends.
    function register(PoolKey calldata key, address token, address creator, bool batchOpening, uint16 totalBps, uint16 burnBps, uint16 creatorBps) external {
        if (msg.sender != factory) revert NotFactory();
        if (creator == address(0)) revert ZeroAddress();
        if (totalBps < MIN_TOTAL_BPS || totalBps > MAX_TOTAL_BPS || burnBps < MIN_BURN_BPS || creatorBps > MAX_CREATOR_BPS || burnBps + creatorBps + TREASURY_BPS > totalBps) revert BadSplit();
        bytes32 id = keccak256(abi.encode(key));
        if (creatorOf[id] != address(0)) revert AlreadyRegistered();
        creatorOf[id] = creator;
        tokenOf[id] = token;
        splitOf[id] = Split(totalBps, burnBps, creatorBps, totalBps - TREASURY_BPS - burnBps - creatorBps);
        Opening storage o = openings[id];
        o.launchedAt = uint64(block.timestamp);
        o.window = batchOpening ? OPENING_WINDOW : 0;
        o.key = key;
        if (!batchOpening) o.settled = true; // nothing to settle on an instant launch
        emit PoolRegistered(id, token, creator, uint64(block.timestamp), o.window, totalBps, burnBps, creatorBps, splitOf[id].holders);
    }

    // ------------------------------------------------------------ pool creation

    /// @dev Only the factory may open a pool that carries this hook. Without this, anyone could
    ///      initialize the pool for a predictable future token address at a bad price and brick launches.
    function beforeInitialize(address sender, PoolKey calldata, uint160) external view returns (bytes4) {
        if (msg.sender != poolManager) revert NotPoolManager();
        if (sender != factory) revert NotFactory();
        return BEFORE_INITIALIZE_SELECTOR;
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
        Opening storage o = openings[id];
        if (sender == address(this) || o.settled) {
            // The fee always comes off the zZEC leg. When zZEC is the specified amount (an
            // exact-input buy, or an exact-output sell) it is booked here, before the swap;
            // when zZEC is the unspecified amount, afterSwap books it from the result.
            bool specifiedIs0 = (params.amountSpecified < 0) == params.zeroForOne;
            if (specifiedIs0 != zzecIs0) return (BEFORE_SWAP_SELECTOR, 0, 0);
            uint256 amt = params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
            uint256 total = _accrue(id, creator, amt);
            return (BEFORE_SWAP_SELECTOR, int256(int128(uint128(total))) << 128, 0);
        }
        // A batch pool that is not settled: bids during the window, nothing at all after it
        // until someone calls settle(), so no trade can move the price the batch will get.
        if (block.timestamp >= o.launchedAt + o.window) revert SettlementPending();
        bool isBuy = params.zeroForOne == zzecIs0; // zZEC is the input
        if (!isBuy) revert OpeningInProgress();
        if (params.amountSpecified >= 0) revert ExactInputOnly();
        uint256 zats = uint256(-params.amountSpecified);
        address bidder = hookData.length == 32 ? abi.decode(hookData, (address)) : tx.origin;
        if (bidder == address(0)) revert BadBidder();
        // the swapper owes the hook the whole input; the hook keeps it as a claim, not a token
        IPoolManagerZ(poolManager).mint(address(this), uint256(uint160(zzec)), zats);
        o.totalBids += zats;
        bids[id][bidder] += zats;
        emit Bid(id, bidder, zats, o.totalBids);
        return (BEFORE_SWAP_SELECTOR, int256(int128(uint128(zats))) << 128, 0);
    }

    /// @notice After the window: swap the whole batch in one go. Anyone may call.
    function settle(bytes32 poolId) external nonReentrant {
        Opening storage o = openings[poolId];
        if (o.launchedAt == 0) revert UnknownPool();
        if (block.timestamp < o.launchedAt + o.window) revert OpeningNotOver();
        if (o.settled) revert AlreadySettled();
        o.settled = true;
        if (o.totalBids == 0) { emit OpeningSettled(poolId, 0, 0, 0); return; }
        bytes memory ret = IPoolManagerZ(poolManager).unlock(abi.encode(MODE_SETTLE, poolId, o.totalBids));
        (o.tokensOut, o.refund) = abi.decode(ret, (uint256, uint256));
        emit OpeningSettled(poolId, o.totalBids, o.tokensOut, o.refund);
    }

    /// @notice Pay out what the hook owes: burn the claims it holds and hand real zZEC to each recipient,
    ///         and to each token's dividend ledger. Anyone may call; the daily job does.
    function flush(address[] calldata recipients, address[] calldata tokens) external nonReentrant {
        IPoolManagerZ(poolManager).unlock(abi.encode(MODE_FLUSH, recipients, tokens));
    }

    /// @dev Inside unlock: either the batch swap or a flush. Only the PoolManager calls this, and only
    ///      because this contract asked it to.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != poolManager) revert NotPoolManager();
        uint8 mode = abi.decode(data, (uint8));
        if (mode == MODE_FLUSH) { _flush(data); return ""; }
        (, bytes32 poolId, uint256 zats) = abi.decode(data, (uint8, bytes32, uint256));
        (uint256 tokens, uint256 refund) = _settleBatch(poolId, _bookBatchFee(poolId, zats));
        return abi.encode(tokens, refund);
    }

    /// @dev The pool manager does not run a hook's callbacks on the hook's own swap, so the batch pays its
    ///      fee here: booked like any buy, out of the bid claims the hook holds. Returns what is left to swap.
    function _bookBatchFee(bytes32 poolId, uint256 zats) private returns (uint256) {
        Split memory sp = splitOf[poolId];
        uint256 toBurn = (zats * sp.burn) / BPS; uint256 toCreator = (zats * sp.creator) / BPS; uint256 toTreasury = (zats * TREASURY_BPS) / BPS; uint256 toHolders = (zats * sp.holders) / BPS;
        owed[furnace] += toBurn; owed[creatorOf[poolId]] += toCreator; owed[treasury] += toTreasury; owedToHolders[tokenOf[poolId]] += toHolders;
        emit FeeTaken(poolId, zzec, toBurn, toCreator, toTreasury, toHolders);
        return zats - toBurn - toCreator - toTreasury - toHolders;
    }

    /// @dev One swap for the whole batch, paid from bid claims. Tokens come here for the bidders to claim;
    ///      if the range ran out before the batch did, the unused zZEC comes here too, as their refund.
    function _settleBatch(bytes32 poolId, uint256 zats) private returns (uint256 tokens, uint256 refund) {
        PoolKey memory key = openings[poolId].key;
        bool zzecIs0 = key.currency0 == zzec;
        IPoolManagerZ pm = IPoolManagerZ(poolManager);
        int256 d = pm.swap(key, SwapParams(zzecIs0, -int256(zats), zzecIs0 ? MIN_SQRT_PRICE + 1 : MAX_SQRT_PRICE - 1), "");
        uint256 zUsed = uint256(uint128(-(zzecIs0 ? _amount0(d) : _amount1(d))));
        tokens = uint256(uint128(zzecIs0 ? _amount1(d) : _amount0(d)));
        pm.burn(address(this), uint256(uint160(zzec)), zUsed);
        pm.take(zzecIs0 ? key.currency1 : key.currency0, address(this), tokens);
        refund = zats - zUsed;
        if (refund != 0) { pm.burn(address(this), uint256(uint160(zzec)), refund); pm.take(zzec, address(this), refund); }
    }

    function _flush(bytes calldata data) private {
        (, address[] memory recipients, address[] memory tokens) = abi.decode(data, (uint8, address[], address[]));
        IPoolManagerZ pm = IPoolManagerZ(poolManager);
        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            address r = recipients[i]; uint256 a = owed[r];
            if (a == 0) continue;
            owed[r] = 0; total += a;
            pm.take(zzec, r, a);
            emit Flushed(r, a, false);
        }
        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i]; uint256 a = owedToHolders[t];
            if (a == 0) continue;
            owedToHolders[t] = 0; total += a;
            pm.take(zzec, t, a);
            IZealzToken(t).distribute(a);
            emit Flushed(t, a, true);
        }
        if (total != 0) pm.burn(address(this), uint256(uint160(zzec)), total);
    }

    /// @notice Claim your share of the batch: tokens pro rata to your bid, plus any refund.
    function claim(bytes32 poolId) external nonReentrant {
        Opening storage o = openings[poolId];
        if (!o.settled) revert NotSettled();
        uint256 z = bids[poolId][msg.sender];
        if (z == 0) revert NothingToClaim();
        bids[poolId][msg.sender] = 0;
        uint256 tokens = (o.tokensOut * z) / o.totalBids;
        address token = o.key.currency0 == zzec ? o.key.currency1 : o.key.currency0;
        IERC20(token).safeTransfer(msg.sender, tokens);
        if (o.refund != 0) { uint256 back = (o.refund * z) / o.totalBids; if (back != 0) IERC20(zzec).safeTransfer(msg.sender, back); }
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
        uint256 total = _accrue(id, creator, uint256(uint128(unspecified)));
        return (AFTER_SWAP_SELECTOR, int128(uint128(total)));
    }

    /// @dev Split `amt` of zZEC by the pool's split: book who is owed what and keep the total as a claim. Returns the total.
    function _accrue(bytes32 id, address creator, uint256 amt) private returns (uint256 total) {
        Split memory sp = splitOf[id];
        uint256 toBurn = (amt * sp.burn) / BPS; uint256 toCreator = (amt * sp.creator) / BPS; uint256 toTreasury = (amt * TREASURY_BPS) / BPS; uint256 toHolders = (amt * sp.holders) / BPS;
        total = toBurn + toCreator + toTreasury + toHolders;
        if (total == 0) return 0;
        owed[furnace] += toBurn; owed[creator] += toCreator; owed[treasury] += toTreasury; owedToHolders[tokenOf[id]] += toHolders;
        IPoolManagerZ(poolManager).mint(address(this), uint256(uint160(zzec)), total);
        emit FeeTaken(id, zzec, toBurn, toCreator, toTreasury, toHolders);
    }

    function _amount0(int256 d) private pure returns (int128 a) { assembly { a := sar(128, d) } }
    function _amount1(int256 d) private pure returns (int128 a) { assembly { a := signextend(15, d) } }

    fallback() external { revert HookNotImplemented(); }
}
