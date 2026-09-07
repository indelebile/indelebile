// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2Router} from "../JusticeJournal.sol";

interface ITestJustice {
    function faucet() external;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @notice Testnet stand-in for a DEX router. Exercises the sweep path
///         end to end without needing real Sepolia liquidity: it takes the
///         ETH and hands over tJUSTICE at a fixed rate, minting from the
///         faucet when it runs short. Never deploy this to mainnet.
contract TestRouter is IUniswapV2Router {
    ITestJustice public immutable token;
    uint256 public constant RATE = 1000; // tJUSTICE per wei

    constructor(ITestJustice _token) { token = _token; }

    function WETH() external pure returns (address) { return address(0xEeee); }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata, address to, uint256 deadline)
        external payable returns (uint256[] memory amounts)
    {
        require(block.timestamp <= deadline, "expired");
        uint256 out = msg.value * RATE;
        require(out >= amountOutMin, "slippage");
        while (token.balanceOf(address(this)) < out) token.faucet();
        require(token.transfer(to, out), "transfer");
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = out;
    }
}
