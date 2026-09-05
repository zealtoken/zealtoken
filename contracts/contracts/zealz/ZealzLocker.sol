// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey} from "../ZealFurnaceV4.sol";

interface IPositionManagerZ {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, uint256);
}

/**
 * @title ZealzLocker
 * @notice Holds every launch's initial liquidity position forever. The only thing
 *         it can do with a position is collect its LP fees to the treasury.
 *         There is no withdraw, no transfer, no decrease, no owner.
 */
contract ZealzLocker is IERC721Receiver, ReentrancyGuard {
    uint8 private constant ACTION_DECREASE_LIQUIDITY = 0x01;
    uint8 private constant ACTION_TAKE_PAIR = 0x11;

    IPositionManagerZ public immutable positionManager;
    address public immutable factory;
    address public immutable treasury;

    uint256[] public positionIds;
    mapping(uint256 tokenId => bool) public locked;

    event Locked(uint256 indexed tokenId, bytes32 indexed poolId);
    event FeesCollected(uint256 indexed tokenId, address indexed caller);

    error NotPositionManager();
    error NotFactoryDeposit();
    error NotLocked();
    error ZeroAddress();

    constructor(IPositionManagerZ positionManager_, address factory_, address treasury_) {
        if (address(positionManager_) == address(0) || factory_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        positionManager = positionManager_; factory = factory_; treasury = treasury_;
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

    /// @notice Collect a locked position's LP fees to the treasury. Anyone may call. Liquidity is untouched.
    function collect(uint256 tokenId) external nonReentrant {
        if (!locked[tokenId]) revert NotLocked();
        (PoolKey memory key,) = positionManager.getPoolAndPositionInfo(tokenId);
        bytes memory actions = abi.encodePacked(ACTION_DECREASE_LIQUIDITY, ACTION_TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1, treasury);
        positionManager.modifyLiquidities(abi.encode(actions, params), block.timestamp);
        emit FeesCollected(tokenId, msg.sender);
    }
}
