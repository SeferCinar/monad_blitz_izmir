// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {QuizLobby} from "./QuizLobby.sol";
import {VoteLobby} from "./VoteLobby.sol";

contract LobbyFactory is Ownable {
    address[] public quizLobbies;
    address[] public voteLobbies;

    mapping(address => address) public lobbyCreator;
    mapping(address => bool) public isQuizLobby;
    mapping(address => bool) public isVoteLobby;

    uint256 public minStake;

    event QuizLobbyCreated(
        address indexed lobby,
        address indexed creator,
        uint256 questionCount,
        uint256 stake,
        bytes32 ipfsCID
    );

    event VoteLobbyCreated(
        address indexed lobby,
        address indexed creator,
        uint256 optionCount,
        uint256 stake
    );

    event MinStakeUpdated(uint256 oldMinStake, uint256 newMinStake);

    constructor(uint256 _minStake) Ownable(msg.sender) {
        minStake = _minStake;
    }

    function createQuizLobby(
        string calldata _name,
        uint256 _questionCount,
        uint256 _questionDuration,
        uint256 _revealWindow,
        bytes32[] calldata _keyCommits,
        bytes32 _ipfsCID
    ) external payable returns (address lobby) {
        require(msg.value >= minStake, "Insufficient stake");
        require(bytes(_name).length > 0, "Empty name");
        require(_questionCount > 0, "Zero questions");
        require(_keyCommits.length == _questionCount, "Commits length mismatch");
        require(_questionDuration > 0, "Zero duration");
        require(_revealWindow > 0, "Zero reveal window");

        lobby = address(
            new QuizLobby{value: msg.value}(
                msg.sender,
                _name,
                _questionCount,
                _questionDuration,
                _revealWindow,
                _keyCommits,
                _ipfsCID
            )
        );

        quizLobbies.push(lobby);
        lobbyCreator[lobby] = msg.sender;
        isQuizLobby[lobby] = true;

        emit QuizLobbyCreated(lobby, msg.sender, _questionCount, msg.value, _ipfsCID);
    }

    function createVoteLobby(
        string calldata _name,
        uint256 _optionCount,
        uint256 _voteDuration,
        uint256 _revealWindow
    ) external payable returns (address lobby) {
        require(msg.value >= minStake, "Insufficient stake");
        require(bytes(_name).length > 0, "Empty name");
        require(_optionCount > 1, "Need at least 2 options");
        require(_voteDuration > 0, "Zero duration");
        require(_revealWindow > 0, "Zero reveal window");

        lobby = address(
            new VoteLobby{value: msg.value}(
                msg.sender,
                _name,
                _optionCount,
                _voteDuration,
                _revealWindow
            )
        );

        voteLobbies.push(lobby);
        lobbyCreator[lobby] = msg.sender;
        isVoteLobby[lobby] = true;

        emit VoteLobbyCreated(lobby, msg.sender, _optionCount, msg.value);
    }

    function setMinStake(uint256 _minStake) external onlyOwner {
        emit MinStakeUpdated(minStake, _minStake);
        minStake = _minStake;
    }

    function quizLobbyCount() external view returns (uint256) {
        return quizLobbies.length;
    }

    function voteLobbyCount() external view returns (uint256) {
        return voteLobbies.length;
    }
}
