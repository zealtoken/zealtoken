// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolKey, SwapParams, IPoolManager} from "../ZealFurnaceV4.sol";

/// @dev Test-only: the smallest possible v4 swap router. Exact-input single swap, settles the input from
///      the caller (pre-transferred here), takes the output to the caller. Used on forks to exercise pools
///      without the Universal Router's own checks in the way.
contract TestSwapRouter {
    IPoolManager public immutable pm;
    constructor(IPoolManager pm_) { pm = pm_; }
    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint160 limit) external returns (int256 delta) {
        return swap(key, zeroForOne, -int256(amountIn), limit);
    }
    /// @dev amountSpecified < 0 = exact input, > 0 = exact output (v4 convention).
    function swap(PoolKey calldata key, bool zeroForOne, int256 amountSpecified, uint160 limit) public returns (int256 delta) {
        bytes memory r = pm.unlock(abi.encode(msg.sender, key, zeroForOne, amountSpecified, limit));
        delta = abi.decode(r, (int256));
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(pm), "pm");
        (address user, PoolKey memory key, bool zeroForOne, int256 amountSpecified, uint160 limit) = abi.decode(data, (address, PoolKey, bool, int256, uint160));
        int256 d = pm.swap(key, SwapParams(zeroForOne, amountSpecified, limit), "");
        int128 a0 = int128(d >> 128); int128 a1 = int128(d);
        address inC = zeroForOne ? key.currency0 : key.currency1; address outC = zeroForOne ? key.currency1 : key.currency0;
        int128 inAmt = zeroForOne ? a0 : a1; int128 outAmt = zeroForOne ? a1 : a0;
        if (inAmt < 0) { pm.sync(inC); IERC20(inC).transferFrom(user, address(pm), uint256(uint128(-inAmt))); pm.settle(); }
        if (outAmt > 0) pm.take(outC, user, uint256(uint128(outAmt)));
        return abi.encode(d);
    }
}
