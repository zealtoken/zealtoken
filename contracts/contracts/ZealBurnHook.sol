// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PoolKey, SwapParams} from "./ZealFurnaceV4.sol";

interface IPoolManagerTake {
    function take(address currency, address to, uint256 amount) external;
}

/**
 * @title ZealBurnHook
 * @notice Uniswap v4 hook for the zZEC/ETH market. Takes a fixed share of every
 *         swap's output and sends it straight to the Furnace, which turns it
 *         into burned $ZEAL. Liquidity providers keep the pool's LP fee; the
 *         burn takes its cut from traders regardless of who provides liquidity.
 *
 * @dev Only afterSwap is enabled (address flags 0x44: AFTER_SWAP and
 *      AFTER_SWAP_RETURNS_DELTA). The hook never holds funds: the cut is taken
 *      from the PoolManager directly to the Furnace inside the swap. The
 *      Furnace's own swaps are exempt so the burn does not tax itself.
 *      No owner, no setters, nothing to rotate: the share and the destination
 *      are immutable, like the Foundry's split.
 */
contract ZealBurnHook {
    uint256 private constant BPS = 10_000;
    bytes4 private constant AFTER_SWAP_SELECTOR = 0xb47b2fb1; // afterSwap(address,PoolKey,SwapParams,int256,bytes)

    address public immutable poolManager;
    address public immutable furnace;
    uint256 public immutable shareBps;

    uint256 public totalTaken0;
    uint256 public totalTaken1;

    event BurnShareTaken(address indexed currency, uint256 amount, address indexed swapper);

    error NotPoolManager();
    error ZeroAddress();
    error BadShare();
    error HookNotImplemented();

    constructor(address poolManager_, address furnace_, uint256 shareBps_) {
        if (poolManager_ == address(0) || furnace_ == address(0)) revert ZeroAddress();
        if (shareBps_ == 0 || shareBps_ > 2_000) revert BadShare(); // never more than 20%
        poolManager = poolManager_;
        furnace = furnace_;
        shareBps = shareBps_;
    }

    /// @dev v4 calls this after every swap in a pool that lists this hook. `sender` is whoever called
    ///      PoolManager.swap: the Furnace when it ignites (exempt), a router for everyone else.
    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata)
        external
        returns (bytes4, int128)
    {
        if (msg.sender != poolManager) revert NotPoolManager();
        if (sender == furnace) return (AFTER_SWAP_SELECTOR, 0);

        // The specified side is what the trader named; the cut comes from the other (unspecified) side.
        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        int128 unspecified = specifiedIsCurrency0 ? _amount1(delta) : _amount0(delta);
        address currency = specifiedIsCurrency0 ? key.currency1 : key.currency0;
        if (unspecified < 0) unspecified = -unspecified;
        if (unspecified == 0) return (AFTER_SWAP_SELECTOR, 0);

        uint256 fee = (uint256(uint128(unspecified)) * shareBps) / BPS;
        if (fee == 0) return (AFTER_SWAP_SELECTOR, 0);

        IPoolManagerTake(poolManager).take(currency, furnace, fee);
        if (currency == key.currency0) totalTaken0 += fee; else totalTaken1 += fee;
        emit BurnShareTaken(currency, fee, sender);
        // Positive return delta on the unspecified currency means the hook kept that much of the swap output.
        return (AFTER_SWAP_SELECTOR, int128(uint128(fee)));
    }

    function _amount0(int256 d) private pure returns (int128 a) { assembly { a := sar(128, d) } }
    function _amount1(int256 d) private pure returns (int128 a) { assembly { a := signextend(15, d) } }

    /// @dev Any other hook entry point is a configuration error; the address flags must only enable afterSwap.
    fallback() external { revert HookNotImplemented(); }
}
