// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ScoreBoard} from "../src/ScoreBoard.sol";

contract DeployScoreBoardScript is Script {
    function run() external {
        address quizLobby = vm.envAddress("QUIZ_LOBBY");

        vm.startBroadcast();

        ScoreBoard board = new ScoreBoard(quizLobby);

        vm.stopBroadcast();

        console.log("ScoreBoard deployed at:", address(board));
        console.log("QuizLobby:", quizLobby);
        console.log("Owner:", board.owner());
    }
}
