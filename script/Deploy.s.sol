// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {LobbyFactory} from "../src/LobbyFactory.sol";

contract DeployScript is Script {
    function run() external {
        uint256 minStake = vm.envOr("MIN_STAKE", uint256(0.01 ether));

        vm.startBroadcast();

        LobbyFactory factory = new LobbyFactory(minStake);

        vm.stopBroadcast();

        console.log("LobbyFactory deployed at:", address(factory));
        console.log("Min stake:", minStake);
        console.log("Owner:", factory.owner());
    }
}
