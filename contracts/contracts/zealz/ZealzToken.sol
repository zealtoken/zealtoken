// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A launched token: fixed supply, minted once to the factory, no owner, no hooks, no tax.
contract ZealzToken is ERC20 {
    string public metadataURI;
    address public immutable factory;

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, uint256 supply, address to) ERC20(name_, symbol_) {
        factory = msg.sender;
        metadataURI = metadataURI_;
        _mint(to, supply);
    }
}
