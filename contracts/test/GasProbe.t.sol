// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";

/// Attribute the cost of assembling the URI on-chain, so the decision is
/// made on measurements rather than on a guess.
contract Probe {
    event E(address indexed a, string s);
    string constant HEAD =
        'data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x';

    /// baseline: emit the caller's calldata string directly
    function a_calldata(string calldata s) external { emit E(msg.sender, s); }

    /// emit a memory copy of it
    function b_memory(string calldata s) external {
        string memory m = s;
        emit E(msg.sender, m);
    }

    /// concat only
    function c_concat(string calldata s) external {
        emit E(msg.sender, string.concat(HEAD, s));
    }

    /// concat + hex address, i.e. the real thing
    function d_full(string calldata s) external {
        emit E(msg.sender, string.concat(HEAD, _hex(msg.sender), s));
    }

    /// same, single preallocated buffer
    function e_buffer(string calldata s) external {
        bytes memory head = bytes(HEAD);
        bytes memory out = new bytes(head.length + 40 + bytes(s).length);
        uint256 k;
        for (uint256 i; i < head.length; i++) out[k++] = head[i];
        bytes memory h = bytes(_hex(msg.sender));
        for (uint256 i; i < 40; i++) out[k++] = h[i];
        bytes memory t = bytes(s);
        for (uint256 i; i < t.length; i++) out[k++] = t[i];
        emit E(msg.sender, string(out));
    }

    /// the design before D-5: caller sends the finished URI, contract
    /// checks its prefix and emits it straight from calldata
    bytes32 constant PREFIX_HASH = keccak256(bytes(HEAD));
    function f_old(string calldata uri) external {
        bytes calldata c = bytes(uri);
        require(c.length >= 88 && keccak256(c[:88]) == PREFIX_HASH, "prefix");
        emit E(msg.sender, uri);
    }

    /// D-5 as shipped: assembly hex, single concat
    function g_new(string calldata s) external {
        emit E(msg.sender, string.concat(HEAD, _hexAsm(msg.sender), s));
    }

    function _hex(address a) internal pure returns (string memory) {
        bytes memory out = new bytes(40);
        uint160 v = uint160(a);
        for (uint256 i = 40; i > 0; i--) {
            uint8 n = uint8(v & 0xf);
            out[i - 1] = bytes1(n < 10 ? n + 0x30 : n + 0x57);
            v >>= 4;
        }
        return string(out);
    }

    function _hexAsm(address a) internal pure returns (string memory out) {
        bytes16 SYM = "0123456789abcdef";
        out = new string(40);
        assembly {
            let ptr := add(out, 32)
            let v := a
            for { let i := 40 } gt(i, 0) {} {
                i := sub(i, 1)
                mstore8(add(ptr, i), byte(and(v, 0xf), SYM))
                v := shr(4, v)
            }
        }
    }
}

contract GasProbeTest is Test {
    Probe p;
    function setUp() public { p = new Probe(); }

    function test_Attribution() public {
        // a realistic 500-character Chinese tail
        bytes memory body = new bytes(1500);
        for (uint256 i; i < 1500; i += 3) { body[i] = 0xe8; body[i+1] = 0xae; body[i+2] = 0xb0; }
        string memory tail = string.concat('","seq":0,"ts":1757280000,"tags":[],"body":"', string(body), '"}');

        uint256 g;
        g = gasleft(); p.a_calldata(tail); console.log("a calldata passthrough ", g - gasleft());
        g = gasleft(); p.b_memory(tail);   console.log("b memory copy          ", g - gasleft());
        g = gasleft(); p.c_concat(tail);   console.log("c + concat head        ", g - gasleft());
        g = gasleft(); p.d_full(tail);     console.log("d + hex address (real) ", g - gasleft());
        g = gasleft(); p.e_buffer(tail);   console.log("e single buffer        ", g - gasleft());

        // same content, expressed the way each design takes it
        string memory fullUri = string.concat(
            'data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x',
            "0000000000000000000000000000000000000000", tail);
        console.log("");
        console.log("--- same entry, both designs (execution only) ---");
        g = gasleft(); p.f_old(fullUri); console.log("before D-5: caller sends URI ", g - gasleft());
        g = gasleft(); p.g_new(tail);    console.log("after  D-5: contract builds  ", g - gasleft());
        console.log("calldata: URI is", bytes(fullUri).length, "bytes, tail is", bytes(tail).length);
    }
}
