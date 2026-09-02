// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ZealFoundry} from "../ZealFoundry.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _decimals = d;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev A sink that tries to re-enter route() when it receives native ETH.
contract ReentrantSink {
    ZealFoundry public foundry;
    bool private attacked;

    function arm(ZealFoundry f) external {
        foundry = f;
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            foundry.routeNative();
        }
    }
}

/// @dev A sink that simply rejects native ETH.
contract RejectingSink {
    receive() external payable {
        revert("nope");
    }
}

import {ISwapRouter} from "../ZealFurnace.sol";

/// @dev A V3-shaped router that pays out `rate` ZEAL per unit in, and honours
///      amountOutMinimum by reverting, exactly like the real one.
contract MockRouter is ISwapRouter {
    MockERC20 public immutable zealOut;
    uint256 public rate; // out per in, in whole units

    constructor(MockERC20 zeal_, uint256 rate_) {
        zealOut = zeal_;
        rate = rate_;
    }

    function setRate(uint256 r) external {
        rate = r;
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 amountOut) {
        address tokenIn = address(bytes20(p.path[:20]));
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn * rate;
        require(amountOut >= p.amountOutMinimum, "Too little received");
        zealOut.mint(p.recipient, amountOut);
    }
}
