// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "../ZealFurnaceV4.sol";
import {ZealzToken} from "./ZealzToken.sol";
import {TickMath} from "./lib/TickMath.sol";

interface IZealzHook { function furnace() external view returns (address); function register(PoolKey calldata key, address token, address creator, bool batchOpening, uint16 totalBps, uint16 burnBps, uint16 creatorBps) external; }
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
 * @notice zealz.fun: launch a token paired with zZEC, straight into a locked Uniswap v4 pool,
 *         with no capital from the creator.
 *
 * @dev The liquidity IS the supply. The whole fixed supply goes into one locked
 *      position whose price range sits entirely above the opening price, so it
 *      holds only the token. The first buyer's zZEC enters that position and takes
 *      tokens out of the bottom of the range; every buy walks the price up the
 *      range and leaves more zZEC locked behind it; sells walk it back down. That is
 *      a bonding curve, except it lives inside the locked Uniswap position from the
 *      first second: no curve contract, no graduation, no moment where anyone holds
 *      the funds. The creator receives no tokens and earns from the hook instead.
 *
 *      Two curve shapes: GENTLE (a wide range, price rises slowly per zZEC) and
 *      STEEP (a narrower range). Opening ticks are set at deployment for both
 *      currency orderings, since a token's address may sort above or below zZEC.
 */
contract ZealzFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 private constant MINT_POSITION = 0x02;
    uint8 private constant SETTLE_PAIR = 0x0d;
    uint256 private constant Q96 = 1 << 96;

    uint256 public constant SUPPLY = 1_000_000_000e18;
    uint24 public constant LP_FEE = 3000;
    int24 public constant TICK_SPACING = 60;
    /// @dev Range widths in ticks. Gentle spans ~1,000,000x in price; steep ~1,000x.
    int24 public constant GENTLE_WIDTH = 138_000;
    int24 public constant STEEP_WIDTH = 69_000;

    enum Curve { Gentle, Steep }
    /// @notice Batch: the first ten minutes are a bid window settled at one price. Instant: trading from the first block.
    enum Opening { Batch, Instant }

    IPositionManagerF public immutable positionManager;
    IPermit2F public immutable permit2;
    address public immutable zzec;
    address public immutable hook;
    address public immutable treasury;
    address public immutable deployer;
    /// @notice Launch fee in zZEC (8 decimals), paid to treasury. Every creator goes through the wrapper.
    uint256 public immutable launchFeeZats;
    /// @notice Opening tick when the token is currency0 (price = zZEC per token) and when it is currency1 (price = token per zZEC).
    int24 public immutable openTickToken0;
    int24 public immutable openTickToken1;

    address public locker; // set once, right after deployment

    struct Launch { address token; address creator; bytes32 poolId; uint256 positionId; Curve curve; Opening opening; uint64 at; uint16 totalBps; uint16 burnBps; uint16 creatorBps; }
    Launch[] public launches;
    mapping(address token => uint256 index) public indexOf; // index + 1

    event Launched(uint256 indexed index, address indexed token, address indexed creator, bytes32 poolId, uint256 positionId, uint8 curve, uint8 opening, uint16 totalBps, uint16 burnBps, uint16 creatorBps);
    event LockerSet(address locker);

    error ZeroAddress();
    error LockerAlreadySet();
    error NotDeployer();
    error LockerUnset();
    error PositionNotLocked();
    error BadTick();

    address public immutable poolManager;

    constructor(IPositionManagerF positionManager_, IPermit2F permit2_, address poolManager_, address zzec_, address hook_, address treasury_, uint256 launchFeeZats_, int24 openTickToken0_, int24 openTickToken1_) {
        if (address(positionManager_) == address(0) || address(permit2_) == address(0) || zzec_ == address(0) || hook_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (openTickToken0_ % TICK_SPACING != 0 || openTickToken1_ % TICK_SPACING != 0) revert BadTick();
        if (openTickToken0_ + GENTLE_WIDTH > TickMath.MAX_TICK || openTickToken1_ - GENTLE_WIDTH < TickMath.MIN_TICK) revert BadTick();
        if (poolManager_ == address(0)) revert ZeroAddress();
        positionManager = positionManager_; permit2 = permit2_; poolManager = poolManager_; zzec = zzec_; hook = hook_; treasury = treasury_;
        launchFeeZats = launchFeeZats_; deployer = msg.sender;
        openTickToken0 = openTickToken0_; openTickToken1 = openTickToken1_;
    }

    function setLocker(address locker_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (locker != address(0)) revert LockerAlreadySet();
        if (locker_ == address(0)) revert ZeroAddress();
        locker = locker_;
        emit LockerSet(locker_);
    }

    function launchCount() external view returns (uint256) { return launches.length; }

    /// @notice The range a launch will use, for the site to show before anyone signs.
    function rangeFor(address token, Curve curve) public view returns (int24 tickLower, int24 tickUpper, bool tokenIs0) {
        tokenIs0 = token < zzec;
        int24 width = curve == Curve.Gentle ? GENTLE_WIDTH : STEEP_WIDTH;
        if (tokenIs0) { tickLower = openTickToken0; tickUpper = openTickToken0 + width; }
        else { tickUpper = openTickToken1; tickLower = openTickToken1 - width; }
    }

    /**
     * @notice Launch. Pay the launch fee; bring nothing else. The whole supply becomes a
     *         locked single-sided position and the pool opens at the bottom of it.
     */
    /// @param totalBps the whole fee on every trade's zZEC leg, 50 (0.5%) to 500 (5%).
    /// @param burnBps share to the Furnace (at least 25 = 0.25%).
    /// @param creatorBps share to you (at most 50 = 0.5%). The platform keeps 0.25%; the rest goes to holders as claimable zZEC dividends.
    function launch(string calldata name, string calldata symbol, string calldata metadataURI, Curve curve, Opening opening, uint16 totalBps, uint16 burnBps, uint16 creatorBps)
        external nonReentrant returns (address token, bytes32 poolId, uint256 positionId)
    {
        if (locker == address(0)) revert LockerUnset();
        if (launchFeeZats != 0) IERC20(zzec).safeTransferFrom(msg.sender, treasury, launchFeeZats);

        token = _mintToken(name, symbol, metadataURI);
        PoolKey memory key;
        (key, positionId) = _openAndSeed(token, curve, opening, totalBps, burnBps, creatorBps);
        _sweep(token);
        poolId = keccak256(abi.encode(key));
        launches.push(Launch(token, msg.sender, poolId, positionId, curve, opening, uint64(block.timestamp), totalBps, burnBps, creatorBps));
        indexOf[token] = launches.length;
        emit Launched(launches.length - 1, token, msg.sender, poolId, positionId, uint8(curve), uint8(opening), totalBps, burnBps, creatorBps);
    }


    /// @dev Register, initialize at the range edge, mint the single-sided position, and lock it.
    function _openAndSeed(address token, Curve curve, Opening opening, uint16 totalBps, uint16 burnBps, uint16 creatorBps) private returns (PoolKey memory key, uint256 positionId) {
        (int24 tl, int24 tu, bool tokenIs0) = rangeFor(token, curve);
        key = PoolKey(tokenIs0 ? token : zzec, tokenIs0 ? zzec : token, LP_FEE, TICK_SPACING, hook);
        IZealzHook(hook).register(key, token, msg.sender, opening == Opening.Batch, totalBps, burnBps, creatorBps);
        uint160 sA = TickMath.getSqrtPriceAtTick(tl);
        uint160 sB = TickMath.getSqrtPriceAtTick(tu);
        // Open exactly at the edge that makes the position 100% token: at tickLower when the token is
        // currency0 (range above the price), at tickUpper when it is currency1 (range below).
        positionManager.initializePool(key, tokenIs0 ? sA : sB);
        uint256 liquidity = _seedLiquidity(tokenIs0, sA, sB);
        _approve(token, SUPPLY);
        positionId = positionManager.nextTokenId();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, tl, tu, liquidity, uint128(tokenIs0 ? SUPPLY : 0), uint128(tokenIs0 ? 0 : SUPPLY), address(this), bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        positionManager.modifyLiquidities(abi.encode(abi.encodePacked(MINT_POSITION, SETTLE_PAIR), params), block.timestamp);
        if (IERC721OwnerF(address(positionManager)).ownerOf(positionId) != address(this)) revert PositionNotLocked();
        positionManager.safeTransferFrom(address(this), locker, positionId);
    }

    /// @dev Liquidity the whole supply provides across [sA, sB] on one side, a hair under so rounding never overdraws.
    function _seedLiquidity(bool tokenIs0, uint160 sA, uint160 sB) private pure returns (uint256 liquidity) {
        liquidity = tokenIs0
            ? Math.mulDiv(Math.mulDiv(SUPPLY, sA, Q96), sB, sB - sA) // amount0 = L (sB - sA) / (sA sB) * Q96
            : Math.mulDiv(SUPPLY, Q96, sB - sA); // amount1 = L (sB - sA) / Q96
        liquidity = (liquidity * 9999) / 10_000;
    }

    /// @dev Its own frame: the token constructor takes nine arguments and launch() is already deep.
    function _mintToken(string calldata name, string calldata symbol, string calldata metadataURI) private returns (address) {
        return address(new ZealzToken(name, symbol, metadataURI, SUPPLY, address(this), ZealzToken.Wiring(zzec, hook, poolManager, IZealzHook(hook).furnace())));
    }

    /// @dev Rounding dust of the supply goes to the treasury; nothing stays here.
    function _sweep(address token) private {
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust != 0) IERC20(token).safeTransfer(treasury, dust);
    }

    function _approve(address t, uint256 amount) private {
        IERC20(t).forceApprove(address(permit2), amount);
        permit2.approve(t, address(positionManager), uint160(amount), uint48(block.timestamp + 1 hours));
    }

    receive() external payable {}
}
