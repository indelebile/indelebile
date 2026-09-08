// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";

/// What would it cost to also mint an ERC-721 for each entry?
/// Three levels, measured rather than guessed.
contract NftProbe {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event ethscriptions_protocol_CreateEthscription(address indexed initialOwner, string contentURI);

    string constant HEAD =
        'data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x';

    // minimal ERC-721 state
    uint256 public totalSupply;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    // level 3 only: content pointers for on-chain metadata
    mapping(uint256 => address) public contentPointer;

    /// level 1 — what we ship today: ethscription only
    function a_entryOnly(string calldata tail) external {
        emit ethscriptions_protocol_CreateEthscription(msg.sender, string.concat(HEAD, _hex(msg.sender), tail));
    }

    /// level 2 — plus an ERC-721 mint, metadata built from identity alone
    function b_withErc721(string calldata tail) external {
        emit ethscriptions_protocol_CreateEthscription(msg.sender, string.concat(HEAD, _hex(msg.sender), tail));
        uint256 id = ++totalSupply;
        ownerOf[id] = msg.sender;
        balanceOf[msg.sender] += 1;
        emit Transfer(address(0), msg.sender, id);
    }

    /// level 3 — plus the text stored on-chain via SSTORE2, so tokenURI can
    /// carry the entry itself rather than a pointer to it
    function c_withStoredContent(string calldata tail) external {
        string memory uri = string.concat(HEAD, _hex(msg.sender), tail);
        emit ethscriptions_protocol_CreateEthscription(msg.sender, uri);
        uint256 id = ++totalSupply;
        ownerOf[id] = msg.sender;
        balanceOf[msg.sender] += 1;
        contentPointer[id] = _sstore2(bytes(uri));
        emit Transfer(address(0), msg.sender, id);
    }

    /// Deploy data as contract bytecode: 200 gas per byte of code deposit.
    function _sstore2(bytes memory data) internal returns (address ptr) {
        bytes memory code = abi.encodePacked(hex"00", data); // STOP guard byte
        bytes memory creation = abi.encodePacked(
            hex"63", uint32(code.length), hex"80600E6000396000F3", code
        );
        assembly { ptr := create(0, add(creation, 32), mload(creation)) }
        require(ptr != address(0), "sstore2");
    }

    function _hex(address a) internal pure returns (string memory out) {
        bytes16 SYM = "0123456789abcdef";
        out = new string(40);
        assembly {
            let p := add(out, 32)
            let v := a
            for { let i := 40 } gt(i, 0) {} {
                i := sub(i, 1)
                mstore8(add(p, i), byte(and(v, 0xf), SYM))
                v := shr(4, v)
            }
        }
    }
}

contract NftCostTest is Test {
    NftProbe p;
    function setUp() public { p = new NftProbe(); }

    function test_Cost() public {
        bytes memory body = new bytes(1440); // the 493-character Chinese entry
        for (uint256 i; i < 1440; i += 3) { body[i] = 0xe8; body[i+1] = 0xae; body[i+2] = 0xb0; }
        string memory tail = string.concat('","seq":1,"ts":1757280000,"tags":["assange"],"body":"', string(body), '"}');

        uint256 g;
        g = gasleft(); p.a_entryOnly(tail);         uint256 a = g - gasleft();
        g = gasleft(); p.b_withErc721(tail);        uint256 b = g - gasleft();
        g = gasleft(); p.c_withStoredContent(tail); uint256 c = g - gasleft();

        console.log("1 ethscription only            ", a);
        console.log("2 + ERC-721 mint               ", b, "  (+%s)", b - a);
        console.log("3 + content stored on-chain    ", c, "  (+%s)", c - a);
    }
}
