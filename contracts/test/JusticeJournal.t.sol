// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console, Vm} from "forge-std/Test.sol";
import {JusticeJournal, IERC20, IUniswapV2Router} from "../src/JusticeJournal.sol";

contract MockJustice is IERC20 {
    mapping(address => uint256) public bal;
    function setBalance(address a, uint256 v) external { bal[a] = v; }
    function balanceOf(address a) external view returns (uint256) { return bal[a]; }
}

contract MockRouter is IUniswapV2Router {
    address public weth = address(0xEEEE);
    uint256 public rate = 1000;      // JUSTICE per wei
    bool public shouldRevert;
    mapping(address => uint256) public delivered;

    function setRevert(bool v) external { shouldRevert = v; }
    function WETH() external view returns (address) { return weth; }

    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata, address to, uint256 deadline)
        external payable returns (uint256[] memory amounts)
    {
        require(!shouldRevert, "pool");
        require(block.timestamp <= deadline, "expired");
        uint256 out = msg.value * rate;
        require(out >= amountOutMin, "slippage");
        delivered[to] += out;
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = out;
    }
}

contract RejectingTreasury {
    receive() external payable { revert("no"); }
}

contract JusticeJournalTest is Test {
    JusticeJournal jj;
    MockJustice justice;
    MockRouter router;
    address treasury = address(0xBEEF);
    address author = address(0xA11CE);
    address stranger = address(0x5747);

    uint256 constant FEE = 0.001 ether;
    uint256 constant GATE = 100_000 ether;

    // Byte-for-byte what src/entry.mjs produces.
    string constant HEAD =
        'data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x';
    /// Everything after the author's address — what a caller now supplies.
    string constant TAIL_EN =
        '","seq":0,"ts":1757280000,"tags":["assange"],"body":"March 10, 2024 -- I joined my first Julian Assange support rally. Today, I log this date into the Justice Journal."}';
    string constant EXPECTED_EN =
        'data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x00000000000000000000000000000000000a11ce","seq":0,"ts":1757280000,"tags":["assange"],"body":"March 10, 2024 -- I joined my first Julian Assange support rally. Today, I log this date into the Justice Journal."}';

    /// ESIP-3
    event ethscriptions_protocol_CreateEthscription(address indexed initialOwner, string contentURI);
    event EntryWritten(address indexed author, bytes32 indexed contentHash, uint256 fee);

    function setUp() public {
        justice = new MockJustice();
        router = new MockRouter();
        jj = new JusticeJournal(justice, router, treasury, FEE, GATE);
        justice.setBalance(author, GATE);
        vm.deal(author, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    function test_WriteEmitsEsip2WithAuthorAsOwner() public {
        vm.expectEmit(true, false, false, true);
        emit ethscriptions_protocol_CreateEthscription(author, EXPECTED_EN);
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
    }

    /// The reason this contract exists: under ESIP-1 a direct send would
    /// make the recipient the owner. Here the author owns their entry and
    /// the treasury only gets the fee.
    function test_TreasuryNeverOwnsTheEntry() public {
        vm.recordLogs();
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ethscriptions_protocol_CreateEthscription(address,string)");
        bool found;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) {
                found = true;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), author, "author must own it");
                assertTrue(address(uint160(uint256(logs[i].topics[1]))) != treasury);
            }
        }
        assertTrue(found, "no ESIP-2 event");
    }

    function test_RejectsUnderpaidWrite() public {
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(JusticeJournal.FeeTooLow.selector, FEE - 1, FEE));
        jj.writeEntry{value: FEE - 1}(TAIL_EN);
    }

    function test_RejectsAuthorBelowHoldingGate() public {
        justice.setBalance(stranger, GATE - 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(JusticeJournal.BalanceTooLow.selector, GATE - 1, GATE));
        jj.writeEntry{value: FEE}(TAIL_EN);
    }

    /// The question this answers: can anyone push arbitrary calldata into
    /// the Journal? The contract writes the protocol header itself, so a
    /// caller cannot choose it at all — the worst they can do is supply a
    /// malformed tail, which the indexer rejects.
    function test_CallerCannotChooseTheHeader() public {
        vm.recordLogs();
        vm.prank(author);
        jj.writeEntry{value: FEE}('","seq":0,"ts":1,"tags":[],"body":"x"}');
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ethscriptions_protocol_CreateEthscription(address,string)");
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            string memory uri = abi.decode(logs[i].data, (string));
            assertEq(_slice(bytes(uri), 0, 88), HEAD, "header must be ours");
        }
    }

    /// The author field is written by the contract, so it cannot disagree
    /// with the ESIP-3 initial owner.
    function test_AuthorIsAlwaysTheSender() public {
        vm.recordLogs();
        vm.prank(author);
        jj.writeEntry{value: FEE}('","seq":0,"ts":1,"tags":[],"body":"x"}');
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 sig = keccak256("ethscriptions_protocol_CreateEthscription(address,string)");
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].topics[0] != sig) continue;
            string memory uri = abi.decode(logs[i].data, (string));
            // lowercase hex of address(0xA11CE), 40 chars, right after HEAD
            assertEq(_slice(bytes(uri), 88, 40), "00000000000000000000000000000000000a11ce");
        }
    }

    function _slice(bytes memory b, uint256 from, uint256 len) internal pure returns (string memory) {
        bytes memory out = new bytes(len);
        for (uint256 i; i < len; i++) out[i] = b[from + i];
        return string(out);
    }

    function test_RejectsOversizedContent() public {
        // The cap covers the assembled URI, not just what the caller sends.
        bytes memory big = new bytes(2048 - 88 - 40 + 1);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(JusticeJournal.ContentTooLong.selector, 2049, 2048));
        jj.writeEntry{value: FEE}(string(big));
    }

    /// 500 characters of Chinese must still fit under the cap.
    function test_MaxLengthChineseEntryFits() public {
        bytes memory body = new bytes(1500);
        for (uint256 i; i < 1500; i += 3) { body[i] = 0xe8; body[i+1] = 0xae; body[i+2] = 0xb0; }
        string memory tail = string.concat('","seq":0,"ts":1757280000,"tags":[],"body":"', string(body), '"}');
        assertLe(88 + 40 + bytes(tail).length, 2048, "a full-length Chinese entry must fit");
        vm.prank(author);
        jj.writeEntry{value: FEE}(tail);
    }

    function test_RejectsEmptyContent() public {
        vm.prank(author);
        vm.expectRevert(JusticeJournal.EmptyContent.selector);
        jj.writeEntry{value: FEE}("");
    }

    function test_ContractStoresNothing() public {
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
        // Only the fee accumulates; the content lives in calldata alone.
        assertEq(address(jj).balance, FEE);
    }

    function test_SweepAndBuySendsJusticeToTreasury() public {
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
        vm.prank(stranger); // permissionless
        uint256 out = jj.sweepAndBuy(FEE * 1000, block.timestamp + 60);
        assertEq(out, FEE * 1000);
        assertEq(router.delivered(treasury), FEE * 1000);
        assertEq(address(jj).balance, 0);
    }

    function test_SweepCallerCannotRedirectProceeds() public {
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
        vm.prank(stranger);
        jj.sweepAndBuy(0, block.timestamp + 60);
        assertEq(router.delivered(stranger), 0, "caller must not receive anything");
        assertEq(router.delivered(treasury), FEE * 1000);
    }

    function test_SweepHonoursSlippageBound() public {
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN);
        vm.prank(stranger);
        vm.expectRevert(bytes("slippage"));
        jj.sweepAndBuy(FEE * 1001, block.timestamp + 60);
    }

    /// A dead pool must not be able to strand the fees.
    function test_FailedSwapDoesNotBlockWritesAndEthEscapeWorks() public {
        router.setRevert(true);
        vm.prank(author);
        jj.writeEntry{value: FEE}(TAIL_EN); // writing is unaffected
        vm.prank(stranger);
        vm.expectRevert(bytes("pool"));
        jj.sweepAndBuy(0, block.timestamp + 60);

        vm.prank(stranger);
        uint256 amt = jj.sweepEth();
        assertEq(amt, FEE);
        assertEq(treasury.balance, FEE);
    }

    function test_SweepRevertsWhenEmpty() public {
        vm.expectRevert(JusticeJournal.NothingToSweep.selector);
        jj.sweepEth();
    }

    function test_StrayEthIsRejected() public {
        vm.prank(stranger);
        (bool ok,) = address(jj).call{value: 1 ether}("");
        assertFalse(ok, "contract should not accept bare transfers");
    }

    // ---- gas ----

    function test_GasEnglishEntry() public {
        vm.prank(author);
        uint256 g = gasleft();
        jj.writeEntry{value: FEE}(TAIL_EN);
        console.log("gas: 113-char English entry", g - gasleft() + 21000);
    }

    function test_GasMaxChineseEntry() public {
        // 500 Chinese characters at 3 UTF-8 bytes each, plus the envelope.
        bytes memory body = new bytes(1500);
        for (uint256 i; i < 1500; i += 3) { body[i] = 0xe8; body[i+1] = 0xae; body[i+2] = 0xb0; }
        string memory tail = string.concat('","seq":0,"ts":1757280000,"tags":[],"body":"', string(body), '"}');
        vm.prank(author);
        uint256 g = gasleft();
        jj.writeEntry{value: FEE}(tail);
        console.log("gas: 500-char Chinese entry", g - gasleft() + 21000);
    }
}
