// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice A launched token: fixed supply, minted once to the factory, no owner, no tax on transfers.
 *         It carries a reflection ledger: the hook hands it zZEC on every trade and every holder
 *         can claim their pro-rata share. The pool, the hook and the factory are excluded, so
 *         reflections only ever go to people holding the token in a wallet.
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
    address[3] private excludedList;
    mapping(address => bool) public excluded;

    uint256 public perShare; // zZEC (magnified) per eligible token
    uint256 public reflectedTotal; // zZEC ever distributed
    uint256 public pending; // zZEC waiting for enough eligible holders
    mapping(address => int256) private corrections;
    mapping(address => uint256) public withdrawn;

    event Reflected(uint256 zats, uint256 eligibleSupply);
    event ReflectionsClaimed(address indexed holder, uint256 zats);

    error NotHook();
    error Excluded();
    error NothingToClaim();

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, uint256 supply, address to, address zzec_, address hook_, address poolManager_) ERC20(name_, symbol_) {
        factory = msg.sender;
        metadataURI = metadataURI_;
        zzec = zzec_; hook = hook_;
        excludedList = [poolManager_, hook_, msg.sender];
        excluded[poolManager_] = true; excluded[hook_] = true; excluded[msg.sender] = true;
        _mint(to, supply);
    }

    /// @notice Supply that earns reflections: everything not sitting in the pool, the hook or the factory.
    function eligibleSupply() public view returns (uint256 s) {
        s = totalSupply();
        for (uint256 i = 0; i < 3; i++) s -= balanceOf(excludedList[i]);
    }

    /// @notice Called by the hook after it has moved `zats` of zZEC here. Spreads it over every eligible token.
    function reflect(uint256 zats) external {
        if (msg.sender != hook) revert NotHook();
        uint256 amount = zats + pending;
        uint256 elig = eligibleSupply();
        if (elig < MIN_ELIGIBLE) { pending = amount; return; }
        pending = 0;
        perShare += (amount * MAG) / elig;
        reflectedTotal += amount;
        emit Reflected(amount, elig);
    }

    function _accumulated(address a) private view returns (uint256) {
        return uint256(int256(perShare * balanceOf(a)) + corrections[a]) / MAG;
    }

    /// @notice zZEC this holder can claim right now.
    function reflectionsOf(address a) public view returns (uint256) {
        if (excluded[a]) return 0;
        return _accumulated(a) - withdrawn[a];
    }

    function claimReflections() external returns (uint256 zats) {
        if (excluded[msg.sender]) revert Excluded();
        zats = reflectionsOf(msg.sender);
        if (zats == 0) revert NothingToClaim();
        withdrawn[msg.sender] += zats;
        IERC20(zzec).safeTransfer(msg.sender, zats);
        emit ReflectionsClaimed(msg.sender, zats);
    }

    /// @dev Keep every balance's accumulated share constant across transfers.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 c = int256(perShare * value);
        if (from != address(0)) corrections[from] += c;
        if (to != address(0)) corrections[to] -= c;
    }
}
