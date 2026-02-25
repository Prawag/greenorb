// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

interface IGreenOrbToken {
    function mint(address to, uint256 amount, string calldata reason) external;
}

/**
 * @title RewardEngine — Proof-of-Green Mining
 * @notice Distributes $GORB rewards for ESG data contributions
 * @dev Implements daily caps, halving schedule, and anti-sybil cooldowns
 *
 * Reward Actions:
 *   UPLOAD_REPORT     = 50 GORB   (cap: 500/day)
 *   AGENT_DISCOVERY   = 10 GORB   (cap: 1000/day)
 *   VERIFY_DATA       = 25 GORB   (cap: 250/day)
 *   DAILY_STREAK      = 5 GORB    (cap: 5/day)
 *   REFERRAL          = 100 GORB  (cap: 200/day)
 *   PRODUCT_FOOTPRINT = 30 GORB   (cap: 300/day)
 */
contract RewardEngine is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    IGreenOrbToken public gorbToken;

    // Halving: rewards halve every 180 days for 3 years, then stabilize
    uint256 public deployTimestamp;
    uint256 public constant HALVING_PERIOD = 180 days;
    uint256 public constant MAX_HALVINGS = 6; // 3 years

    // Action types
    enum ActionType {
        UPLOAD_REPORT,
        AGENT_DISCOVERY,
        VERIFY_DATA,
        DAILY_STREAK,
        REFERRAL,
        PRODUCT_FOOTPRINT
    }

    // Base rewards (before halving) — in token units (8 decimals)
    uint256 private constant UNIT = 10**8;
    uint256[6] public baseRewards = [
        50 * UNIT,    // UPLOAD_REPORT
        10 * UNIT,    // AGENT_DISCOVERY
        25 * UNIT,    // VERIFY_DATA
        5 * UNIT,     // DAILY_STREAK
        100 * UNIT,   // REFERRAL
        30 * UNIT     // PRODUCT_FOOTPRINT
    ];

    // Daily caps per action per user
    uint256[6] public dailyCaps = [
        500 * UNIT,   // max 10 uploads
        1000 * UNIT,  // max 100 discoveries
        250 * UNIT,   // max 10 verifications
        5 * UNIT,     // max 1 streak claim
        200 * UNIT,   // max 2 referrals
        300 * UNIT    // max 10 footprints
    ];

    // Anti-sybil: minimum seconds between same action from same wallet
    uint256[6] public cooldowns = [
        30,   // 30s between uploads
        5,    // 5s between discoveries
        60,   // 60s between verifications
        86400,// 1 day for streak
        3600, // 1 hour between referrals
        30    // 30s between footprints
    ];

    // User tracking
    struct UserDay {
        uint256 dayNumber;
        uint256[6] claimed;    // amount claimed per action today
    }

    mapping(address => UserDay) public userDays;
    mapping(address => mapping(ActionType => uint256)) public lastActionTime;
    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public streakDays;
    mapping(address => uint256) public lastStreakDay;

    // Global stats
    uint256 public totalDistributed;
    uint256 public totalActions;

    // Proof tracking (prevent double-claiming same data)
    mapping(bytes32 => bool) public proofUsed;

    event RewardClaimed(
        address indexed user,
        ActionType action,
        uint256 amount,
        bytes32 proofHash,
        uint256 timestamp
    );

    event HalvingApplied(uint256 halvingNumber, uint256 newMultiplierBps);

    constructor(address _gorbToken) {
        gorbToken = IGreenOrbToken(_gorbToken);
        deployTimestamp = block.timestamp;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VALIDATOR_ROLE, msg.sender);
    }

    /**
     * @notice Get current halving multiplier (10000 = 100%, 5000 = 50%, etc.)
     */
    function currentMultiplierBps() public view returns (uint256) {
        uint256 elapsed = block.timestamp - deployTimestamp;
        uint256 halvings = elapsed / HALVING_PERIOD;
        if (halvings > MAX_HALVINGS) halvings = MAX_HALVINGS;

        // Each halving divides by 2: 10000 -> 5000 -> 2500 -> 1250 -> 625 -> 312 -> 156
        uint256 mult = 10000;
        for (uint256 i = 0; i < halvings; i++) {
            mult = mult / 2;
        }
        // Minimum floor: 1.56% of original
        return mult < 156 ? 156 : mult;
    }

    /**
     * @notice Calculate actual reward with halving applied
     */
    function currentReward(ActionType action) public view returns (uint256) {
        return (baseRewards[uint256(action)] * currentMultiplierBps()) / 10000;
    }

    /**
     * @notice Get today's day number
     */
    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Claim reward for an action
     * @param action The type of action performed
     * @param proofHash Hash of the contribution proof (report hash, data hash, etc.)
     */
    function claimReward(ActionType action, bytes32 proofHash)
        external
        whenNotPaused
        nonReentrant
    {
        require(!proofUsed[proofHash], "Reward: proof already used");
        require(
            block.timestamp >= lastActionTime[msg.sender][action] + cooldowns[uint256(action)],
            "Reward: cooldown active"
        );

        uint256 today = _currentDay();
        UserDay storage ud = userDays[msg.sender];

        // Reset daily tracking if new day
        if (ud.dayNumber != today) {
            ud.dayNumber = today;
            for (uint256 i = 0; i < 6; i++) {
                ud.claimed[i] = 0;
            }
        }

        uint256 reward = currentReward(action);
        require(
            ud.claimed[uint256(action)] + reward <= dailyCaps[uint256(action)],
            "Reward: daily cap reached"
        );

        // Handle streak
        if (action == ActionType.DAILY_STREAK) {
            if (lastStreakDay[msg.sender] == today - 1) {
                streakDays[msg.sender]++;
            } else {
                streakDays[msg.sender] = 1;
            }
            lastStreakDay[msg.sender] = today;
            // 7-day streak bonus: 2x reward
            if (streakDays[msg.sender] >= 7 && streakDays[msg.sender] % 7 == 0) {
                reward = reward * 2;
            }
        }

        // Update state
        proofUsed[proofHash] = true;
        lastActionTime[msg.sender][action] = block.timestamp;
        ud.claimed[uint256(action)] += reward;
        totalEarned[msg.sender] += reward;
        totalDistributed += reward;
        totalActions++;

        // Mint reward
        gorbToken.mint(msg.sender, reward, _actionName(action));

        emit RewardClaimed(msg.sender, action, reward, proofHash, block.timestamp);
    }

    /**
     * @notice Validator-submitted batch reward (for agent discoveries)
     */
    function batchReward(
        address[] calldata users,
        ActionType action,
        bytes32[] calldata proofs
    )
        external
        onlyRole(VALIDATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        require(users.length == proofs.length, "Reward: length mismatch");
        require(users.length <= 50, "Reward: batch too large");

        for (uint256 i = 0; i < users.length; i++) {
            if (proofUsed[proofs[i]]) continue;

            uint256 reward = currentReward(action);
            proofUsed[proofs[i]] = true;
            totalEarned[users[i]] += reward;
            totalDistributed += reward;
            totalActions++;

            gorbToken.mint(users[i], reward, _actionName(action));
            emit RewardClaimed(users[i], action, reward, proofs[i], block.timestamp);
        }
    }

    function _actionName(ActionType action) internal pure returns (string memory) {
        if (action == ActionType.UPLOAD_REPORT) return "upload_report";
        if (action == ActionType.AGENT_DISCOVERY) return "agent_discovery";
        if (action == ActionType.VERIFY_DATA) return "verify_data";
        if (action == ActionType.DAILY_STREAK) return "daily_streak";
        if (action == ActionType.REFERRAL) return "referral";
        return "product_footprint";
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
