// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LobbyFactory} from "../src/LobbyFactory.sol";
import {VoteLobby} from "../src/VoteLobby.sol";

contract VoteLobbyTest is Test {
    LobbyFactory public factory;
    VoteLobby public vote;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 public constant OPTION_COUNT = 3;
    uint256 public constant VOTE_DURATION = 3600; // 1 saat
    uint256 public constant REVEAL_WINDOW = 600;  // 10 dk
    uint256 public constant STAKE = 0.5 ether;

    function setUp() public {
        vm.deal(owner, 10 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(charlie, 10 ether);

        factory = new LobbyFactory(0);

        vm.prank(owner);
        address lobbyAddr = factory.createVoteLobby{value: STAKE}(
            OPTION_COUNT, VOTE_DURATION, REVEAL_WINDOW
        );
        vote = VoteLobby(lobbyAddr);
    }

    // ==================== Join Tests ====================

    function test_JoinLobby_Success() public {
        vm.prank(alice);
        vote.joinLobby();

        assertTrue(vote.isMember(alice));
        assertEq(vote.memberCount(), 1);
    }

    function test_JoinLobby_OwnerCannotJoin() public {
        vm.prank(owner);
        vm.expectRevert("Owner cannot join");
        vote.joinLobby();
    }

    function test_JoinLobby_AlreadyMember() public {
        vm.prank(alice);
        vote.joinLobby();

        vm.prank(alice);
        vm.expectRevert("Already a member");
        vote.joinLobby();
    }

    // ==================== Start Voting Tests ====================

    function test_StartVoting_Success() public {
        _joinMembers();

        vm.prank(owner);
        vote.startVoting();

        assertEq(uint256(vote.phase()), uint256(VoteLobby.Phase.VOTING));
        assertEq(vote.voteStartTime(), block.timestamp);
    }

    function test_StartVoting_OnlyOwner() public {
        _joinMembers();

        vm.prank(alice);
        vm.expectRevert("Not owner");
        vote.startVoting();
    }

    function test_StartVoting_NoMembers() public {
        vm.prank(owner);
        vm.expectRevert("No members");
        vote.startVoting();
    }

    // ==================== Commit Vote Tests ====================

    function test_CommitVote_Success() public {
        _joinMembers();
        _startVoting();

        bytes32 commitment = keccak256(abi.encodePacked(uint256(0), bytes32(uint256(42))));

        vm.prank(alice);
        vote.commitVote(commitment);

        assertEq(vote.commitments(alice), commitment);
    }

    function test_CommitVote_NotMember() public {
        _joinMembers();
        _startVoting();

        vm.prank(charlie);
        vm.expectRevert("Not a member");
        vote.commitVote(keccak256("vote"));
    }

    function test_CommitVote_AlreadyCommitted() public {
        _joinMembers();
        _startVoting();

        vm.prank(alice);
        vote.commitVote(keccak256("vote1"));

        vm.prank(alice);
        vm.expectRevert("Already committed");
        vote.commitVote(keccak256("vote2"));
    }

    function test_CommitVote_PeriodEnded() public {
        _joinMembers();
        _startVoting();

        vm.warp(block.timestamp + VOTE_DURATION);

        vm.prank(alice);
        vm.expectRevert("Voting period ended");
        vote.commitVote(keccak256("vote"));
    }

    // ==================== End Voting Tests ====================

    function test_EndVoting_Success() public {
        _joinMembers();
        _startVoting();

        vm.warp(block.timestamp + VOTE_DURATION);
        vote.endVoting();

        assertEq(uint256(vote.phase()), uint256(VoteLobby.Phase.REVEAL));
        assertTrue(vote.revealDeadline() > 0);
    }

    function test_EndVoting_TooEarly() public {
        _joinMembers();
        _startVoting();

        vm.expectRevert("Voting still active");
        vote.endVoting();
    }

    // ==================== Reveal Vote Tests ====================

    function test_RevealVote_Success() public {
        _joinMembers();
        _startVoting();

        bytes32 salt = keccak256("alice-salt");
        uint256 option = 1;

        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(option, salt)));

        _endVoting();

        vm.prank(alice);
        vote.revealVote(option, salt);

        assertTrue(vote.hasRevealed(alice));
        assertEq(vote.revealedVotes(alice), option);
        assertEq(vote.voteTally(option), 1);
        assertEq(vote.totalRevealed(), 1);
    }

    function test_RevealVote_InvalidOption() public {
        _joinMembers();
        _startVoting();

        bytes32 salt = keccak256("salt");
        // Commit ile gecersiz option
        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(uint256(99), salt)));

        _endVoting();

        vm.prank(alice);
        vm.expectRevert("Invalid option");
        vote.revealVote(99, salt);
    }

    function test_RevealVote_CommitmentMismatch() public {
        _joinMembers();
        _startVoting();

        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(uint256(0), bytes32(uint256(1)))));

        _endVoting();

        vm.prank(alice);
        vm.expectRevert("Commitment mismatch");
        vote.revealVote(0, keccak256("wrong-salt"));
    }

    function test_RevealVote_AlreadyRevealed() public {
        _joinMembers();
        _startVoting();

        bytes32 salt = keccak256("salt");
        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(uint256(2), salt)));

        _endVoting();

        vm.prank(alice);
        vote.revealVote(2, salt);

        vm.prank(alice);
        vm.expectRevert("Already revealed");
        vote.revealVote(2, salt);
    }

    function test_RevealVote_Expired() public {
        _joinMembers();
        _startVoting();

        bytes32 salt = keccak256("salt");
        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(uint256(0), salt)));

        _endVoting();
        vm.warp(vote.revealDeadline() + 1);

        vm.prank(alice);
        vm.expectRevert("Reveal period ended");
        vote.revealVote(0, salt);
    }

    // ==================== Finish & Withdraw Tests ====================

    function test_FinishVoting_Success() public {
        _joinMembers();
        _startVoting();
        _endVoting();

        vm.warp(vote.revealDeadline() + 1);
        vote.finishVoting();

        assertEq(uint256(vote.phase()), uint256(VoteLobby.Phase.FINISHED));
    }

    function test_FinishVoting_TooEarly() public {
        _joinMembers();
        _startVoting();
        _endVoting();

        vm.expectRevert("Reveal window still open");
        vote.finishVoting();
    }

    function test_WithdrawStake_Success() public {
        _joinMembers();
        _startVoting();
        _endVoting();

        vm.warp(vote.revealDeadline() + 1);
        vote.finishVoting();

        uint256 ownerBefore = owner.balance;

        vm.prank(owner);
        vote.withdrawStake();

        assertEq(owner.balance, ownerBefore + STAKE);
        assertEq(vote.stake(), 0);
    }

    function test_WithdrawStake_OnlyOwner() public {
        _joinMembers();
        _startVoting();
        _endVoting();
        vm.warp(vote.revealDeadline() + 1);
        vote.finishVoting();

        vm.prank(alice);
        vm.expectRevert("Not owner");
        vote.withdrawStake();
    }

    function test_WithdrawStake_NotFinished() public {
        _joinMembers();
        _startVoting();

        vm.prank(owner);
        vm.expectRevert("Not finished");
        vote.withdrawStake();
    }

    // ==================== Full Flow ====================

    function test_FullVotingFlow() public {
        // 1. Katilim
        vm.prank(alice);
        vote.joinLobby();
        vm.prank(bob);
        vote.joinLobby();
        vm.prank(charlie);
        vote.joinLobby();

        // 2. Oylama basla
        vm.prank(owner);
        vote.startVoting();

        // 3. Commit — herkes gizli oy verir
        bytes32 aliceSalt = keccak256("a-salt");
        bytes32 bobSalt = keccak256("b-salt");
        bytes32 charlieSalt = keccak256("c-salt");

        vm.prank(alice);
        vote.commitVote(keccak256(abi.encodePacked(uint256(0), aliceSalt)));
        vm.prank(bob);
        vote.commitVote(keccak256(abi.encodePacked(uint256(0), bobSalt)));
        vm.prank(charlie);
        vote.commitVote(keccak256(abi.encodePacked(uint256(2), charlieSalt)));

        // 4. Oylama suresi dolsun
        vm.warp(block.timestamp + VOTE_DURATION);
        vote.endVoting();

        // 5. Reveal
        vm.prank(alice);
        vote.revealVote(0, aliceSalt);
        vm.prank(bob);
        vote.revealVote(0, bobSalt);
        vm.prank(charlie);
        vote.revealVote(2, charlieSalt);

        // 6. Sonuclari kontrol et
        assertEq(vote.voteTally(0), 2); // alice + bob
        assertEq(vote.voteTally(1), 0);
        assertEq(vote.voteTally(2), 1); // charlie
        assertEq(vote.totalRevealed(), 3);

        // 7. Bitir
        vm.warp(vote.revealDeadline() + 1);
        vote.finishVoting();

        assertEq(uint256(vote.phase()), uint256(VoteLobby.Phase.FINISHED));
    }

    // ==================== Helpers ====================

    function _joinMembers() internal {
        vm.prank(alice);
        vote.joinLobby();
        vm.prank(bob);
        vote.joinLobby();
    }

    function _startVoting() internal {
        vm.prank(owner);
        vote.startVoting();
    }

    function _endVoting() internal {
        vm.warp(block.timestamp + VOTE_DURATION);
        vote.endVoting();
    }
}
