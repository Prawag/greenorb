// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title GreenOrbToken ($GORB)
 * @notice HTS-compatible ERC-20 fungible token on Hedera
 * @dev Total supply: 1,000,000,000 GORB (8 decimals)
 *      Roles: MINTER_ROLE (RewardEngine), BURNER_ROLE (BurnMechanism)
 */
contract GreenOrbToken is ERC20, AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**8; // 1B with 8 decimals
    uint256 public totalMinted;
    uint256 public totalBurned;

    event TokensMinted(address indexed to, uint256 amount, string reason);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(address treasury) ERC20("GreenOrb Token", "GORB") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        // Mint initial treasury allocation (20% = 200M)
        uint256 treasuryAlloc = 200_000_000 * 10**8;
        _mint(treasury, treasuryAlloc);
        totalMinted = treasuryAlloc;
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    /**
     * @notice Mint tokens for rewards (called by RewardEngine)
     * @dev Cannot exceed MAX_SUPPLY
     */
    function mint(address to, uint256 amount, string calldata reason)
        external
        onlyRole(MINTER_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(totalMinted + amount <= MAX_SUPPLY, "GORB: max supply exceeded");
        _mint(to, amount);
        totalMinted += amount;
        emit TokensMinted(to, amount, reason);
    }

    /**
     * @notice Burn tokens (called by BurnMechanism on swaps)
     */
    function burn(address from, uint256 amount)
        external
        onlyRole(BURNER_ROLE)
        whenNotPaused
        nonReentrant
    {
        _burn(from, amount);
        totalBurned += amount;
        emit TokensBurned(from, amount);
    }

    /**
     * @notice Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice View remaining mintable supply
     */
    function remainingMintable() external view returns (uint256) {
        return MAX_SUPPLY - totalMinted;
    }

    /**
     * @notice View circulating supply (minted - burned)
     */
    function circulatingSupply() external view returns (uint256) {
        return totalMinted - totalBurned;
    }
}
