// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IGreenOrbBurnable {
    function burn(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title BurnMechanism — Deflationary Burn on Swaps
 * @notice Burns 1% of every token transfer through registered swap pools
 *         Creates deflationary pressure on $GORB supply
 */
contract BurnMechanism is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    IGreenOrbBurnable public gorbToken;

    uint256 public burnRateBps = 100; // 1% = 100 basis points
    uint256 public constant MAX_BURN_RATE = 500; // never exceed 5%
    uint256 public constant MIN_BURN_RATE = 10;  // never below 0.1%

    uint256 public totalBurnedViaSwaps;
    uint256 public totalSwapVolume;
    uint256 public swapCount;

    // Burn milestones
    uint256[] public burnMilestones;
    mapping(uint256 => bool) public milestoneReached;

    event SwapBurn(
        address indexed pool,
        address indexed trader,
        uint256 swapAmount,
        uint256 burnAmount,
        uint256 timestamp
    );
    event BurnRateUpdated(uint256 oldRate, uint256 newRate);
    event MilestoneReached(uint256 totalBurned, uint256 milestone);

    constructor(address _gorbToken) {
        gorbToken = IGreenOrbBurnable(_gorbToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Set burn milestones (tokens burned)
        burnMilestones.push(1_000_000 * 10**8);   // 1M
        burnMilestones.push(10_000_000 * 10**8);   // 10M
        burnMilestones.push(50_000_000 * 10**8);   // 50M
        burnMilestones.push(100_000_000 * 10**8);  // 100M
    }

    /**
     * @notice Execute burn on a swap transaction
     * @param trader Address performing the swap
     * @param amount Total swap amount
     * @return burnAmount The amount burned
     */
    function executeSwapBurn(address trader, uint256 amount)
        external
        onlyRole(POOL_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 burnAmount)
    {
        require(amount > 0, "Burn: zero amount");
        require(gorbToken.balanceOf(trader) >= amount, "Burn: insufficient balance");

        burnAmount = (amount * burnRateBps) / 10000;
        if (burnAmount == 0) return 0;

        gorbToken.burn(trader, burnAmount);

        totalBurnedViaSwaps += burnAmount;
        totalSwapVolume += amount;
        swapCount++;

        // Check milestones
        _checkMilestones();

        emit SwapBurn(msg.sender, trader, amount, burnAmount, block.timestamp);
        return burnAmount;
    }

    function _checkMilestones() internal {
        for (uint256 i = 0; i < burnMilestones.length; i++) {
            if (!milestoneReached[burnMilestones[i]] && totalBurnedViaSwaps >= burnMilestones[i]) {
                milestoneReached[burnMilestones[i]] = true;
                emit MilestoneReached(totalBurnedViaSwaps, burnMilestones[i]);
            }
        }
    }

    /**
     * @notice Update burn rate (admin only, within bounds)
     */
    function setBurnRate(uint256 newRateBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newRateBps >= MIN_BURN_RATE && newRateBps <= MAX_BURN_RATE, "Burn: rate out of bounds");
        uint256 oldRate = burnRateBps;
        burnRateBps = newRateBps;
        emit BurnRateUpdated(oldRate, newRateBps);
    }

    /**
     * @notice Calculate burn amount for a given swap
     */
    function calculateBurn(uint256 amount) external view returns (uint256) {
        return (amount * burnRateBps) / 10000;
    }

    /**
     * @notice Get all stats
     */
    function getStats() external view returns (
        uint256 _totalBurned,
        uint256 _totalVolume,
        uint256 _swapCount,
        uint256 _currentRate
    ) {
        return (totalBurnedViaSwaps, totalSwapVolume, swapCount, burnRateBps);
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
