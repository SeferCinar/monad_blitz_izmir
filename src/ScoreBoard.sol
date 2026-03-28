// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {QuizLobby} from "./QuizLobby.sol";

/// @title ScoreBoard
/// @notice Quiz bittikten sonra dogru cevaplari alir, katilimcilarin
///         revealed cevaplariyla karsilastirir ve puanlari zincire yazar.
contract ScoreBoard {
    QuizLobby public quizLobby;
    address public owner;

    // questionIndex => correct answer hash
    mapping(uint256 => bytes32) public correctAnswerHashes;
    bool public answersSubmitted;

    // participant => score
    mapping(address => uint256) public scores;
    bool public scored;

    event CorrectAnswersSubmitted(uint256 questionCount);
    event ScoresCalculated(uint256 participantCount);
    event ParticipantScored(address indexed participant, uint256 score);

    constructor(address _quizLobby) {
        quizLobby = QuizLobby(_quizLobby);
        owner = quizLobby.owner();
    }

    /// @notice Owner dogru cevap hash'lerini submit eder
    ///         Her cevap hash'i: keccak256(abi.encodePacked(answer))
    function submitCorrectAnswers(bytes32[] calldata _answerHashes) external {
        require(msg.sender == owner, "Not owner");
        require(!answersSubmitted, "Already submitted");
        require(
            uint256(quizLobby.phase()) == uint256(QuizLobby.Phase.FINISHED),
            "Quiz not finished"
        );
        require(_answerHashes.length == quizLobby.questionCount(), "Length mismatch");

        for (uint256 i = 0; i < _answerHashes.length; i++) {
            correctAnswerHashes[i] = _answerHashes[i];
        }

        answersSubmitted = true;

        emit CorrectAnswersSubmitted(_answerHashes.length);
    }

    /// @notice Tum katilimcilarin skorlarini hesaplar
    function calculateScores() external {
        require(answersSubmitted, "Answers not submitted");
        require(!scored, "Already scored");

        uint256 count = quizLobby.memberCount();
        uint256 qCount = quizLobby.questionCount();

        for (uint256 i = 0; i < count; i++) {
            address participant = quizLobby.members(i);
            uint256 score = 0;

            for (uint256 q = 0; q < qCount; q++) {
                // Sadece reveal edilmis cevaplari say
                if (!quizLobby.hasRevealed(participant, q)) continue;

                string memory answer = quizLobby.revealedAnswers(participant, q);
                bytes32 answerHash = keccak256(abi.encodePacked(answer));

                if (answerHash == correctAnswerHashes[q]) {
                    score++;
                }
            }

            scores[participant] = score;
            emit ParticipantScored(participant, score);
        }

        scored = true;

        emit ScoresCalculated(count);
    }

    /// @notice Katilimci skorunu dondurur
    function getScore(address participant) external view returns (uint256) {
        require(scored, "Not scored yet");
        return scores[participant];
    }
}
