// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Indelebile, IERC20, IUniswapV2Router} from "../src/Indelebile.sol";
import {TestJustice} from "../src/testnet/TestJustice.sol";
import {TestRouter, ITestJustice} from "../src/testnet/TestRouter.sol";

/// Deploys Indelebile, plus testnet stand-ins for $JUSTICE and the DEX
/// router when real addresses are not supplied.
///
///   forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast
///
/// Environment:
///   TREASURY     required — where swept fees land
///   JUSTICE      optional — real token; a TestJustice is deployed if unset
///   ROUTER       optional — real router; a TestRouter is deployed if unset.
///                Pass the zero address deliberately to deploy with no swap
///                route at all: sweepAndBuy is then dead and sweepEth is the
///                only way out. That is the right choice when the token's
///                liquidity is too thin for an automatic swap to be honest.
///   MIN_FEE      optional — wei, default 0.001 ether
///   MIN_BALANCE  optional — wei, default 100,000e18
///   PROTOCOL     optional — protocol tag, default "indelebile".
///                Use "indelebile-test" for a rehearsal: the
///                production indexer rejects any other tag, so rehearsal
///                entries can never be mistaken for the archive.
contract Deploy is Script {
    function run() external {
        address treasury = vm.envAddress("TREASURY");
        address justice = vm.envOr("JUSTICE", address(0));
        // Distinguish "unset" from "deliberately none": envOr cannot, so a
        // separate flag carries the intent.
        bool noRouter = vm.envOr("NO_ROUTER", false);
        address router = vm.envOr("ROUTER", address(0));
        uint256 minFee = vm.envOr("MIN_FEE", uint256(0.001 ether));
        uint256 minBalance = vm.envOr("MIN_BALANCE", uint256(100_000 ether));
        string memory protocol = vm.envOr("PROTOCOL", string("indelebile"));
        string memory head = string.concat(
            'data:application/json;charset=utf-8;rule=esip6,{"p":"', protocol, '","v":1,"author":"0x'
        );

        bool needsStubs = justice == address(0) || (router == address(0) && !noRouter);
        // The stand-ins have an open faucet and a fixed-rate swap. On
        // mainnet that would hand anyone an unlimited supply and drain the
        // fees, so refuse rather than rely on the operator noticing.
        require(!(needsStubs && block.chainid == 1), "refusing to deploy testnet stubs to mainnet");
        require(treasury != address(0), "TREASURY not set");

        vm.startBroadcast();

        if (justice == address(0)) {
            justice = address(new TestJustice());
            console.log("TestJustice   ", justice);
        }
        if (router == address(0) && !noRouter) {
            router = address(new TestRouter(ITestJustice(justice)));
            console.log("TestRouter    ", router);
        }
        if (noRouter) {
            console.log("router        ", address(0), "- sweepAndBuy disabled, sweepEth only");
        }

        Indelebile jj = new Indelebile(
            IERC20(justice), IUniswapV2Router(router), treasury, minFee, minBalance, head
        );
        console.log("Indelebile    ", address(jj));
        console.log("protocol tag  ", protocol);

        vm.stopBroadcast();

        console.log("");
        console.log("--- paste into src/config.mjs ---");
        console.log("journalContract: '%s',", vm.toString(address(jj)));
        console.log("treasury:        '%s',", vm.toString(treasury));
        console.log("justiceToken:    '%s',", vm.toString(justice));
        console.log("minFeeWei:       %sn,", vm.toString(minFee));
        console.log("genesisBlock:    %s,", vm.toString(block.number));
        console.log("protocol:        '%s',", protocol);
        console.log("");
        console.log("--- paste into web/app.js ---");
        console.log("JOURNAL: '%s',", vm.toString(address(jj)));
        console.log("JUSTICE: '%s',", vm.toString(justice));
    }
}
