// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IZZECMint {
    function mint(address to, uint256 amount) external;
}

/**
 * @title WrapDesk
 * @notice The way in: send native ZEC to the reserve, receive zZEC 1:1.
 *
 * @dev The desk is the ZZEC minter. Every mint therefore passes through here and
 *      carries a reason: a wrap request that a holder opened and funded, or an
 *      operator mint against reserve growth (fee route) tagged with a reference.
 *
 *      Flow for a holder:
 *        1. request(amount) — amount in zZEC units (8 decimals), a multiple of
 *           TAG_SPACE. The desk returns an id and the exact deposit to send:
 *           depositZats(id) = amount + (id + 1). The trailing digits make every
 *           open request's deposit unique on the Zcash side, so a plain balance
 *           scan of the reserve address identifies which request a payment
 *           funds. The tag dust stays in the reserve as extra coverage.
 *        2. Send exactly depositZats(id) to the published reserve address.
 *        3. The operator sees the confirmed output, attests, and calls
 *           fulfill(id, zcashTxid), which mints `amount` to the requester.
 *
 *      Holds no funds. A holder can cancel an unfunded request at any time; the
 *      operator can reject one it cannot match. ZZEC's own checks still bound
 *      every mint: fresh attestation and supply <= attested reserve.
 */
contract WrapDesk is Ownable2Step {
    uint256 public constant TAG_SPACE = 100_000; // 0.001 ZEC granularity, ids up to 99,999 stay unique

    IZZECMint public immutable zzec;
    address public operator;
    uint256 public minAmount;
    bool public requestsPaused;

    enum Status { None, Open, Fulfilled, Cancelled, Rejected }
    struct Request {
        address requester;
        uint256 amount;
        uint64 requestedAt;
        Status status;
        bytes32 zcashTxid;
    }
    Request[] private _requests;

    event Requested(uint256 indexed id, address indexed requester, uint256 amount, uint256 depositZats);
    event Fulfilled(uint256 indexed id, address indexed requester, uint256 amount, bytes32 zcashTxid);
    event Cancelled(uint256 indexed id);
    event Rejected(uint256 indexed id, string reason);
    event ReserveMint(address indexed to, uint256 amount, bytes32 ref);
    event OperatorSet(address indexed previous, address indexed current);
    event MinAmountSet(uint256 minAmount);
    event RequestsPaused(bool paused);

    error NotOperator();
    error ZeroAddress();
    error BelowMinimum(uint256 amount, uint256 minAmount);
    error NotTagAligned(uint256 amount);
    error TagSpaceExhausted();
    error Paused();
    error NoSuchRequest();
    error NotOpen();
    error NotRequester();
    error ZeroTxid();

    modifier onlyOperator() { if (msg.sender != operator) revert NotOperator(); _; }

    constructor(IZZECMint zzec_, address owner_, address operator_, uint256 minAmount_) Ownable(owner_) {
        if (address(zzec_) == address(0) || operator_ == address(0)) revert ZeroAddress();
        if (minAmount_ % TAG_SPACE != 0) revert NotTagAligned(minAmount_);
        zzec = zzec_;
        operator = operator_;
        minAmount = minAmount_;
        emit OperatorSet(address(0), operator_);
        emit MinAmountSet(minAmount_);
    }

    // ---- holder ----

    /// @notice Open a wrap request for `amount` zZEC units. Send depositZats(id) ZEC to the reserve to fund it.
    function request(uint256 amount) external returns (uint256 id) {
        if (requestsPaused) revert Paused();
        if (amount < minAmount) revert BelowMinimum(amount, minAmount);
        if (amount % TAG_SPACE != 0) revert NotTagAligned(amount);
        id = _requests.length;
        if (id + 1 >= TAG_SPACE) revert TagSpaceExhausted();
        _requests.push(Request({ requester: msg.sender, amount: amount, requestedAt: uint64(block.timestamp), status: Status.Open, zcashTxid: bytes32(0) }));
        emit Requested(id, msg.sender, amount, amount + id + 1);
    }

    /// @notice Withdraw an unfunded request. Do not cancel after sending ZEC: the operator can still fulfil an open one, never a cancelled one.
    function cancel(uint256 id) external {
        Request storage r = _get(id);
        if (r.requester != msg.sender) revert NotRequester();
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Cancelled;
        emit Cancelled(id);
    }

    // ---- operator ----

    /// @notice Record the funding Zcash transaction and mint the requested zZEC to the requester.
    function fulfill(uint256 id, bytes32 zcashTxid) external onlyOperator {
        if (zcashTxid == bytes32(0)) revert ZeroTxid();
        Request storage r = _get(id);
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Fulfilled;
        r.zcashTxid = zcashTxid;
        zzec.mint(r.requester, r.amount);
        emit Fulfilled(id, r.requester, r.amount, zcashTxid);
    }

    /// @notice Close a request the operator cannot match (e.g. wrong amount sent). Holds no funds, so nothing is lost on-chain.
    function reject(uint256 id, string calldata reason) external onlyOperator {
        Request storage r = _get(id);
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Rejected;
        emit Rejected(id, reason);
    }

    /// @notice Mint against reserve growth that did not come through a request (the fee route). `ref` is a Zcash txid or a note hash.
    function operatorMint(address to, uint256 amount, bytes32 ref) external onlyOperator {
        zzec.mint(to, amount);
        emit ReserveMint(to, amount, ref);
    }

    // ---- owner ----

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        emit OperatorSet(operator, operator_);
        operator = operator_;
    }

    function setMinAmount(uint256 minAmount_) external onlyOwner {
        if (minAmount_ % TAG_SPACE != 0) revert NotTagAligned(minAmount_);
        minAmount = minAmount_;
        emit MinAmountSet(minAmount_);
    }

    function setRequestsPaused(bool paused) external onlyOwner {
        requestsPaused = paused;
        emit RequestsPaused(paused);
    }

    // ---- views ----

    function requestCount() external view returns (uint256) { return _requests.length; }

    function getRequest(uint256 id) external view returns (Request memory) { return _get(id); }

    /// @dev Fixed-width view for thin clients that decode without an ABI library.
    function summary(uint256 id) external view returns (address requester, uint256 amount, uint64 requestedAt, uint8 status, bytes32 zcashTxid, uint256 deposit) {
        Request storage r = _get(id);
        return (r.requester, r.amount, r.requestedAt, uint8(r.status), r.zcashTxid, r.amount + id + 1);
    }

    /// @notice The exact number of zatoshi to send for request `id`.
    function depositZats(uint256 id) external view returns (uint256) { return _get(id).amount + id + 1; }

    function _get(uint256 id) private view returns (Request storage) {
        if (id >= _requests.length) revert NoSuchRequest();
        return _requests[id];
    }
}
