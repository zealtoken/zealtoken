// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IZZECMint} from "./WrapDesk.sol";

/// @notice Permanent recipient-bound deposit routes, credited by actual Zcash outputs.
/// @dev Zcash evidence and custody remain trusted operator responsibilities. The
/// operator must verify confirmations, custody and central-reserve consolidation.
/// ZZEC still enforces fresh attested backing. No funds or keys live in this desk.
contract WrapDeskV2 is Ownable2Step, ReentrancyGuard {
    IZZECMint public immutable zzec;
    bytes32 public immutable depositKeyFingerprint;
    address public operator;
    bool public requestsPaused = true;
    bool public creditsPaused = true;
    uint256 public constant MIN_DEPOSIT = 100_000; // 0.001 ZEC, no amount tagging
    uint256 public constant MAX_DEPOSIT = 100_000_000; // 1 ZEC per output initially
    struct Route { address recipient; uint64 requestedAt; string depositAddress; uint256 creditedZats; }
    Route[] private routes;
    mapping(address => uint256) public routePlusOne;
    mapping(bytes32 => bool) public assignedAddresses;
    mapping(bytes32 => bool) public creditedOutputs;
    event Requested(uint256 indexed id, address indexed recipient);
    event AddressAssigned(uint256 indexed id, address indexed recipient, string depositAddress);
    event Credited(uint256 indexed id, address indexed recipient, bytes32 indexed txid, uint32 outputIndex, uint256 amount, bytes32 consolidationTxid);
    event ReserveMint(address indexed to, uint256 amount, bytes32 ref);
    event OperatorSet(address indexed operator);
    event Paused(bool requestsPaused, bool creditsPaused);
    error Invalid(); error NotOperator(); error PausedNow(); error AlreadyAssigned(); error DuplicateOutput();
    modifier onlyOperator() { if(msg.sender != operator) revert NotOperator(); _; }
    constructor(IZZECMint token_, address owner_, address operator_, bytes32 fingerprint_) Ownable(owner_) {
        if(address(token_) == address(0) || operator_ == address(0) || fingerprint_ == bytes32(0)) revert Invalid();
        zzec = token_; operator = operator_; depositKeyFingerprint = fingerprint_;
    }
    /// @notice Idempotent: a wallet always gets its existing route, never another address.
    function request() external returns(uint256 id) {
        uint256 existing = routePlusOne[msg.sender];
        if(existing != 0) return existing - 1;
        if(requestsPaused) revert PausedNow();
        // Non-hardened public derivation domain; no lifetime amount-tag exhaustion.
        if(routes.length >= 2**31) revert Invalid();
        id = routes.length;
        routes.push(Route(msg.sender, uint64(block.timestamp), "", 0));
        routePlusOne[msg.sender] = id + 1;
        emit Requested(id, msg.sender);
    }
    /// @dev The worker must derive and verify this address from the pinned public key.
    /// Assignment can never change. Old addresses continue to credit the same wallet.
    function assignAddress(uint256 id, string calldata depositAddress) external onlyOperator {
        Route storage r = routes[id];
        if(bytes(r.depositAddress).length != 0) revert AlreadyAssigned();
        bytes calldata a = bytes(depositAddress);
        if(a.length != 35 || a[0] != 0x74 || a[1] != 0x31) revert Invalid();
        bytes32 key = keccak256(a);
        if(assignedAddresses[key]) revert AlreadyAssigned();
        assignedAddresses[key] = true; r.depositAddress = depositAddress;
        emit AddressAssigned(id, r.recipient, depositAddress);
    }
    /// @notice Each actual output can mint once, to the route recipient only.
    /// Multiple outputs from one tx, and later payments to the same route, are supported.
    function credit(uint256 id, bytes32 txid, uint32 outputIndex, uint256 amount, bytes32 consolidationTxid) external onlyOperator nonReentrant {
        if(creditsPaused) revert PausedNow();
        Route storage r = routes[id];
        if(bytes(r.depositAddress).length == 0 || txid == bytes32(0) || consolidationTxid == bytes32(0) || amount < MIN_DEPOSIT || amount > MAX_DEPOSIT) revert Invalid();
        bytes32 key = keccak256(abi.encode(txid, outputIndex));
        if(creditedOutputs[key]) revert DuplicateOutput();
        creditedOutputs[key] = true; r.creditedZats += amount;
        zzec.mint(r.recipient, amount);
        emit Credited(id, r.recipient, txid, outputIndex, amount, consolidationTxid);
    }
    // Retains the existing keeper reserve-growth interface; separate accounting required.
    function operatorMint(address to, uint256 amount, bytes32 ref) external onlyOperator nonReentrant {
        if(creditsPaused) revert PausedNow();
        if(to == address(0) || amount == 0 || ref == bytes32(0)) revert Invalid();
        zzec.mint(to, amount); emit ReserveMint(to, amount, ref);
    }
    function setOperator(address next) external onlyOwner { if(next == address(0)) revert Invalid(); operator = next; emit OperatorSet(next); }
    function setPaused(bool requests_, bool credits_) external onlyOwner { requestsPaused = requests_; creditsPaused = credits_; emit Paused(requests_, credits_); }
    function requestCount() external view returns(uint256) { return routes.length; }
    function route(uint256 id) external view returns(Route memory) { return routes[id]; }
}
