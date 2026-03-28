// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title VoteLobby
/// @notice Oylama lobisi — commit-reveal ile sosyal etkiyi onler.
///         Secenekler bastan acik, oylar gizli tutulur.
///         Oylar yalnizca oylama bittikten sonra toplu acilanir.
contract VoteLobby {
    enum Phase { PENDING, VOTING, REVEAL, FINISHED }

    address public owner;
    uint256 public optionCount;
    uint256 public voteDuration;
    uint256 public revealWindow;
    uint256 public stake;

    Phase public phase;
    uint256 public voteStartTime;
    uint256 public revealDeadline;

    address[] public members;
    mapping(address => bool) public isMember;

    // participant => commitment hash
    mapping(address => bytes32) public commitments;
    // participant => revealed vote (option index, 0-based)
    mapping(address => uint256) public revealedVotes;
    mapping(address => bool) public hasRevealed;

    // option index => vote count
    mapping(uint256 => uint256) public voteTally;
    uint256 public totalRevealed;

    event MemberJoined(address indexed member);
    event VotingStarted(uint256 startTime);
    event VoteCommitted(address indexed participant);
    event VoteRevealed(address indexed participant, uint256 indexed option);
    event RevealPhaseStarted(uint256 deadline);
    event VotingFinished();
    event StakeWithdrawn(uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _owner,
        uint256 _optionCount,
        uint256 _voteDuration,
        uint256 _revealWindow
    ) payable {
        owner = _owner;
        optionCount = _optionCount;
        voteDuration = _voteDuration;
        revealWindow = _revealWindow;
        stake = msg.value;
        phase = Phase.PENDING;
    }

    function joinLobby() external {
        require(phase == Phase.PENDING, "Lobby not open");
        require(!isMember[msg.sender], "Already a member");
        require(msg.sender != owner, "Owner cannot join");

        isMember[msg.sender] = true;
        members.push(msg.sender);

        emit MemberJoined(msg.sender);
    }

    function startVoting() external onlyOwner {
        require(phase == Phase.PENDING, "Already started");
        require(members.length > 0, "No members");

        phase = Phase.VOTING;
        voteStartTime = block.timestamp;

        emit VotingStarted(block.timestamp);
    }

    /// @notice Oy hash'ini gonder — mempool'da gercek oy gorunmez
    function commitVote(bytes32 commitment) external {
        require(phase == Phase.VOTING, "Not voting phase");
        require(isMember[msg.sender], "Not a member");
        require(commitments[msg.sender] == bytes32(0), "Already committed");
        require(block.timestamp < voteStartTime + voteDuration, "Voting period ended");

        commitments[msg.sender] = commitment;

        emit VoteCommitted(msg.sender);
    }

    /// @notice Oylama suresi dolunca reveal phase'e gec — herkes cagirabillir
    function endVoting() external {
        require(phase == Phase.VOTING, "Not voting phase");
        require(block.timestamp >= voteStartTime + voteDuration, "Voting still active");

        phase = Phase.REVEAL;
        revealDeadline = block.timestamp + revealWindow;

        emit RevealPhaseStarted(revealDeadline);
    }

    /// @notice Oyu ac — reveal window icinde
    function revealVote(uint256 option, bytes32 salt) external {
        require(phase == Phase.REVEAL, "Not reveal phase");
        require(block.timestamp <= revealDeadline, "Reveal period ended");
        require(isMember[msg.sender], "Not a member");
        require(!hasRevealed[msg.sender], "Already revealed");
        require(option < optionCount, "Invalid option");

        bytes32 expected = keccak256(abi.encodePacked(option, salt));
        require(expected == commitments[msg.sender], "Commitment mismatch");

        revealedVotes[msg.sender] = option;
        hasRevealed[msg.sender] = true;
        voteTally[option]++;
        totalRevealed++;

        emit VoteRevealed(msg.sender, option);
    }

    /// @notice Reveal window doldugunda oylamayi bitirir
    function finishVoting() external {
        require(phase == Phase.REVEAL, "Not reveal phase");
        require(block.timestamp > revealDeadline, "Reveal window still open");

        phase = Phase.FINISHED;

        emit VotingFinished();
    }

    /// @notice Oylama bittikten sonra owner stake'ini geri ceker
    function withdrawStake() external onlyOwner {
        require(phase == Phase.FINISHED, "Not finished");
        require(stake > 0, "No stake");

        uint256 amount = stake;
        stake = 0;

        (bool success,) = owner.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    /// @notice Belirli bir secenegin oy sayisini dondurur
    function getVoteTally(uint256 option) external view returns (uint256) {
        require(option < optionCount, "Invalid option");
        return voteTally[option];
    }
}
