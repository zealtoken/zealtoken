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

import {PoolKey, SwapParams} from "../ZealFurnaceV4.sol";

interface IUnlockCallbackV4 { function unlockCallback(bytes calldata data) external returns (bytes memory); }

/// @dev Uniswap v4 PoolManager stand-in: constant-rate swaps, real settle/take accounting per currency.
contract MockPoolManagerV4 {
    /// out = in * rateNum / rateDen, keyed by keccak(poolKey)
    mapping(bytes32 => uint256) public rateNum;
    mapping(bytes32 => uint256) public rateDen;
    mapping(address => int256) public owed; // per currency, positive = caller owes the manager
    address private syncedCurrency;
    uint256 private syncedBalance;
    address private locker;

    mapping(bytes32 => uint160) public sqrtPrice;
    function setRate(PoolKey calldata key, uint256 num, uint256 den) external { bytes32 id = keccak256(abi.encode(key)); rateNum[id] = num; rateDen[id] = den; if (sqrtPrice[id] == 0) sqrtPrice[id] = 79228162514264337593543950336; }
    function setSqrtPrice(PoolKey calldata key, uint160 p) external { sqrtPrice[keccak256(abi.encode(key))] = p; }
    /// v4-core layout: slot0 for pools[poolId] at keccak(poolId . 6), sqrtPriceX96 in the low 160 bits.
    function extsload(bytes32 slot) external view returns (bytes32) { return bytes32(uint256(slotPrice[slot])); }
    mapping(bytes32 => uint160) private slotPrice;
    function initPool(PoolKey calldata key, uint160 p) external { bytes32 id = keccak256(abi.encode(key)); sqrtPrice[id] = p; slotPrice[keccak256(abi.encodePacked(id, bytes32(uint256(6))))] = p; }
    function fund(address token, uint256 amount) external { MockERC20(token).mint(address(this), amount); }
    receive() external payable {}

    function unlock(bytes calldata data) external returns (bytes memory r) {
        locker = msg.sender;
        r = IUnlockCallbackV4(msg.sender).unlockCallback(data);
        locker = address(0);
    }
    function swap(PoolKey memory key, SwapParams memory p, bytes calldata) external returns (int256 delta) {
        require(msg.sender == locker, "not unlocked");
        bytes32 id = keccak256(abi.encode(key));
        require(p.amountSpecified < 0, "exact in only");
        uint256 amtIn = uint256(-p.amountSpecified);
        uint256 amtOut = amtIn * rateNum[id] / rateDen[id];
        (address cin, address cout) = p.zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        owed[cin] += int256(amtIn);
        owed[cout] -= int256(amtOut);
        int128 a0 = p.zeroForOne ? -int128(int256(amtIn)) : int128(int256(amtOut));
        int128 a1 = p.zeroForOne ? int128(int256(amtOut)) : -int128(int256(amtIn));
        delta = int256(uint256(uint128(a0))) << 128 | int256(uint256(uint128(a1)));
        delta = (int256(a0) << 128) | int256(uint256(uint128(a1)));
    }
    function sync(address currency) external { syncedCurrency = currency; syncedBalance = currency == address(0) ? 0 : MockERC20(currency).balanceOf(address(this)); }
    function settle() external payable returns (uint256 paid) {
        if (syncedCurrency == address(0)) { paid = msg.value; }
        else { require(msg.value == 0, "NonzeroNativeValue"); paid = MockERC20(syncedCurrency).balanceOf(address(this)) - syncedBalance; }
        owed[syncedCurrency] -= int256(paid);
    }
    function take(address currency, address to, uint256 amount) external {
        owed[currency] += int256(amount);
        if (currency == address(0)) { (bool ok,) = payable(to).call{value: amount}(""); require(ok, "eth"); }
        else MockERC20(currency).transfer(to, amount);
    }
}

/// @dev PositionManager stand-in: hands the Furnace an NFT id, and pays preset fees on a zero decrease.
contract MockPositionManagerV4 {
    uint256 public feeEth;
    uint256 public feeToken;
    address public feeTokenAddr;
    bytes public lastUnlockData;
    mapping(uint256 => PoolKey) private poolOf;
    receive() external payable {}
    function setPositionPool(uint256 tokenId, PoolKey calldata key) external { poolOf[tokenId] = key; }
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, uint256) { return (poolOf[tokenId], 0); }
    function setFees(address token, uint256 tokenAmt, uint256 ethAmt) external { feeTokenAddr = token; feeToken = tokenAmt; feeEth = ethAmt; }
    function give(address to, uint256 tokenId) external { giveFrom(msg.sender, to, tokenId); }
    function giveFrom(address from, address to, uint256 tokenId) public { bytes4 sel = IERC721ReceiverLike(to).onERC721Received(msg.sender, from, tokenId, ""); require(sel == 0x150b7a02, "bad receiver"); }
    function modifyLiquidities(bytes calldata unlockData, uint256) external payable {
        lastUnlockData = unlockData;
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(actions.length == 2 && uint8(actions[0]) == 0x01 && uint8(actions[1]) == 0x11, "unexpected actions");
        (, uint256 liquidity,,,) = abi.decode(params[0], (uint256, uint256, uint128, uint128, bytes));
        require(liquidity == 0, "liquidity must be untouched");
        (,, address to) = abi.decode(params[1], (address, address, address));
        if (feeToken != 0) MockERC20(feeTokenAddr).mint(to, feeToken);
        if (feeEth != 0) { (bool ok,) = payable(to).call{value: feeEth}(""); require(ok, "eth"); }
    }
}
interface IERC721ReceiverLike { function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4); }
