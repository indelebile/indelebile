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

/// @title Justice Journal
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
contract JusticeJournal {
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

    /// @notice The first 88 bytes of every canonical entry. The entry
    ///         format fixes the key order as p, v, author, ... so this
    ///         prefix is a constant — which is the only reason a useful
    ///         format check is affordable on-chain at all.
    ///
    ///         `data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x`
    bytes32 public constant PREFIX_HASH =
        keccak256('data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal","v":1,"author":"0x');
    uint256 public constant PREFIX_LEN = 88;

    /// @notice Upper bound on one entry. 500 characters of Chinese is
    ///         1,500 bytes, plus the envelope and up to five tags.
    uint256 public constant MAX_CONTENT_BYTES = 2048;

    error FeeTooLow(uint256 sent, uint256 required);
    error BalanceTooLow(uint256 held, uint256 required);
    error EmptyContent();
    error NotAJournalEntry();
    error ContentTooLong(uint256 length, uint256 max);
    error NothingToSweep();
    error TransferFailed();

    constructor(
        IERC20 _justice,
        IUniswapV2Router _router,
        address _treasury,
        uint256 _minFee,
        uint256 _minBalance
    ) {
        justice = _justice;
        router = _router;
        treasury = _treasury;
        minFee = _minFee;
        minBalance = _minBalance;
    }

    /// @notice Write one journal entry.
    /// @param contentURI the full `data:application/json;charset=utf-8,{...}`
    ///        string. It is never stored — it lives in this transaction's
    ///        calldata, which is the whole point.
    ///
    /// The prefix and length checks are cheap and worth their gas: without
    /// them `write("hello")` would succeed, take the fee, and mint an
    /// ethscription under this contract's name that the indexer then
    /// rejects — the author pays and gets nothing. They do not make the
    /// content valid. Full canonical validation means parsing JSON in
    /// Solidity, which is not worth doing; the remaining rules stay in the
    /// indexer, so a transaction can still satisfy this function and be
    /// rejected later. The frontend must validate locally first.
    function write(string calldata contentURI) external payable {
        if (msg.value < minFee) revert FeeTooLow(msg.value, minFee);
        uint256 held = justice.balanceOf(msg.sender);
        if (held < minBalance) revert BalanceTooLow(held, minBalance);

        bytes calldata content = bytes(contentURI);
        if (content.length == 0) revert EmptyContent();
        if (content.length > MAX_CONTENT_BYTES) revert ContentTooLong(content.length, MAX_CONTENT_BYTES);
        if (content.length < PREFIX_LEN || keccak256(content[:PREFIX_LEN]) != PREFIX_HASH) {
            revert NotAJournalEntry();
        }

        emit ethscriptions_protocol_CreateEthscription(msg.sender, contentURI);
        emit EntryWritten(msg.sender, keccak256(content), msg.value);
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
