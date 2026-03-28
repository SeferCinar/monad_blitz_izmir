// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LobbyFactory} from "../src/LobbyFactory.sol";
import {QuizLobby} from "../src/QuizLobby.sol";

contract QuizLobbyTest is Test {
    LobbyFactory public factory;
    QuizLobby public quiz;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 public constant QUESTION_COUNT = 3;
    uint256 public constant QUESTION_DURATION = 300; // 5 min
    uint256 public constant REVEAL_WINDOW = 600; // 10 min
    uint256 public constant STAKE = 1 ether;

    // Deterministik master key ve turetilmis anahtarlar
    bytes32[] public keys;
    bytes32[] public keyCommits;
    bytes32 public ipfsCID = keccak256("ipfs-test-cid");

    function setUp() public {
        vm.deal(owner, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);

        // Soru anahtarlarini olustur
        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            bytes32 key = keccak256(abi.encodePacked("master-key", i));
            keys.push(key);
            keyCommits.push(keccak256(abi.encodePacked(key)));
        }

        factory = new LobbyFactory(0);

        vm.prank(owner);
        address lobbyAddr = factory.createQuizLobby{value: STAKE}(
            QUESTION_COUNT, QUESTION_DURATION, REVEAL_WINDOW, keyCommits, ipfsCID
        );
        quiz = QuizLobby(lobbyAddr);
    }

    // ==================== Join Tests ====================

    function test_JoinLobby_Success() public {
        vm.prank(alice);
        quiz.joinLobby();

        assertTrue(quiz.isMember(alice));
        assertEq(quiz.memberCount(), 1);
        assertEq(quiz.members(0), alice);
    }

    function test_JoinLobby_OwnerCannotJoin() public {
        vm.prank(owner);
        vm.expectRevert("Owner cannot join");
        quiz.joinLobby();
    }

    function test_JoinLobby_AlreadyMember() public {
        vm.prank(alice);
        quiz.joinLobby();

        vm.prank(alice);
        vm.expectRevert("Already a member");
        quiz.joinLobby();
    }

    function test_JoinLobby_NotPending() public {
        _joinMembers();
        _startQuiz();

        vm.prank(charlie);
        vm.expectRevert("Lobby not open");
        quiz.joinLobby();
    }

    // ==================== Start Quiz Tests ====================

    function test_StartQuiz_Success() public {
        _joinMembers();

        vm.prank(owner);
        quiz.startQuiz();

        assertEq(uint256(quiz.phase()), uint256(QuizLobby.Phase.ACTIVE));
        assertEq(quiz.currentQuestion(), 0);
        assertEq(quiz.questionStartTime(0), block.timestamp);
    }

    function test_StartQuiz_OnlyOwner() public {
        _joinMembers();

        vm.prank(alice);
        vm.expectRevert("Not owner");
        quiz.startQuiz();
    }

    function test_StartQuiz_NoMembers() public {
        vm.prank(owner);
        vm.expectRevert("No members");
        quiz.startQuiz();
    }

    // ==================== Commit Answer Tests ====================

    function test_CommitAnswer_Success() public {
        _joinMembers();
        _startQuiz();

        bytes32 commitment = keccak256(abi.encodePacked("A", bytes32(uint256(123))));

        vm.prank(alice);
        quiz.commitAnswer(0, commitment);

        assertEq(quiz.commitments(alice, 0), commitment);
    }

    function test_CommitAnswer_NotMember() public {
        _joinMembers();
        _startQuiz();

        vm.prank(charlie);
        vm.expectRevert("Lobi uyesi degil");
        quiz.commitAnswer(0, keccak256("answer"));
    }

    function test_CommitAnswer_WrongQuestion() public {
        _joinMembers();
        _startQuiz();

        vm.prank(alice);
        vm.expectRevert("Sira disi");
        quiz.commitAnswer(1, keccak256("answer"));
    }

    function test_CommitAnswer_AlreadyCommitted() public {
        _joinMembers();
        _startQuiz();

        vm.prank(alice);
        quiz.commitAnswer(0, keccak256("answer1"));

        vm.prank(alice);
        vm.expectRevert("Zaten commit edildi");
        quiz.commitAnswer(0, keccak256("answer2"));
    }

    function test_CommitAnswer_TimeExpired() public {
        _joinMembers();
        _startQuiz();

        vm.warp(block.timestamp + QUESTION_DURATION);

        vm.prank(alice);
        vm.expectRevert("Sure doldu");
        quiz.commitAnswer(0, keccak256("answer"));
    }

    // ==================== Reveal Key Tests ====================

    function test_RevealKey_Success() public {
        _joinMembers();
        _startQuiz();

        // Sure dolmasini bekle
        vm.warp(block.timestamp + QUESTION_DURATION);

        // Herkes cagirabillir — alice cagiriyor
        vm.prank(alice);
        quiz.revealKey(0, keys[0]);

        assertEq(quiz.revealedKeys(0), keys[0]);
        assertEq(quiz.currentQuestion(), 1);
        assertEq(quiz.questionStartTime(1), block.timestamp);
    }

    function test_RevealKey_WrongKey() public {
        _joinMembers();
        _startQuiz();

        vm.warp(block.timestamp + QUESTION_DURATION);

        vm.expectRevert("Yanlis anahtar");
        quiz.revealKey(0, keccak256("wrong-key"));
    }

    function test_RevealKey_TooEarly() public {
        _joinMembers();
        _startQuiz();

        // Sure dolmadan cagir
        vm.expectRevert("Sure dolmadi");
        quiz.revealKey(0, keys[0]);
    }

    function test_RevealKey_OutOfOrder() public {
        _joinMembers();
        _startQuiz();

        vm.warp(block.timestamp + QUESTION_DURATION);

        vm.expectRevert("Sira disi acma");
        quiz.revealKey(1, keys[1]);
    }

    function test_RevealKey_TransitionsToRevealPhase() public {
        _joinMembers();
        _startQuiz();

        // Tum sorulari ac
        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            vm.warp(block.timestamp + QUESTION_DURATION);
            quiz.revealKey(i, keys[i]);
        }

        assertEq(uint256(quiz.phase()), uint256(QuizLobby.Phase.REVEAL));
        assertEq(quiz.currentQuestion(), QUESTION_COUNT);
        assertTrue(quiz.revealDeadline() > 0);
    }

    function test_RevealKey_AnyoneCanCall() public {
        _joinMembers();
        _startQuiz();

        vm.warp(block.timestamp + QUESTION_DURATION);

        // Uye olmayan biri bile cagirabillir
        vm.prank(charlie);
        quiz.revealKey(0, keys[0]);

        assertEq(quiz.revealedKeys(0), keys[0]);
    }

    // ==================== Full Quiz Flow ====================

    function test_FullQuizFlow() public {
        // 1. Katilimcilar katilir
        vm.prank(alice);
        quiz.joinLobby();
        vm.prank(bob);
        quiz.joinLobby();

        // 2. Quiz baslar
        vm.prank(owner);
        quiz.startQuiz();

        // 3. Her soru icin: commit → sure dol → revealKey
        bytes32[3] memory aliceSalts;
        bytes32[3] memory bobSalts;
        string[3] memory aliceAnswers = ["A", "B", "C"];
        string[3] memory bobAnswers = ["A", "C", "C"];

        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            aliceSalts[i] = keccak256(abi.encodePacked("alice-salt", i));
            bobSalts[i] = keccak256(abi.encodePacked("bob-salt", i));

            // Commit
            vm.prank(alice);
            quiz.commitAnswer(i, keccak256(abi.encodePacked(aliceAnswers[i], aliceSalts[i])));
            vm.prank(bob);
            quiz.commitAnswer(i, keccak256(abi.encodePacked(bobAnswers[i], bobSalts[i])));

            // Sure dolsun, anahtari ac
            vm.warp(block.timestamp + QUESTION_DURATION);
            quiz.revealKey(i, keys[i]);
        }

        // 4. Reveal phase
        assertEq(uint256(quiz.phase()), uint256(QuizLobby.Phase.REVEAL));

        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            vm.prank(alice);
            quiz.revealAnswer(i, aliceAnswers[i], aliceSalts[i]);
            vm.prank(bob);
            quiz.revealAnswer(i, bobAnswers[i], bobSalts[i]);
        }

        // 5. Reveal window dolsun, quiz bitir
        vm.warp(block.timestamp + REVEAL_WINDOW + 1);
        quiz.finishQuiz();

        assertEq(uint256(quiz.phase()), uint256(QuizLobby.Phase.FINISHED));

        // Cevaplar dogrula
        assertEq(quiz.revealedAnswers(alice, 0), "A");
        assertEq(quiz.revealedAnswers(bob, 1), "C");
    }

    // ==================== Reveal Answer Tests ====================

    function test_RevealAnswer_WrongSalt() public {
        _joinMembers();
        _startQuiz();
        _commitAndAdvanceAll();

        vm.prank(alice);
        vm.expectRevert("Yanlis cevap veya salt");
        quiz.revealAnswer(0, "A", keccak256("wrong-salt"));
    }

    function test_RevealAnswer_NotInRevealPhase() public {
        _joinMembers();
        _startQuiz();

        vm.prank(alice);
        vm.expectRevert("Henuz reveal asamasi degil");
        quiz.revealAnswer(0, "A", keccak256("salt"));
    }

    function test_RevealAnswer_Expired() public {
        _joinMembers();
        _startQuiz();
        _commitAndAdvanceAll();

        vm.warp(quiz.revealDeadline() + 1);

        vm.prank(alice);
        vm.expectRevert("Reveal suresi doldu");
        quiz.revealAnswer(0, "A", keccak256("a-salt-0"));
    }

    function test_RevealAnswer_AlreadyRevealed() public {
        _joinMembers();
        _startQuiz();
        _commitAndAdvanceAll();

        bytes32 aliceSalt0 = keccak256(abi.encodePacked("a-salt-", uint256(0)));

        vm.prank(alice);
        quiz.revealAnswer(0, "A", aliceSalt0);

        vm.prank(alice);
        vm.expectRevert("Zaten reveal edildi");
        quiz.revealAnswer(0, "A", aliceSalt0);
    }

    // ==================== Finish Quiz Tests ====================

    function test_FinishQuiz_TooEarly() public {
        _joinMembers();
        _startQuiz();
        _commitAndAdvanceAll();

        vm.expectRevert("Reveal window still open");
        quiz.finishQuiz();
    }

    // ==================== Stake Slash Tests ====================

    function test_ClaimSlashedStake() public {
        _joinMembers();
        _startQuiz();

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        // Owner anahtari acmiyor, deadline gecsin
        vm.warp(block.timestamp + QUESTION_DURATION + REVEAL_WINDOW + 1);

        quiz.claimSlashedStake();

        assertEq(uint256(quiz.phase()), uint256(QuizLobby.Phase.FINISHED));
        assertEq(alice.balance, aliceBefore + STAKE / 2);
        assertEq(bob.balance, bobBefore + STAKE / 2);
    }

    function test_ClaimSlashedStake_TooEarly() public {
        _joinMembers();
        _startQuiz();

        vm.expectRevert("Owner still has time");
        quiz.claimSlashedStake();
    }

    function test_ClaimSlashedStake_AllKeysRevealed() public {
        _joinMembers();
        _startQuiz();
        _commitAndAdvanceAll();

        // Tum anahtarlar acildi, slash yapilamaz
        vm.expectRevert("Not active");
        quiz.claimSlashedStake();
    }

    // ==================== Helpers ====================

    function _joinMembers() internal {
        vm.prank(alice);
        quiz.joinLobby();
        vm.prank(bob);
        quiz.joinLobby();
    }

    function _startQuiz() internal {
        vm.prank(owner);
        quiz.startQuiz();
    }

    /// @dev Her soru icin commit + revealKey yapar, reveal phase'e gecer
    function _commitAndAdvanceAll() internal {
        for (uint256 i = 0; i < QUESTION_COUNT; i++) {
            bytes32 aliceSalt = keccak256(abi.encodePacked("a-salt-", i));
            bytes32 bobSalt = keccak256(abi.encodePacked("b-salt-", i));

            vm.prank(alice);
            quiz.commitAnswer(i, keccak256(abi.encodePacked("A", aliceSalt)));
            vm.prank(bob);
            quiz.commitAnswer(i, keccak256(abi.encodePacked("B", bobSalt)));

            vm.warp(block.timestamp + QUESTION_DURATION);
            quiz.revealKey(i, keys[i]);
        }
    }
}
