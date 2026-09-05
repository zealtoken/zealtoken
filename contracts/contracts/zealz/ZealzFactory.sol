// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolKey} from "../ZealFurnaceV4.sol";
import {ZealzToken} from "./ZealzToken.sol";

interface IZealzHook { function register(PoolKey calldata key, address token, address creator) external; }
interface IPositionManagerF {
    function initializePool(PoolKey calldata key, uint160 sqrtPriceX96) external payable returns (int24);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}
interface IPermit2F { function approve(address token, address spender, uint160 amount, uint48 expiration) external; }
interface IERC721OwnerF { function ownerOf(uint256) external view returns (address); }

/**
 * @title ZealzFactory
 * @notice zealz.fun: launch a token paired with zZEC, straight into a locked Uniswap v4 pool.
 *
 * @dev One call does everything: mint the fixed supply, open the TOKEN/zZEC pool
 *      with the zealz hook, seed it with the ENTIRE supply against the creator's
 *      zZEC, and lock the position in the Locker forever. No creator allocation,
 *      no owner on the token, no way to pull liquidity. The creator earns from the
 *      hook's fee share on every trade instead.
 */
contract ZealzFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 private constant MINT_POSITION = 0x02;
    uint8 private constant SETTLE_PAIR = 0x0d;
    int24 private constant MIN_USABLE_TICK = -887272;
    int24 private constant MAX_USABLE_TICK = 887272;

    uint256 public constant SUPPLY = 1_000_000_000e18;
    uint24 public constant LP_FEE = 3000;
    int24 public constant TICK_SPACING = 60;

    IPositionManagerF public immutable positionManager;
    IPermit2F public immutable permit2;
    address public immutable zzec;
    address public immutable hook;
    address public immutable treasury;
    address public immutable deployer;
    uint256 public immutable launchFeeWei;
    uint256 public immutable minZzecIn;

    address public locker; // set once, right after deployment

    struct Launch { address token; address creator; bytes32 poolId; uint256 positionId; uint256 zzecIn; uint64 at; }
    Launch[] public launches;
    mapping(address token => uint256 index) public indexOf; // index + 1

    /// @dev name/symbol/metadataURI are readable from the token contract itself.
    event Launched(uint256 indexed index, address indexed token, address indexed creator, bytes32 poolId, uint256 positionId, uint256 zzecIn);
    event LockerSet(address locker);

    error ZeroAddress();
    error LockerAlreadySet();
    error NotDeployer();
    error LockerUnset();
    error FeeNotPaid();
    error TooLittleZzec();
    error PositionNotLocked();

    constructor(IPositionManagerF positionManager_, IPermit2F permit2_, address zzec_, address hook_, address treasury_, uint256 launchFeeWei_, uint256 minZzecIn_) {
        if (address(positionManager_) == address(0) || address(permit2_) == address(0) || zzec_ == address(0) || hook_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        positionManager = positionManager_; permit2 = permit2_; zzec = zzec_; hook = hook_; treasury = treasury_;
        launchFeeWei = launchFeeWei_; minZzecIn = minZzecIn_; deployer = msg.sender;
    }

    function setLocker(address locker_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (locker != address(0)) revert LockerAlreadySet();
        if (locker_ == address(0)) revert ZeroAddress();
        locker = locker_;
        emit LockerSet(locker_);
    }

    function launchCount() external view returns (uint256) { return launches.length; }

    /**
     * @notice Launch. Pay the ETH launch fee and bring at least minZzecIn zZEC (approved to this contract).
     *         The whole supply and your zZEC become a locked full-range position.
     */
    function launch(string calldata name, string calldata symbol, string calldata metadataURI, uint256 zzecIn)
        external payable nonReentrant returns (address token, bytes32 poolId, uint256 positionId)
    {
        if (locker == address(0)) revert LockerUnset();
        if (msg.value != launchFeeWei) revert FeeNotPaid();
        if (zzecIn < minZzecIn) revert TooLittleZzec();

        token = address(new ZealzToken(name, symbol, metadataURI, SUPPLY, address(this)));
        IERC20(zzec).safeTransferFrom(msg.sender, address(this), zzecIn);

        PoolKey memory key = _openPool(token, zzecIn);
        positionId = _seedAndLock(key, token, zzecIn);
        _sweepDust(token);

        poolId = keccak256(abi.encode(key));
        launches.push(Launch(token, msg.sender, poolId, positionId, zzecIn, uint64(block.timestamp)));
        indexOf[token] = launches.length;
        emit Launched(launches.length - 1, token, msg.sender, poolId, positionId, zzecIn);
    }

    /// @dev Sort currencies, register with the hook, initialize the pool at zzecIn / SUPPLY.
    function _openPool(address token, uint256 zzecIn) private returns (PoolKey memory key) {
        bool tokenIs0 = token < zzec;
        key = PoolKey(tokenIs0 ? token : zzec, tokenIs0 ? zzec : token, LP_FEE, TICK_SPACING, hook);
        uint160 sqrtPriceX96 = tokenIs0 ? _sqrtPrice(SUPPLY, zzecIn) : _sqrtPrice(zzecIn, SUPPLY);
        IZealzHook(hook).register(key, token, msg.sender);
        positionManager.initializePool(key, sqrtPriceX96);
    }

    /// @dev Mint the full-range position with the whole supply and the creator's zZEC, then hand it to the Locker.
    function _seedAndLock(PoolKey memory key, address token, uint256 zzecIn) private returns (uint256 positionId) {
        _approve(token, SUPPLY);
        _approve(zzec, zzecIn);
        bool tokenIs0 = key.currency0 == token;
        (uint256 amt0, uint256 amt1) = tokenIs0 ? (SUPPLY, zzecIn) : (zzecIn, SUPPLY);
        uint160 sqrtPriceX96 = tokenIs0 ? _sqrtPrice(SUPPLY, zzecIn) : _sqrtPrice(zzecIn, SUPPLY);
        int24 tl = (MIN_USABLE_TICK / TICK_SPACING) * TICK_SPACING;
        int24 tu = (MAX_USABLE_TICK / TICK_SPACING) * TICK_SPACING;
        uint128 liquidity = _liquidityFor(sqrtPriceX96, amt0, amt1);

        positionId = positionManager.nextTokenId();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, tl, tu, uint256(liquidity), uint128(amt0), uint128(amt1), address(this), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(abi.encodePacked(MINT_POSITION, SETTLE_PAIR), params), block.timestamp);
        if (IERC721OwnerF(address(positionManager)).ownerOf(positionId) != address(this)) revert PositionNotLocked();
        positionManager.safeTransferFrom(address(this), locker, positionId);
    }

    /// @dev Rounding dust and the launch fee go to the treasury; nothing stays here.
    function _sweepDust(address token) private {
        uint256 dustT = IERC20(token).balanceOf(address(this));
        if (dustT != 0) IERC20(token).safeTransfer(treasury, dustT);
        uint256 dustZ = IERC20(zzec).balanceOf(address(this));
        if (dustZ != 0) IERC20(zzec).safeTransfer(treasury, dustZ);
        (bool ok,) = payable(treasury).call{value: msg.value}("");
        require(ok, "fee");
    }

    function _approve(address t, uint256 amount) private {
        IERC20(t).forceApprove(address(permit2), amount);
        permit2.approve(t, address(positionManager), uint160(amount), uint48(block.timestamp + 1 hours));
    }

    /// @dev sqrt(raw1/raw0) * 2^96, computed as sqrt(raw1 * 2^192 / raw0) to keep precision.
    function _sqrtPrice(uint256 raw0, uint256 raw1) private pure returns (uint160) {
        // raw1 << 192 can overflow for huge raw1; both inputs here are <= 1e27, so raw1 * 2^96 first then shift again is safe via mulDiv-free path
        uint256 ratioX192 = (raw1 << 96) / raw0 << 96; // = raw1 * 2^192 / raw0 with two shifts to stay in range
        return uint160(_sqrt(ratioX192));
    }

    function _liquidityFor(uint160 sqrtP, uint256 amt0, uint256 amt1) private pure returns (uint128) {
        uint256 sA = _sqrtAtTick(-1); uint256 sB = _sqrtAtTick(1); uint256 p = sqrtP;
        uint256 l0 = (amt0 * p / 2 ** 96) * sB / (sB - p);
        uint256 l1 = amt1 * 2 ** 96 / (p - sA);
        uint256 l = l0 < l1 ? l0 : l1;
        return uint128((l * 9995) / 10000);
    }

    /// @dev Full-range bounds only; a coarse sqrt(1.0001^tick) is fine there because sA ~ 0 and sB ~ huge relative to any live price.
    function _sqrtAtTick(int24 tick) private pure returns (uint256) {
        // exact TickMath values for ±887220 (tick spacing 60)
        if (tick < 0) return 4306310044; // sqrt(1.0001^-887220) * 2^96
        return 1457652066949847389969617340386294118487833376468; // sqrt(1.0001^887220) * 2^96
    }

    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2; y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    receive() external payable {}
}
