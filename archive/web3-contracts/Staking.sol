// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title Staking — Lock $GORB for APY + Governance Power
 * @notice Three tiers: 30d (5% APY), 90d (12% APY), 365d (20% APY)
 *         1 staked GORB = 1 governance vote
 */
contract Staking is AccessControl, ReentrancyGuard, Pausable {
    IERC20 public gorbToken;

    enum Tier { THIRTY_DAYS, NINETY_DAYS, ONE_YEAR }

    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 lockEnd;
        Tier tier;
        bool claimed;
    }

    // APY in basis points (5% = 500, 12% = 1200, 20% = 2000)
    uint256[3] public apyBps = [500, 1200, 2000];
    uint256[3] public lockDurations = [30 days, 90 days, 365 days];

    // Minimum stake: 100 GORB
    uint256 public constant MIN_STAKE = 100 * 10**8;

    mapping(address => Stake[]) public userStakes;
    mapping(address => uint256) public governanceVotes; // total staked = votes
    
    uint256 public totalStaked;
    uint256 public totalStakers;
    mapping(address => bool) private isStaker;

    event Staked(address indexed user, uint256 amount, Tier tier, uint256 lockEnd);
    event Unstaked(address indexed user, uint256 stakeIndex, uint256 principal, uint256 reward);
    event EarlyUnstake(address indexed user, uint256 stakeIndex, uint256 principal, uint256 penalty);

    constructor(address _gorbToken) {
        gorbToken = IERC20(_gorbToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Stake GORB tokens in a tier
     * @param amount Amount to stake (must approve first)
     * @param tier Lock period tier (0=30d, 1=90d, 2=365d)
     */
    function stake(uint256 amount, Tier tier)
        external
        whenNotPaused
        nonReentrant
    {
        require(amount >= MIN_STAKE, "Staking: below minimum");
        require(gorbToken.transferFrom(msg.sender, address(this), amount), "Staking: transfer failed");

        uint256 lockEnd = block.timestamp + lockDurations[uint256(tier)];

        userStakes[msg.sender].push(Stake({
            amount: amount,
            startTime: block.timestamp,
            lockEnd: lockEnd,
            tier: tier,
            claimed: false
        }));

        governanceVotes[msg.sender] += amount;
        totalStaked += amount;

        if (!isStaker[msg.sender]) {
            isStaker[msg.sender] = true;
            totalStakers++;
        }

        emit Staked(msg.sender, amount, tier, lockEnd);
    }

    /**
     * @notice Unstake after lock period (principal + APY reward)
     * @param stakeIndex Index of the stake to withdraw
     */
    function unstake(uint256 stakeIndex)
        external
        whenNotPaused
        nonReentrant
    {
        require(stakeIndex < userStakes[msg.sender].length, "Staking: invalid index");
        Stake storage s = userStakes[msg.sender][stakeIndex];
        require(!s.claimed, "Staking: already claimed");
        require(block.timestamp >= s.lockEnd, "Staking: still locked");

        uint256 reward = calculateReward(s.amount, s.tier, s.startTime, s.lockEnd);
        s.claimed = true;

        governanceVotes[msg.sender] -= s.amount;
        totalStaked -= s.amount;

        // Transfer principal back
        require(gorbToken.transfer(msg.sender, s.amount), "Staking: principal transfer failed");

        // Note: reward minting must be done via RewardEngine or a separate rewards pool
        // For simplicity, we emit event so backend can process reward minting
        emit Unstaked(msg.sender, stakeIndex, s.amount, reward);
    }

    /**
     * @notice Early unstake with 10% penalty
     */
    function earlyUnstake(uint256 stakeIndex)
        external
        whenNotPaused
        nonReentrant
    {
        require(stakeIndex < userStakes[msg.sender].length, "Staking: invalid index");
        Stake storage s = userStakes[msg.sender][stakeIndex];
        require(!s.claimed, "Staking: already claimed");
        require(block.timestamp < s.lockEnd, "Staking: already unlocked, use unstake()");

        uint256 penalty = s.amount / 10; // 10% penalty
        uint256 refund = s.amount - penalty;
        s.claimed = true;

        governanceVotes[msg.sender] -= s.amount;
        totalStaked -= s.amount;

        // Refund minus penalty
        require(gorbToken.transfer(msg.sender, refund), "Staking: refund transfer failed");
        // Penalty stays in contract (can be burned or redistributed)

        emit EarlyUnstake(msg.sender, stakeIndex, refund, penalty);
    }

    /**
     * @notice Calculate APY reward for a stake
     */
    function calculateReward(
        uint256 amount,
        Tier tier,
        uint256 startTime,
        uint256 endTime
    ) public view returns (uint256) {
        uint256 duration = endTime - startTime;
        uint256 apy = apyBps[uint256(tier)];
        // reward = principal * APY * duration / (365 days * 10000)
        return (amount * apy * duration) / (365 days * 10000);
    }

    /**
     * @notice Get governance voting power for an address
     */
    function getVotingPower(address user) external view returns (uint256) {
        return governanceVotes[user];
    }

    /**
     * @notice Get all stakes for a user
     */
    function getStakes(address user) external view returns (Stake[] memory) {
        return userStakes[user];
    }

    /**
     * @notice Get number of active (unclaimed) stakes
     */
    function activeStakeCount(address user) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < userStakes[user].length; i++) {
            if (!userStakes[user][i].claimed) count++;
        }
        return count;
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
