// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "./ZealFurnaceV4.sol";
import {TickMath} from "./zealz/lib/TickMath.sol";

interface ILpPositionManager {
    function ownerOf(uint256) external view returns (address);
    function getPoolAndPositionInfo(uint256) external view returns (PoolKey memory, uint256);
    function getPositionLiquidity(uint256) external view returns (uint128);
    function modifyLiquidities(bytes calldata, uint256) external payable;
}
interface ILpStateView { function getSlot0(bytes32) external view returns (uint160,int24,uint24,uint24); }
interface ILpPermit2 { function approve(address,address,uint160,uint48) external; }

/// @notice Reinvests all of ONE wallet-owned position's fees. The NFT stays with its owner.
/// @dev No arbitrary calls, NFT transfers, principal decreases, or owner-wallet token pulls.
///      Approval is per NFT and revocable on PositionManager. Unused fee funds remain withdrawable.
contract ZealLpReinvest is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant Q96 = 1 << 96;
    uint256 public constant REINVEST_BPS = 10000;
    ILpPositionManager public immutable positionManager;
    ILpStateView public immutable stateView;
    ILpPermit2 public immutable permit2;
    IERC20 public immutable token;
    address public immutable beneficiary;
    address public immutable operator;
    uint256 public immutable tokenId;
    bytes32 public immutable poolId;
    int24 public immutable tickLower;
    int24 public immutable tickUpper;
    uint256 public budget0;
    uint256 public budget1;
    uint256 public totalAdded;
    bool public paused;

    event FeesSplit(uint256 fee0, uint256 fee1, uint256 retained0, uint256 retained1);
    event Reinvested(uint256 liquidity, uint256 used0, uint256 used1);
    event Paused(bool value);
    event FeesWithdrawn(uint256 amount0, uint256 amount1);
    error NotAllowed();
    error InvalidPosition();
    error InvalidQuote();
    error SendFailed();

    constructor(address pm, address sv, address p2, uint256 id, address owner, address bot, bytes32 expectedPool) {
        require(pm != address(0) && sv != address(0) && p2 != address(0) && owner != address(0) && bot != address(0));
        positionManager = ILpPositionManager(pm); stateView = ILpStateView(sv); permit2 = ILpPermit2(p2);
        if (positionManager.ownerOf(id) != owner) revert InvalidPosition();
        (PoolKey memory key, uint256 info) = positionManager.getPoolAndPositionInfo(id);
        if (key.currency0 != address(0) || key.currency1 == address(0) || keccak256(abi.encode(key)) != expectedPool) revert InvalidPosition();
        token = IERC20(key.currency1); tokenId = id; beneficiary = owner; operator = bot; poolId = expectedPool;
        tickLower = int24(uint24(info >> 8)); tickUpper = int24(uint24(info >> 32));
    }
    receive() external payable {}
    modifier allowed() {
        if ((msg.sender != operator && msg.sender != beneficiary) || paused) revert NotAllowed();
        if (positionManager.ownerOf(tokenId) != beneficiary) revert InvalidPosition();
        _;
    }
    function setPaused(bool value) external {
        if (msg.sender != beneficiary) revert NotAllowed();
        paused = value; emit Paused(value);
    }
    /// @notice Only uninvested funds held here are withdrawn; the NFT is never touched.
    function withdrawFees() external nonReentrant {
        if (msg.sender != beneficiary) revert NotAllowed();
        budget0 = 0; budget1 = 0;
        uint256 a = address(this).balance; uint256 b = token.balanceOf(address(this));
        _pay(a,b); emit FeesWithdrawn(a,b);
    }
    /// @notice Use eth_call for a fee preview. Executing allocates all newly collected fees to reinvestment.
    function collect() external nonReentrant allowed returns (uint256 fee0, uint256 fee1, uint256 available0, uint256 available1) {
        (fee0,fee1) = _collect(); return (fee0,fee1,budget0,budget1);
    }
    /// @notice Bounds and minimum liquidity must come from a fresh off-chain reference/quote.
    ///         Reverts the whole collection if price or liquidity protection fails.
    function compound(uint160 minSqrt, uint160 maxSqrt, uint128 minLiquidity, uint256 deadline)
        external nonReentrant allowed returns (uint256 added, uint256 used0, uint256 used1)
    {
        if (deadline < block.timestamp || deadline > block.timestamp + 120 || minLiquidity == 0 || minSqrt == 0 || minSqrt > maxSqrt) revert InvalidQuote();
        (uint160 sqrt,,,) = stateView.getSlot0(poolId);
        if (sqrt < minSqrt || sqrt > maxSqrt) revert InvalidQuote();
        uint128 beforeL = positionManager.getPositionLiquidity(tokenId);
        if (beforeL == 0) revert InvalidPosition();
        _collect();
        added = _liquidity(sqrt, budget0, budget1);
        // Rounding buffer: never spend more than the available fee budgets.
        added = added * 9995 / 10000;
        if (added < minLiquidity || added > type(uint128).max || budget0 > type(uint128).max || budget1 > type(uint128).max) revert InvalidQuote();
        uint256 b0 = address(this).balance; uint256 b1 = token.balanceOf(address(this));
        token.forceApprove(address(permit2), budget1);
        permit2.approve(address(token),address(positionManager),uint160(budget1),uint48(block.timestamp + 120));
        bytes[] memory p = new bytes[](3);
        p[0] = abi.encode(tokenId,added,uint128(budget0),uint128(budget1),bytes(""));
        p[1] = abi.encode(address(0),address(token));
        p[2] = abi.encode(address(0),address(this));
        positionManager.modifyLiquidities{value:budget0}(abi.encode(hex"000d14",p),deadline);
        // Same transaction: no intervening swaps between collection and increase.
        used0 = b0 - address(this).balance; used1 = b1 - token.balanceOf(address(this));
        budget0 -= used0; budget1 -= used1;
        token.forceApprove(address(permit2),0);
        permit2.approve(address(token),address(positionManager),0,0);
        if (uint256(positionManager.getPositionLiquidity(tokenId)) != uint256(beforeL) + added) revert InvalidPosition();
        totalAdded += added; emit Reinvested(added,used0,used1);
    }
    function _collect() private returns (uint256 f0,uint256 f1) {
        uint256 b0 = address(this).balance; uint256 b1 = token.balanceOf(address(this));
        uint128 beforeL = positionManager.getPositionLiquidity(tokenId);
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(tokenId,uint256(0),uint128(0),uint128(0),bytes(""));
        p[1] = abi.encode(address(0),address(token),address(this));
        positionManager.modifyLiquidities(abi.encode(hex"0111",p),block.timestamp);
        if (positionManager.getPositionLiquidity(tokenId) != beforeL) revert InvalidPosition();
        f0 = address(this).balance - b0; f1 = token.balanceOf(address(this)) - b1;
        uint256 r0 = f0 * REINVEST_BPS / 10000; uint256 r1 = f1 * REINVEST_BPS / 10000;
        budget0 += r0; budget1 += r1;
        _pay(f0-r0,f1-r1); emit FeesSplit(f0,f1,r0,r1);
    }
    function _pay(uint256 a,uint256 b) private {
        if (a != 0) { (bool ok,) = beneficiary.call{value:a}(""); if (!ok) revert SendFailed(); }
        if (b != 0) token.safeTransfer(beneficiary,b);
    }
    function _liquidity(uint160 sqrt,uint256 a0,uint256 a1) private view returns (uint256) {
        uint160 low = TickMath.getSqrtPriceAtTick(tickLower); uint160 high = TickMath.getSqrtPriceAtTick(tickUpper);
        // This service only adds two-sided liquidity while the position is in range.
        if (sqrt <= low || sqrt >= high) revert InvalidQuote();
        uint256 l0 = Math.mulDiv(a0,Math.mulDiv(sqrt,high,Q96),uint256(high)-sqrt);
        uint256 l1 = Math.mulDiv(a1,Q96,uint256(sqrt)-low);
        return Math.min(l0,l1);
    }
}
