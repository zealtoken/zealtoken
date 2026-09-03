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

import {IV2FeeEscrow} from "../ZealTap.sol";

/// @dev Behaves like Pons V2FeeEscrow: credits are keyed by recipient, and
///      claim() / claimToken() pay msg.sender only, reverting on zero.
contract MockV2FeeEscrow is IV2FeeEscrow {
    error NoBalance();
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public balanceOfToken;

    function credit(address recipient) external payable { balanceOf[recipient] += msg.value; }
    function creditToken(address recipient, address token, uint256 amount) external {
        MockERC20(token).transferFrom(msg.sender, address(this), amount);
        balanceOfToken[recipient][token] += amount;
    }
    function claim() external returns (uint256 amount) {
        amount = balanceOf[msg.sender];
        if (amount == 0) revert NoBalance();
        balanceOf[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "send");
    }
    function claimToken(address token) external returns (uint256 amount) {
        amount = balanceOfToken[msg.sender][token];
        if (amount == 0) revert NoBalance();
        balanceOfToken[msg.sender][token] = 0;
        MockERC20(token).transfer(msg.sender, amount);
    }
}

/// @dev Pons V2MemeHook stand-in: pending fees credited to the escrow on sweep; creator-gated like the real one.
contract MockMemeHook {
    error NotFeeSweepOperator();
    MockV2FeeEscrow public immutable escrow;
    address public operator;
    mapping(bytes32 => address) public creator;
    mapping(bytes32 => uint256) public pending;

    constructor(MockV2FeeEscrow escrow_, address operator_) { escrow = escrow_; operator = operator_; }
    function register(bytes32 poolId, address creator_) external { creator[poolId] = creator_; }
    function setCreatorFeeRecipient(bytes32 poolId, address newRecipient) external { creator[poolId] = newRecipient; }
    function accrue(bytes32 poolId) external payable { pending[poolId] += msg.value; }
    function sweepPoolFees(bytes32 poolId, uint256, uint256) external {
        if (msg.sender != operator && msg.sender != creator[poolId]) revert NotFeeSweepOperator();
        uint256 amt = pending[poolId];
        pending[poolId] = 0;
        escrow.credit{value: amt}(creator[poolId]);
    }
}

/// @dev Pons V2 launch factory stand-in: recipient transfer only by the current recipient.
contract MockPonsFactory {
    error NotCreatorFeeRecipient();
    MockMemeHook public immutable hook;
    mapping(address => address) public creatorFeeRecipient;
    mapping(address => bytes32) public poolOf;
    mapping(address => bool) public buybackEnabled;

    constructor(MockMemeHook hook_) { hook = hook_; }
    function register(address token, bytes32 poolId, address recipient) external {
        creatorFeeRecipient[token] = recipient; poolOf[token] = poolId; hook.register(poolId, recipient);
    }
    function transferCreatorFeeRecipient(address token, address newRecipient) external {
        if (msg.sender != creatorFeeRecipient[token]) revert NotCreatorFeeRecipient();
        creatorFeeRecipient[token] = newRecipient;
        hook.setCreatorFeeRecipient(poolOf[token], newRecipient);
    }
    function setBuybackEnabled(address token, bool enabled) external {
        if (msg.sender != creatorFeeRecipient[token]) revert NotCreatorFeeRecipient();
        buybackEnabled[token] = enabled;
    }
}
