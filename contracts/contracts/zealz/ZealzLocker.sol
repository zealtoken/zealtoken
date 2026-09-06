// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "../ZealFurnaceV4.sol";
import {TickMath} from "./lib/TickMath.sol";

interface IPositionManagerZ {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, uint256);
}
interface IPoolManagerSlotZ { function extsload(bytes32 slot) external view returns (bytes32); }
interface IPermit2Z { function approve(address token, address spender, uint160 amount, uint48 expiration) external; }

/**
 * @title ZealzLocker
 * @notice Holds every launch's liquidity position forever, and makes it grow.
 *
 * @dev The floor only goes up. Anyone can call compound(): it collects the
 *      position's accrued LP fees into this contract and adds them straight back
 *      as liquidity in the same range. Nothing can decrease a position, transfer
 *      it, or send its fees anywhere else. There is no owner. Fees in a currency
 *      the current price cannot use yet simply wait here for a later compound.
 */
contract ZealzLocker is IERC721Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 private constant ACTION_INCREASE_LIQUIDITY = 0x00;
    uint8 private constant ACTION_DECREASE_LIQUIDITY = 0x01;
    uint8 private constant ACTION_SETTLE_PAIR = 0x0d;
    uint8 private constant ACTION_TAKE_PAIR = 0x11;
    bytes32 private constant POOLS_SLOT = bytes32(uint256(6));
    uint256 private constant Q96 = 1 << 96;

    IPositionManagerZ public immutable positionManager;
    IPoolManagerSlotZ public immutable poolManager;
    IPermit2Z public immutable permit2;
    address public immutable factory;

    uint256[] public positionIds;
    mapping(uint256 tokenId => bool) public locked;
    mapping(uint256 tokenId => uint256) public compoundedLiquidity; // lifetime liquidity added back

    event Locked(uint256 indexed tokenId, bytes32 indexed poolId);
    event Compounded(uint256 indexed tokenId, address indexed caller, uint256 liquidityAdded, uint256 amount0, uint256 amount1);

    error NotPositionManager();
    error NotFactoryDeposit();
    error NotLocked();
    error ZeroAddress();
    error NothingToCompound();

    constructor(IPositionManagerZ positionManager_, IPoolManagerSlotZ poolManager_, IPermit2Z permit2_, address factory_) {
        if (address(positionManager_) == address(0) || address(poolManager_) == address(0) || address(permit2_) == address(0) || factory_ == address(0)) revert ZeroAddress();
        positionManager = positionManager_; poolManager = poolManager_; permit2 = permit2_; factory = factory_;
    }

    function positionCount() external view returns (uint256) { return positionIds.length; }

    /// @dev Only the factory may lock positions here, via safeTransferFrom.
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        if (from != factory) revert NotFactoryDeposit();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        locked[tokenId] = true;
        positionIds.push(tokenId);
        emit Locked(tokenId, keccak256(abi.encode(key)));
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Collect a position's LP fees and add them back as liquidity. Anyone may call.
    function compound(uint256 tokenId) external nonReentrant {
        if (!locked[tokenId]) revert NotLocked();
        (PoolKey memory key, uint256 info) = positionManager.getPoolAndPositionInfo(tokenId);
        // 1. collect: a zero decrease pays accrued fees to this contract
        {
            bytes[] memory p = new bytes[](2);
            p[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
            p[1] = abi.encode(key.currency0, key.currency1, address(this));
            positionManager.modifyLiquidities(abi.encode(abi.encodePacked(ACTION_DECREASE_LIQUIDITY, ACTION_TAKE_PAIR), p), block.timestamp);
        }
        uint256 bal0 = IERC20(key.currency0).balanceOf(address(this));
        uint256 bal1 = IERC20(key.currency1).balanceOf(address(this));
        // 2. how much liquidity those balances buy in this position's range at the current price
        int24 tickLower = int24(uint24(info >> 8));
        int24 tickUpper = int24(uint24(info >> 32));
        uint160 sA = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 sB = TickMath.getSqrtPriceAtTick(tickUpper);
        uint160 sP = uint160(uint256(poolManager.extsload(keccak256(abi.encodePacked(keccak256(abi.encode(key)), POOLS_SLOT)))));
        uint256 liquidity = _liquidityFor(sP, sA, sB, bal0, bal1);
        if (liquidity == 0) revert NothingToCompound();
        // 3. add it back, paying from the balances held here
        _approve(key.currency0, bal0);
        _approve(key.currency1, bal1);
        bytes[] memory q = new bytes[](2);
        q[0] = abi.encode(tokenId, liquidity, uint128(bal0), uint128(bal1), bytes(""));
        q[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(abi.encodePacked(ACTION_INCREASE_LIQUIDITY, ACTION_SETTLE_PAIR), q), block.timestamp);
        compoundedLiquidity[tokenId] += liquidity;
        emit Compounded(tokenId, msg.sender, liquidity, bal0 - IERC20(key.currency0).balanceOf(address(this)), bal1 - IERC20(key.currency1).balanceOf(address(this)));
    }

    /// @dev LiquidityAmounts.getLiquidityForAmounts, with a hair of headroom so rounding never overdraws.
    function _liquidityFor(uint160 sP, uint160 sA, uint160 sB, uint256 amt0, uint256 amt1) private pure returns (uint256 l) {
        if (sP <= sA) l = amt0 == 0 ? 0 : Math.mulDiv(Math.mulDiv(amt0, sA, Q96), sB, sB - sA);
        else if (sP >= sB) l = amt1 == 0 ? 0 : Math.mulDiv(amt1, Q96, sB - sA);
        else {
            uint256 l0 = amt0 == 0 ? 0 : Math.mulDiv(Math.mulDiv(amt0, sP, Q96), sB, sB - sP);
            uint256 l1 = amt1 == 0 ? 0 : Math.mulDiv(amt1, Q96, sP - sA);
            l = l0 < l1 ? l0 : l1;
        }
        l = (l * 9990) / 10_000;
    }

    function _approve(address t, uint256 amount) private {
        if (amount == 0) return;
        IERC20(t).forceApprove(address(permit2), amount);
        permit2.approve(t, address(positionManager), uint160(amount), uint48(block.timestamp + 1 hours));
    }
}
