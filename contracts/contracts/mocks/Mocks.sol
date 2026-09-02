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
