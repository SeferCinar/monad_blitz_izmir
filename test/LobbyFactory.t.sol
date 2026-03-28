// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LobbyFactory} from "../src/LobbyFactory.sol";
import {QuizLobby} from "../src/QuizLobby.sol";
import {VoteLobby} from "../src/VoteLobby.sol";

contract LobbyFactoryTest is Test {
    LobbyFactory public factory;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 public constant MIN_STAKE = 0.1 ether;

    function setUp() public {
        factory = new LobbyFactory(MIN_STAKE);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _makeKeyCommits(uint256 count) internal pure returns (bytes32[] memory) {
        bytes32[] memory commits = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            commits[i] = keccak256(abi.encodePacked("key", i));
        }
        return commits;
    }

    // --- Quiz Lobby Tests ---

    function test_CreateQuizLobby_Success() public {
        uint256 questionCount = 5;
        bytes32[] memory commits = _makeKeyCommits(questionCount);
        bytes32 cid = keccak256("ipfs-cid");
        uint256 stakeAmount = 1 ether;

        vm.prank(alice);
        address lobby = factory.createQuizLobby{value: stakeAmount}(
            questionCount, 300, 600, commits, cid
        );

        assertTrue(lobby != address(0));
        assertEq(factory.quizLobbyCount(), 1);
        assertEq(factory.quizLobbies(0), lobby);
        assertEq(factory.lobbyCreator(lobby), alice);
        assertTrue(factory.isQuizLobby(lobby));
        assertFalse(factory.isVoteLobby(lobby));
        assertEq(lobby.balance, stakeAmount);

        QuizLobby ql = QuizLobby(lobby);
        assertEq(ql.owner(), alice);
        assertEq(ql.questionCount(), questionCount);
        assertEq(ql.questionDuration(), 300);
        assertEq(ql.revealWindow(), 600);
        assertEq(ql.ipfsCID(), cid);
        assertEq(ql.stake(), stakeAmount);
    }

    function test_CreateQuizLobby_InsufficientStake() public {
        bytes32[] memory commits = _makeKeyCommits(3);

        vm.prank(alice);
        vm.expectRevert("Insufficient stake");
        factory.createQuizLobby{value: 0.01 ether}(3, 300, 600, commits, keccak256("cid"));
    }

    function test_CreateQuizLobby_CommitsLengthMismatch() public {
        bytes32[] memory commits = _makeKeyCommits(3);

        vm.prank(alice);
        vm.expectRevert("Commits length mismatch");
        factory.createQuizLobby{value: 1 ether}(5, 300, 600, commits, keccak256("cid"));
    }

    function test_CreateQuizLobby_ZeroQuestions() public {
        bytes32[] memory commits = new bytes32[](0);

        vm.prank(alice);
        vm.expectRevert("Zero questions");
        factory.createQuizLobby{value: 1 ether}(0, 300, 600, commits, keccak256("cid"));
    }

    function test_QuizLobbyCreated_Event() public {
        uint256 questionCount = 3;
        bytes32[] memory commits = _makeKeyCommits(questionCount);
        bytes32 cid = keccak256("ipfs-cid");
        uint256 stakeAmount = 0.5 ether;

        vm.prank(alice);
        vm.expectEmit(false, true, false, true);
        emit LobbyFactory.QuizLobbyCreated(address(0), alice, questionCount, stakeAmount, cid);
        factory.createQuizLobby{value: stakeAmount}(questionCount, 300, 600, commits, cid);
    }

    // --- Vote Lobby Tests ---

    function test_CreateVoteLobby_Success() public {
        uint256 stakeAmount = 0.5 ether;

        vm.prank(bob);
        address lobby = factory.createVoteLobby{value: stakeAmount}(4, 3600, 600);

        assertTrue(lobby != address(0));
        assertEq(factory.voteLobbyCount(), 1);
        assertEq(factory.voteLobbies(0), lobby);
        assertEq(factory.lobbyCreator(lobby), bob);
        assertTrue(factory.isVoteLobby(lobby));
        assertFalse(factory.isQuizLobby(lobby));
        assertEq(lobby.balance, stakeAmount);

        VoteLobby vl = VoteLobby(lobby);
        assertEq(vl.owner(), bob);
        assertEq(vl.optionCount(), 4);
        assertEq(vl.voteDuration(), 3600);
        assertEq(vl.revealWindow(), 600);
        assertEq(vl.stake(), stakeAmount);
    }

    function test_CreateVoteLobby_SingleOption() public {
        vm.prank(alice);
        vm.expectRevert("Need at least 2 options");
        factory.createVoteLobby{value: 1 ether}(1, 3600, 600);
    }

    // --- MinStake Tests ---

    function test_SetMinStake_Success() public {
        uint256 newStake = 0.5 ether;

        vm.expectEmit(true, true, true, true);
        emit LobbyFactory.MinStakeUpdated(MIN_STAKE, newStake);
        factory.setMinStake(newStake);

        assertEq(factory.minStake(), newStake);
    }

    function test_SetMinStake_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setMinStake(0.5 ether);
    }

    // --- Multiple Lobbies ---

    function test_CreateMultipleLobbies() public {
        bytes32[] memory commits3 = _makeKeyCommits(3);
        bytes32[] memory commits5 = _makeKeyCommits(5);
        bytes32 cid = keccak256("cid");

        vm.startPrank(alice);
        factory.createQuizLobby{value: 0.1 ether}(3, 300, 600, commits3, cid);
        factory.createQuizLobby{value: 0.2 ether}(5, 300, 600, commits5, cid);
        factory.createVoteLobby{value: 0.1 ether}(3, 3600, 600);
        vm.stopPrank();

        vm.startPrank(bob);
        factory.createQuizLobby{value: 0.5 ether}(3, 300, 600, commits3, cid);
        factory.createVoteLobby{value: 0.3 ether}(2, 1800, 300);
        vm.stopPrank();

        assertEq(factory.quizLobbyCount(), 3);
        assertEq(factory.voteLobbyCount(), 2);

        assertEq(factory.lobbyCreator(factory.quizLobbies(2)), bob);
        assertEq(factory.lobbyCreator(factory.voteLobbies(1)), bob);
    }
}
