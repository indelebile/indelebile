// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

interface IUniswapV2Router {
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external payable returns (uint256[] memory);
    function WETH() external view returns (address);
}

/// @title Indelebile — an implementation of the AssangeDAO Justice Journal proposal
/// @notice Writes an entry into L1 calldata and mints it as an ethscription
///         owned by its author.
///
/// The contract enforces only what needs to be atomic with the write: the
/// fee and the holding gate. Sequence numbers, rate limits, length limits
/// and tag rules stay in the indexer, where they cost no gas. See SPEC.md.
///
/// Why a contract at all, when calldata alone would do: the Ethscriptions
/// protocol makes the creating transaction's recipient the initial owner,
/// so a direct send to the treasury would make the DAO the owner of every
/// author's entry. ESIP-3 lets a contract name the initial owner, which is
/// the only way to collect a fee and leave the author owning their words.
///
/// The content carries `rule=esip6`, which opts out of the protocol's
/// global uniqueness rule. ESIP-6 calls out this exact case: a contract
/// that has already taken a user's money cannot revert if the creation
/// fails as a duplicate.
contract Indelebile {
    /// @notice ESIP-3 (Smart Contract Ethscription Creations, live since
    ///         L1 block 18130000). The Ethscriptions indexer watches for
    ///         this exact signature; the name is not ours to change.
    event ethscriptions_protocol_CreateEthscription(address indexed initialOwner, string contentURI);

    /// @notice Our own index anchor. Cheaper to filter than the ESIP-2 log
    ///         and it records what the author actually paid.
    event EntryWritten(address indexed author, bytes32 indexed contentHash, uint256 fee);

    event Swept(address indexed caller, uint256 ethIn, uint256 justiceOut);

    IERC20 public immutable justice;
    IUniswapV2Router public immutable router;
    address public immutable treasury;
    uint256 public immutable minFee;
    uint256 public immutable minBalance;

    /// @notice Everything up to and including the author's address. The
    ///         contract writes this itself rather than accepting it, for
    ///         two reasons — see `writeEntry`.
    ///
    ///         Set at deployment rather than hardcoded, so a rehearsal can
    ///         run under a different protocol tag without a second copy of
    ///         this contract. The production indexer rejects any other tag
    ///         outright, which is what keeps a rehearsal out of the archive.
    string public head;

    /// Derived, never written down twice. A hardcoded length that disagreed
    /// with the string would corrupt the content cap silently.
    uint256 public immutable headLen;

    /// @notice Upper bound on one entry. 500 characters of Chinese is
    ///         1,500 bytes, plus the envelope and up to five tags.
    uint256 public constant MAX_CONTENT_BYTES = 2048;

    error FeeTooLow(uint256 sent, uint256 required);
    error BalanceTooLow(uint256 held, uint256 required);
    error EmptyContent();
    error ContentTooLong(uint256 length, uint256 max);
    error NothingToSweep();
    error TransferFailed();

    error EmptyHead();

    constructor(
        IERC20 _justice,
        IUniswapV2Router _router,
        address _treasury,
        uint256 _minFee,
        uint256 _minBalance,
        string memory _head
    ) {
        if (bytes(_head).length == 0) revert EmptyHead();
        head = _head;
        headLen = bytes(_head).length;
        justice = _justice;
        router = _router;
        treasury = _treasury;
        minFee = _minFee;
        minBalance = _minBalance;
    }

    /// @notice Write one journal entry.
    /// @param entryTail everything after the author's address, beginning
    ///        with the closing quote: `","seq":0,"ts":...,"tags":[],"body":"..."}`
    ///
    /// The contract assembles the dataURI rather than accepting a finished
    /// one. Two things follow, and neither is available to a function that
    /// takes the whole string:
    ///
    /// 1. `author` equals `msg.sender` by construction. The indexer still
    ///    checks it, but the check can no longer fail.
    /// 2. The calldata contains no `data:` prefix, so it cannot itself be
    ///    read as a dataURI. This matters because ESIP-3 allows only one
    ///    ethscription per transaction and gives calldata priority over
    ///    events: an indexer that matched a dataURI anywhere in the
    ///    calldata rather than only at its start would create the
    ///    ethscription from calldata instead of from our event, and its
    ///    owner would be `tx.to` — this contract — on every single entry.
    ///    The published spec anchors its regex, so that would be a
    ///    non-conforming indexer. Not depending on it is cheap.
    ///
    /// What is still not guaranteed: the tail is JSON written by the
    /// caller, so key order, escaping and field types remain the client's
    /// responsibility and the indexer's to check. A transaction can satisfy
    /// this function and still be rejected, spending the fee. The frontend
    /// must validate locally first.
    function writeEntry(string calldata entryTail) external payable {
        if (msg.value < minFee) revert FeeTooLow(msg.value, minFee);
        uint256 held = justice.balanceOf(msg.sender);
        if (held < minBalance) revert BalanceTooLow(held, minBalance);
        if (bytes(entryTail).length == 0) revert EmptyContent();

        uint256 total = headLen + 40 + bytes(entryTail).length;
        if (total > MAX_CONTENT_BYTES) revert ContentTooLong(total, MAX_CONTENT_BYTES);

        string memory contentURI = string.concat(head, _hexAddress(msg.sender), entryTail);

        emit ethscriptions_protocol_CreateEthscription(msg.sender, contentURI);
        emit EntryWritten(msg.sender, keccak256(bytes(contentURI)), msg.value);
    }

    /// Lowercase 40-character hex, no `0x`. Must match how the indexer
    /// lowercases addresses, or `author` would never equal the initial
    /// owner.
    ///
    /// Written in assembly because the obvious Solidity loop bounds-checks
    /// and read-modify-writes a full word per character: 16,600 gas for
    /// forty of them, against roughly 900 here. `mstore8` writes one byte,
    /// and `byte(n, SYM)` indexes the lookup directly on the stack.
    function _hexAddress(address a) internal pure returns (string memory out) {
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

    /// @notice Swap the accumulated fees into $JUSTICE for the treasury.
    ///
    /// Deliberately not done inside `write`. Per-entry swapping would add
    /// well over 100k gas to every entry and would route two-dollar trades
    /// through a thin pool, where slippage and sandwiching eat the fee. It
    /// would also couple writing an entry to DEX liquidity: a failed swap
    /// would revert the entry. Batching decouples the two — a failed sweep
    /// costs the caller gas and nothing else, and is simply retried.
    ///
    /// Permissionless: the caller picks `minOut`, the proceeds can only go
    /// to the immutable treasury, so there is nothing to capture.
    function sweepAndBuy(uint256 minOut, uint256 deadline) external returns (uint256 justiceOut) {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToSweep();

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = address(justice);

        uint256[] memory amounts =
            router.swapExactETHForTokens{value: amount}(minOut, path, treasury, deadline);
        justiceOut = amounts[amounts.length - 1];
        emit Swept(msg.sender, amount, justiceOut);
    }

    /// @notice Escape hatch: move fees to the treasury as ETH.
    /// Needed because `sweepAndBuy` depends on a pool that may be thin,
    /// paused, or migrated. The destination is immutable, so this is safe
    /// to leave permissionless.
    function sweepEth() external returns (uint256 amount) {
        amount = address(this).balance;
        if (amount == 0) revert NothingToSweep();
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Swept(msg.sender, amount, 0);
    }
}
