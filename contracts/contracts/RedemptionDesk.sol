// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IZZECRedeem {
    function requestRedeem(uint256 amount, string calldata zcashAddress) external returns (uint256 id);
}

/**
 * @title RedemptionDesk
 * @notice The way out of zZEC that cannot leave a holder with nothing.
 *
 * @dev ZZEC.requestRedeem burns first and trusts the operator to pay. This desk
 *      inverts the order: a holder escrows zZEC here with a Zcash address; the
 *      operator pays native ZEC, then calls fulfill() with the Zcash txid, and only
 *      then is the escrowed zZEC burned (via ZZEC.requestRedeem, which records it
 *      on the wrapper too). If nothing happens for WINDOW, the holder takes their
 *      zZEC back. No permission needed, no pause on that path, ever.
 *
 *      The desk never sends zZEC anywhere except back to its depositor or into
 *      the burn. The operator cannot touch escrowed tokens except by burning them
 *      against a recorded payout.
 */
contract RedemptionDesk is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant WINDOW = 7 days;

    IERC20 public immutable zzec;
    address public operator;
    uint256 public minAmount; // in zZEC units (8 decimals)
    bool public requestsPaused; // new requests only; fulfil and reclaim never pause

    enum Status { None, Open, Fulfilled, Reclaimed }
    struct Request {
        address holder;
        uint256 amount;
        string zcashAddress;
        uint64 requestedAt;
        Status status;
        bytes32 zcashTxid; // set on fulfil
        uint256 zzecRedemptionId; // ZZEC.requestRedeem id, set on fulfil
    }
    Request[] private _requests;

    event Requested(uint256 indexed id, address indexed holder, uint256 amount, string zcashAddress);
    event Fulfilled(uint256 indexed id, bytes32 zcashTxid, uint256 zzecRedemptionId);
    event Reclaimed(uint256 indexed id, address indexed holder, uint256 amount);
    event OperatorSet(address indexed previous, address indexed current);
    event MinAmountSet(uint256 minAmount);
    event RequestsPaused(bool paused);

    error NotOperator();
    error ZeroAddress();
    error BelowMinimum(uint256 amount, uint256 minAmount);
    error EmptyZcashAddress();
    error NotTransparentAddress();
    error Paused();
    error NoSuchRequest();
    error NotOpen();
    error NotHolder();
    error WindowNotElapsed(uint64 reclaimableAt);
    error ZeroTxid();

    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(IERC20 zzec_, address owner_, address operator_, uint256 minAmount_) Ownable(owner_) {
        if (address(zzec_) == address(0) || operator_ == address(0)) revert ZeroAddress();
        zzec = zzec_;
        operator = operator_;
        minAmount = minAmount_;
        emit OperatorSet(address(0), operator_);
        emit MinAmountSet(minAmount_);
    }

    // ------------------------------------------------------------ holders

    /// @notice Escrow zZEC and ask for native ZEC at a transparent Zcash address (t1…/t3…).
    function request(uint256 amount, string calldata zcashAddress) external nonReentrant returns (uint256 id) {
        if (requestsPaused) revert Paused();
        if (amount < minAmount || amount == 0) revert BelowMinimum(amount, minAmount);
        bytes memory a = bytes(zcashAddress);
        if (a.length == 0) revert EmptyZcashAddress();
        // Transparent only: a shielded destination cannot be shown to have been paid.
        if (a.length != 35 || a[0] != "t" || (a[1] != "1" && a[1] != "3")) revert NotTransparentAddress();
        zzec.safeTransferFrom(msg.sender, address(this), amount);
        _requests.push(Request(msg.sender, amount, zcashAddress, uint64(block.timestamp), Status.Open, bytes32(0), 0));
        id = _requests.length - 1;
        emit Requested(id, msg.sender, amount, zcashAddress);
    }

    /// @notice After WINDOW with no payout, take your zZEC back. Nobody can block this.
    function reclaim(uint256 id) external nonReentrant {
        Request storage r = _get(id);
        if (r.status != Status.Open) revert NotOpen();
        if (msg.sender != r.holder) revert NotHolder();
        uint64 at = r.requestedAt + WINDOW;
        if (block.timestamp < at) revert WindowNotElapsed(at);
        r.status = Status.Reclaimed;
        zzec.safeTransfer(r.holder, r.amount);
        emit Reclaimed(id, r.holder, r.amount);
    }

    // ----------------------------------------------------------- operator

    /// @notice Record the Zcash payout for a request and burn its escrowed zZEC. Pay first, then call this.
    function fulfill(uint256 id, bytes32 zcashTxid) external onlyOperator nonReentrant {
        if (zcashTxid == bytes32(0)) revert ZeroTxid();
        Request storage r = _get(id);
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Fulfilled;
        r.zcashTxid = zcashTxid;
        // Burns the desk's escrowed balance on the wrapper and records the redemption there too.
        r.zzecRedemptionId = IZZECRedeem(address(zzec)).requestRedeem(r.amount, r.zcashAddress);
        emit Fulfilled(id, zcashTxid, r.zzecRedemptionId);
    }

    // -------------------------------------------------------------- owner

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        emit OperatorSet(operator, operator_);
        operator = operator_;
    }

    function setMinAmount(uint256 minAmount_) external onlyOwner {
        minAmount = minAmount_;
        emit MinAmountSet(minAmount_);
    }

    /// @dev Pauses NEW requests only. Open requests can still be fulfilled or reclaimed.
    function setRequestsPaused(bool paused) external onlyOwner {
        requestsPaused = paused;
        emit RequestsPaused(paused);
    }

    // -------------------------------------------------------------- views

    function requestCount() external view returns (uint256) { return _requests.length; }
    function getRequest(uint256 id) external view returns (Request memory) { return _get(id); }
    function reclaimableAt(uint256 id) external view returns (uint64) { return _get(id).requestedAt + WINDOW; }

    function _get(uint256 id) private view returns (Request storage) {
        if (id >= _requests.length) revert NoSuchRequest();
        return _requests[id];
    }
}
