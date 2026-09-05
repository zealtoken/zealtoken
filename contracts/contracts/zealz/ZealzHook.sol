// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PoolKey, SwapParams} from "../ZealFurnaceV4.sol";

interface IPoolManagerTakeZ {
    function take(address currency, address to, uint256 amount) external;
}

/**
 * @title ZealzHook
 * @notice One hook for every zealz.fun launch. Takes a fixed share of each swap's
 *         output and splits it three ways, inside the swap, with no custody:
 *         - output in zZEC (a sell): burn share to the Furnace, the rest to creator and treasury
 *         - output in the launched token (a buy): split between creator and treasury only,
 *           since the Furnace burns $ZEAL and cannot use a random token
 *
 * @dev afterSwap only (address flags 0x44). Pools are registered by the factory,
 *      which records each pool's creator. Shares are immutable. No owner.
 */
contract ZealzHook {
    uint256 private constant BPS = 10_000;
    bytes4 private constant AFTER_SWAP_SELECTOR = 0xb47b2fb1;

    address public immutable poolManager;
    address public immutable factory;
    address public immutable furnace;
    address public immutable treasury;
    address public immutable zzec;
    /// @dev Of every swap's output, in bps: total taken, then how zZEC output splits (burn/creator/treasury) and how token output splits (creator/treasury).
    uint256 public immutable totalBps;
    uint256 public immutable burnBps; // of output, zZEC side only
    uint256 public immutable creatorBps; // of output, zZEC side; on the token side creator gets half of total
    uint256 public immutable treasuryBps; // of output, zZEC side

    mapping(bytes32 poolId => address creator) public creatorOf;

    event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator);
    event FeeTaken(bytes32 indexed poolId, address indexed currency, uint256 toBurn, uint256 toCreator, uint256 toTreasury);

    error NotPoolManager();
    error NotFactory();
    error UnknownPool();
    error BadSplit();
    error ZeroAddress();
    error HookNotImplemented();

    constructor(address poolManager_, address factory_, address furnace_, address treasury_, address zzec_, uint256 burnBps_, uint256 creatorBps_, uint256 treasuryBps_) {
        if (poolManager_ == address(0) || factory_ == address(0) || furnace_ == address(0) || treasury_ == address(0) || zzec_ == address(0)) revert ZeroAddress();
        uint256 total = burnBps_ + creatorBps_ + treasuryBps_;
        if (total == 0 || total > 500) revert BadSplit(); // never more than 5% of a trade
        poolManager = poolManager_; factory = factory_; furnace = furnace_; treasury = treasury_; zzec = zzec_;
        burnBps = burnBps_; creatorBps = creatorBps_; treasuryBps = treasuryBps_; totalBps = total;
    }

    function register(PoolKey calldata key, address token, address creator) external {
        if (msg.sender != factory) revert NotFactory();
        if (creator == address(0)) revert ZeroAddress();
        bytes32 id = keccak256(abi.encode(key));
        creatorOf[id] = creator;
        emit PoolRegistered(id, token, creator);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata) external returns (bytes4, int128) {
        if (msg.sender != poolManager) revert NotPoolManager();
        bytes32 id = keccak256(abi.encode(key));
        address creator = creatorOf[id];
        if (creator == address(0)) revert UnknownPool();

        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        int128 unspecified = specifiedIsCurrency0 ? _amount1(delta) : _amount0(delta);
        address currency = specifiedIsCurrency0 ? key.currency1 : key.currency0;
        if (unspecified < 0) unspecified = -unspecified;
        if (unspecified == 0) return (AFTER_SWAP_SELECTOR, 0);
        uint256 out = uint256(uint128(unspecified));

        uint256 toBurn; uint256 toCreator; uint256 toTreasury;
        if (currency == zzec) {
            toBurn = (out * burnBps) / BPS; toCreator = (out * creatorBps) / BPS; toTreasury = (out * treasuryBps) / BPS;
        } else {
            // token output: the burn's share is split evenly between creator and treasury
            uint256 half = (out * burnBps) / BPS / 2;
            toCreator = (out * creatorBps) / BPS + half; toTreasury = (out * treasuryBps) / BPS + half;
        }
        uint256 total = toBurn + toCreator + toTreasury;
        if (total == 0) return (AFTER_SWAP_SELECTOR, 0);
        IPoolManagerTakeZ pm = IPoolManagerTakeZ(poolManager);
        if (toBurn != 0) pm.take(currency, furnace, toBurn);
        if (toCreator != 0) pm.take(currency, creator, toCreator);
        if (toTreasury != 0) pm.take(currency, treasury, toTreasury);
        emit FeeTaken(id, currency, toBurn, toCreator, toTreasury);
        return (AFTER_SWAP_SELECTOR, int128(uint128(total)));
    }

    function _amount0(int256 d) private pure returns (int128 a) { assembly { a := sar(128, d) } }
    function _amount1(int256 d) private pure returns (int128 a) { assembly { a := signextend(15, d) } }

    fallback() external { revert HookNotImplemented(); }
}
