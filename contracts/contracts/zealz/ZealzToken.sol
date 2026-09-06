// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A launched token: fixed supply, minted once to the factory, no owner, no tax on transfers.
 *         It carries a dividend ledger: the hook hands it zZEC on every trade and every holder
 *         can claim their pro-rata share. The pool, the hook and the factory are excluded, so
 *         dividends only ever go to people holding the token in a wallet.
 */
contract ZealzToken is ERC20 {
    using SafeERC20 for IERC20;

    uint256 private constant MAG = 2 ** 128;
    /// @dev Below this many eligible tokens a distribution is held back (keeps the per-share maths in range).
    uint256 private constant MIN_ELIGIBLE = 1_000e18;

    string public metadataURI;
    address public immutable factory;
    address public immutable zzec;
    address public immutable hook;
    address public immutable furnace;
    address[3] private excludedList;
    mapping(address => bool) public excluded;

    uint256 public perShare; // zZEC (magnified) per eligible token
    uint256 public distributedTotal; // zZEC ever distributed
    uint256 public pending; // zZEC waiting for enough eligible holders
    uint64 public pendingSince; // when pending first became non-zero; after SWEEP_AFTER anyone may send it to the Furnace
    uint64 private constant SWEEP_AFTER = 90 days;
    mapping(address => int256) private corrections;
    mapping(address => uint256) public withdrawn;

    event Distributed(uint256 zats, uint256 eligibleSupply);
    event DividendsClaimed(address indexed holder, uint256 zats);
    event PendingSwept(uint256 zats);

    error NotHook();
    error Excluded();
    error NothingToClaim();
    error NotSweepable();

    struct Wiring { address zzec; address hook; address poolManager; address furnace; }

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, uint256 supply, address to, Wiring memory w) ERC20(name_, symbol_) {
        factory = msg.sender;
        metadataURI = metadataURI_;
        zzec = w.zzec; hook = w.hook; furnace = w.furnace;
        excludedList = [w.poolManager, w.hook, msg.sender];
        excluded[w.poolManager] = true; excluded[w.hook] = true; excluded[msg.sender] = true;
        _mint(to, supply);
    }

    /// @notice Supply that earns dividends: everything not sitting in the pool, the hook or the factory.
    function eligibleSupply() public view returns (uint256 s) {
        s = totalSupply();
        for (uint256 i = 0; i < 3; i++) {
            address a = excludedList[i];
            bool seen = false;
            for (uint256 j = 0; j < i; j++) if (excludedList[j] == a) seen = true; // the same address in two roles counts once
            if (!seen) s -= balanceOf(a);
        }
    }

    /// @notice Called by the hook after it has moved `zats` of zZEC here. Spreads it over every eligible token.
    function distribute(uint256 zats) external {
        if (msg.sender != hook) revert NotHook();
        uint256 amount = zats + pending;
        uint256 elig = eligibleSupply();
        if (elig < MIN_ELIGIBLE) { if (pending == 0) pendingSince = uint64(block.timestamp); pending = amount; return; }
        pending = 0; pendingSince = 0;
        perShare += (amount * MAG) / elig;
        distributedTotal += amount;
        emit Distributed(amount, elig);
    }

    function _accumulated(address a) private view returns (uint256) {
        return uint256(int256(perShare * balanceOf(a)) + corrections[a]) / MAG;
    }

    /// @notice zZEC this holder can claim right now.
    function dividendsOf(address a) public view returns (uint256) {
        if (excluded[a]) return 0;
        return _accumulated(a) - withdrawn[a];
    }

    function claimDividends() external returns (uint256 zats) {
        if (excluded[msg.sender]) revert Excluded();
        zats = dividendsOf(msg.sender);
        if (zats == 0) revert NothingToClaim();
        withdrawn[msg.sender] += zats;
        IERC20(zzec).safeTransfer(msg.sender, zats);
        emit DividendsClaimed(msg.sender, zats);
    }

    /// @notice A token nobody holds cannot pay dividends. If zZEC has waited 90 days for holders, anyone may send it to the Furnace.
    function sweepPending() external returns (uint256 zats) {
        if (pending == 0 || block.timestamp < pendingSince + SWEEP_AFTER) revert NotSweepable();
        zats = pending; pending = 0; pendingSince = 0;
        IERC20(zzec).safeTransfer(furnace, zats);
        emit PendingSwept(zats);
    }

    /// @dev Keep every balance's accumulated share constant across transfers.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 c = int256(perShare * value);
        if (from != address(0)) corrections[from] += c;
        if (to != address(0)) corrections[to] -= c;
    }
}
