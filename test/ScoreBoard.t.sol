// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LobbyFactory} from "../src/LobbyFactory.sol";
import {QuizLobby} from "../src/QuizLobby.sol";
import {ScoreBoard} from "../src/ScoreBoard.sol";

contract ScoreBoardTest is Test {
    LobbyFactory public factory;
    QuizLobby public quiz;
    ScoreBoard public board;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 public constant QUESTION_COUNT = 3;
    uint256 public constant QUESTION_DURATION = 300;
    uint256 public constant REVEAL_WINDOW = 600;
    uint256 public constant STAKE = 1 ether;

    bytes32[] public keys;
    bytes32[] public keyCommits;

    // Dogru cevaplar: A, B, C
    string[3] public correctAnswers = ["A", "B", "C"];

    function setUp() public {
        vm.deal(owner, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            bytes32 key = keccak256(abi.encodePacked("master-key", i));
            keys.push(key);
            keyCommits.push(keccak256(abi.encodePacked(key)));
        }

        factory = new LobbyFactory(0);

        vm.prank(owner);
        address lobbyAddr = factory.createQuizLobby{value: STAKE}(
            "Test Quiz", QUESTION_COUNT, QUESTION_DURATION, REVEAL_WINDOW, keyCommits, keccak256("cid")
        );
        quiz = QuizLobby(lobbyAddr);

        // Tam quiz akisi calistir
        _runFullQuiz();

        // ScoreBoard deploy
        board = new ScoreBoard(address(quiz));
    }

    // ==================== Submit Answers Tests ====================

    function test_SubmitCorrectAnswers_Success() public {
        bytes32[] memory hashes = _makeAnswerHashes();

        vm.prank(owner);
        board.submitCorrectAnswers(hashes);

        assertTrue(board.answersSubmitted());
        assertEq(board.correctAnswerHashes(0), keccak256(abi.encodePacked("A")));
        assertEq(board.correctAnswerHashes(1), keccak256(abi.encodePacked("B")));
        assertEq(board.correctAnswerHashes(2), keccak256(abi.encodePacked("C")));
    }

    function test_SubmitCorrectAnswers_NotOwner() public {
        bytes32[] memory hashes = _makeAnswerHashes();

        vm.prank(alice);
        vm.expectRevert("Not owner");
        board.submitCorrectAnswers(hashes);
    }

    function test_SubmitCorrectAnswers_AlreadySubmitted() public {
        bytes32[] memory hashes = _makeAnswerHashes();

        vm.prank(owner);
        board.submitCorrectAnswers(hashes);

        vm.prank(owner);
        vm.expectRevert("Already submitted");
        board.submitCorrectAnswers(hashes);
    }

    function test_SubmitCorrectAnswers_LengthMismatch() public {
        bytes32[] memory hashes = new bytes32[](2); // 3 olmali
        hashes[0] = keccak256(abi.encodePacked("A"));
        hashes[1] = keccak256(abi.encodePacked("B"));

        vm.prank(owner);
        vm.expectRevert("Length mismatch");
        board.submitCorrectAnswers(hashes);
    }

    function test_SubmitCorrectAnswers_QuizNotFinished() public {
        // Bitmemis quiz ile ScoreBoard olustur
        vm.prank(owner);
        address freshLobby = factory.createQuizLobby{value: STAKE}(
            "Fresh Quiz", QUESTION_COUNT, QUESTION_DURATION, REVEAL_WINDOW, keyCommits, keccak256("cid2")
        );
        ScoreBoard freshBoard = new ScoreBoard(freshLobby);

        bytes32[] memory hashes = _makeAnswerHashes();

        vm.prank(owner);
        vm.expectRevert("Quiz not finished");
        freshBoard.submitCorrectAnswers(hashes);
    }

    // ==================== Calculate Scores Tests ====================

    function test_CalculateScores_Success() public {
        _submitAnswers();

        board.calculateScores();

        assertTrue(board.scored());
        // Alice: A, B, C → 3/3 dogru
        assertEq(board.getScore(alice), 3);
        // Bob: A, C, C → 2/3 dogru (Q1 yanlis: C vs B)
        assertEq(board.getScore(bob), 2);
    }

    function test_CalculateScores_NotSubmitted() public {
        vm.expectRevert("Answers not submitted");
        board.calculateScores();
    }

    function test_CalculateScores_AlreadyScored() public {
        _submitAnswers();
        board.calculateScores();

        vm.expectRevert("Already scored");
        board.calculateScores();
    }

    function test_GetScore_NotScoredYet() public {
        _submitAnswers();

        vm.expectRevert("Not scored yet");
        board.getScore(alice);
    }

    // ==================== Full Integration ====================

    function test_FullScoringFlow() public {
        // Submit dogru cevaplar
        bytes32[] memory hashes = _makeAnswerHashes();
        vm.prank(owner);
        board.submitCorrectAnswers(hashes);

        // Skorla
        board.calculateScores();

        // Alice 3/3, Bob 2/3
        assertEq(board.getScore(alice), 3);
        assertEq(board.getScore(bob), 2);
    }

    function test_ScoreBoard_OwnerFromQuizLobby() public {
        assertEq(board.owner(), owner);
    }

    function test_AllWrong() public {
        // Tum cevaplar yanlis olan bir senaryo icin
        // correctAnswers = A, B, C ama hash'leri X, Y, Z olarak gonder
        bytes32[] memory wrongHashes = new bytes32[](3);
        wrongHashes[0] = keccak256(abi.encodePacked("X"));
        wrongHashes[1] = keccak256(abi.encodePacked("Y"));
        wrongHashes[2] = keccak256(abi.encodePacked("Z"));

        vm.prank(owner);
        board.submitCorrectAnswers(wrongHashes);
        board.calculateScores();

        // Kimsenin X, Y, Z cevabi yok — hepsi 0
        assertEq(board.getScore(alice), 0);
        assertEq(board.getScore(bob), 0);
    }

    // ==================== Helpers ====================

    function _makeAnswerHashes() internal pure returns (bytes32[] memory) {
        bytes32[] memory hashes = new bytes32[](3);
        hashes[0] = keccak256(abi.encodePacked("A"));
        hashes[1] = keccak256(abi.encodePacked("B"));
        hashes[2] = keccak256(abi.encodePacked("C"));
        return hashes;
    }

    function _submitAnswers() internal {
        bytes32[] memory hashes = _makeAnswerHashes();
        vm.prank(owner);
        board.submitCorrectAnswers(hashes);
    }

    /// @dev Tam quiz akisi: join → start → commit/reveal keys → reveal answers → finish
    function _runFullQuiz() internal {
        // Join
        vm.prank(alice);
        quiz.joinLobby();
        vm.prank(bob);
        quiz.joinLobby();

        // Start
        vm.prank(owner);
        quiz.startQuiz();

        // Alice cevaplari: A, B, C (3/3 dogru)
        // Bob cevaplari:   A, C, C (2/3 dogru — Q1 yanlis)
        string[3] memory aliceAnswers = ["A", "B", "C"];
        string[3] memory bobAnswers = ["A", "C", "C"];

        bytes32[3] memory aliceSalts;
        bytes32[3] memory bobSalts;

        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            aliceSalts[i] = keccak256(abi.encodePacked("a-salt", i));
            bobSalts[i] = keccak256(abi.encodePacked("b-salt", i));

            vm.prank(alice);
            quiz.commitAnswer(i, keccak256(abi.encodePacked(aliceAnswers[i], aliceSalts[i])));
            vm.prank(bob);
            quiz.commitAnswer(i, keccak256(abi.encodePacked(bobAnswers[i], bobSalts[i])));

            vm.warp(block.timestamp + QUESTION_DURATION);
            quiz.revealKey(i, keys[i]);
        }

        // Reveal answers
        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            vm.prank(alice);
            quiz.revealAnswer(i, aliceAnswers[i], aliceSalts[i]);
            vm.prank(bob);
            quiz.revealAnswer(i, bobAnswers[i], bobSalts[i]);
        }

        // Finish
        vm.warp(block.timestamp + REVEAL_WINDOW + 1);
        quiz.finishQuiz();
    }
}
