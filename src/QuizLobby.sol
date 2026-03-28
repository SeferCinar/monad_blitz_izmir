// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract QuizLobby {
    enum Phase { PENDING, ACTIVE, REVEAL, FINISHED }

    address public owner;
    string public name;
    uint256 public questionCount;
    uint256 public questionDuration;
    uint256 public revealWindow;
    bytes32[] public keyCommits;
    bytes32 public ipfsCID;
    uint256 public stake;

    Phase public phase;
    uint256 public currentQuestion;
    uint256 public revealDeadline;

    mapping(uint256 => uint256) public questionStartTime;
    mapping(uint256 => bytes32) public revealedKeys;

    address[] public members;
    mapping(address => bool) public isMember;

    // participant => questionIndex => commitment hash
    mapping(address => mapping(uint256 => bytes32)) public commitments;
    // participant => questionIndex => revealed answer
    mapping(address => mapping(uint256 => string)) public revealedAnswers;
    // participant => questionIndex => whether revealed
    mapping(address => mapping(uint256 => bool)) public hasRevealed;

    event MemberJoined(address indexed member);
    event QuizStarted(uint256 startTime);
    event QuestionRevealed(uint256 indexed questionIndex, bytes32 key);
    event AnswerCommitted(address indexed participant, uint256 indexed questionIndex);
    event AnswerRevealed(address indexed participant, uint256 indexed questionIndex, string answer);
    event RevealPhaseStarted(uint256 deadline);
    event QuizFinished();
    event StakeSlashed(uint256 amountPerMember);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _owner,
        string memory _name,
        uint256 _questionCount,
        uint256 _questionDuration,
        uint256 _revealWindow,
        bytes32[] memory _keyCommits,
        bytes32 _ipfsCID
    ) payable {
        owner = _owner;
        name = _name;
        questionCount = _questionCount;
        questionDuration = _questionDuration;
        revealWindow = _revealWindow;
        keyCommits = _keyCommits;
        ipfsCID = _ipfsCID;
        stake = msg.value;
        phase = Phase.PENDING;
    }

    /// @notice Lobiye katil
    function joinLobby() external {
        require(phase == Phase.PENDING, "Lobby not open");
        require(!isMember[msg.sender], "Already a member");
        require(msg.sender != owner, "Owner cannot join");

        isMember[msg.sender] = true;
        members.push(msg.sender);

        emit MemberJoined(msg.sender);
    }

    /// @notice Owner quiz'i baslatir
    function startQuiz() external onlyOwner {
        require(phase == Phase.PENDING, "Already started");
        require(members.length > 0, "No members");

        phase = Phase.ACTIVE;
        currentQuestion = 0;
        questionStartTime[0] = block.timestamp;

        emit QuizStarted(block.timestamp);
    }

    /// @notice Soru anahtarini acar — herkes cagirabillir (trustless)
    function revealKey(uint256 questionIndex, bytes32 key) external {
        require(phase == Phase.ACTIVE, "Not active");
        require(questionIndex == currentQuestion, "Sira disi acma");
        require(
            block.timestamp >= questionStartTime[questionIndex] + questionDuration,
            "Sure dolmadi"
        );
        require(
            keccak256(abi.encodePacked(key)) == keyCommits[questionIndex],
            "Yanlis anahtar"
        );

        revealedKeys[questionIndex] = key;

        emit QuestionRevealed(questionIndex, key);

        currentQuestion++;

        if (currentQuestion >= questionCount) {
            // Tum sorular acildi — reveal phase'e gec
            phase = Phase.REVEAL;
            revealDeadline = block.timestamp + revealWindow;
            emit RevealPhaseStarted(revealDeadline);
        } else {
            questionStartTime[currentQuestion] = block.timestamp;
        }
    }

    /// @notice Katilimci cevap hash'ini gonderir (quiz sirasinda)
    function commitAnswer(uint256 questionIndex, bytes32 commitment) external {
        require(phase == Phase.ACTIVE, "Not active");
        require(isMember[msg.sender], "Lobi uyesi degil");
        require(questionIndex == currentQuestion, "Sira disi");
        require(commitments[msg.sender][questionIndex] == bytes32(0), "Zaten commit edildi");
        require(
            block.timestamp < questionStartTime[questionIndex] + questionDuration,
            "Sure doldu"
        );

        commitments[msg.sender][questionIndex] = commitment;

        emit AnswerCommitted(msg.sender, questionIndex);
    }

    /// @notice Quiz bittikten sonra cevaplari acar
    function revealAnswer(uint256 questionIndex, string calldata answer, bytes32 salt) external {
        require(phase == Phase.REVEAL, "Henuz reveal asamasi degil");
        require(block.timestamp <= revealDeadline, "Reveal suresi doldu");
        require(isMember[msg.sender], "Lobi uyesi degil");
        require(!hasRevealed[msg.sender][questionIndex], "Zaten reveal edildi");
        require(questionIndex < questionCount, "Gecersiz soru");

        bytes32 expected = keccak256(abi.encodePacked(answer, salt));
        require(expected == commitments[msg.sender][questionIndex], "Yanlis cevap veya salt");

        revealedAnswers[msg.sender][questionIndex] = answer;
        hasRevealed[msg.sender][questionIndex] = true;

        emit AnswerRevealed(msg.sender, questionIndex, answer);
    }

    /// @notice Reveal suresi doldugunda quiz'i bitirir
    function finishQuiz() external {
        require(phase == Phase.REVEAL, "Not in reveal phase");
        require(block.timestamp > revealDeadline, "Reveal window still open");

        phase = Phase.FINISHED;

        emit QuizFinished();
    }

    /// @notice Owner tum anahtarlari acmadiysa stake katilimcilara dagilir
    function claimSlashedStake() external {
        require(phase == Phase.ACTIVE, "Not active");
        require(currentQuestion < questionCount, "All keys revealed");

        // Owner'a anahtari acmasi icin ekstra sure tanimla
        // Son sorunun suresi + revealWindow kadar bekle
        uint256 deadline = questionStartTime[currentQuestion] + questionDuration + revealWindow;
        require(block.timestamp > deadline, "Owner still has time");

        uint256 count = members.length;
        require(count > 0, "No members");

        phase = Phase.FINISHED;
        uint256 amountPerMember = stake / count;

        emit StakeSlashed(amountPerMember);

        for (uint256 i = 0; i < count; i++) {
            (bool success,) = members[i].call{value: amountPerMember}("");
            require(success, "Transfer failed");
        }
    }

    /// @notice Uyeler listesinin boyutunu dondurur
    function memberCount() external view returns (uint256) {
        return members.length;
    }
}
