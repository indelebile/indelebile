# Indelebile — MVP requirements (draft v1, 2026-09-07)

## 0. One-paragraph summary

Journal entries are written into Ethereum L1 calldata and minted as
ethscriptions owned by their authors. A minimal contract collects the write
fee and enforces the $JUSTICE holding gate; everything else is decided by
an open-source indexer that anyone can re-run to reproduce the archive
byte for byte. No IPFS, no pinning bill, no privileged operator.

---

## 1. What problem the MVP solves

The approved concept stores entries on IPFS with a hash on-chain. That has
three failure modes, in increasing severity:

1. Pins expire — a permanent archive depending on an annual $1,500 invoice.
2. The chain holds a receipt, not the content — when the pin lapses, `Qm…`
   is all that survives.
3. It contradicts the premise — a censorship-resistance project custodying
   its archive with a company that can be served.

Calldata removes all three, costs less (§5), and eliminates the storage
contract entirely.

### Two things that shipped and are worth stating

**Deployments are a list.** Every contract parameter is immutable — the
treasury included — so the arrival of a DAO multisig means deploying again.
`journalContracts` carries each deployment with a block range so the
archive spans them; without it the archive would end at its own first
governance decision.

**Rehearsals run under a separate protocol tag.** `indelebile-test`
instead of `indelebile`. V5 demands an exact match, so mainnet can be
exercised with permanent entries while the archive itself stays empty until
the DAO starts it.

**Out of scope for MVP:** NFT marketplace, comments, likes, curation,
Snapshot integration, referral rewards, profile pages, ZK login. Every one
of those is additive later and none of them is needed to prove the thesis.

---

## 2. The architectural decision that drives everything

Under **ESIP-1**, the transaction recipient becomes the ethscription's
owner. A contract-free design that requires `tx.to == treasury` would make
**the DAO the owner of every author's entry** — which destroys any future
marketplace and is indefensible on its own terms.

**ESIP-3** lets a contract name the initial owner. That is the only
construction that collects a fee *and* leaves the author owning their own
words. Hence: one small contract, content in calldata, author owns the
entry, no storage writes.

This also resolves the ETH-vs-$JUSTICE fee question: the contract accepts
ETH and a **permissionless batched sweep** converts it to $JUSTICE for the
treasury (§4).

---

## 3. Functional requirements

### FR-1 Write an entry
- The composer is visible and usable **without a wallet**. Drafting,
  character counting, byte counting and local validation all work
  unconnected; only sending requires a wallet.
- Author composes ≤500 characters (Unicode code points, so Chinese has the
  same allowance as English), plus ≤5 tags.
- Client validates locally against every rule before offering to send.
  **The fee is spent even on an entry the indexer rejects**, so local
  validation is a requirement, not a nicety.
- Author calls `write(string contentURI)` with `msg.value ≥ minFee`.
- Submission defaults to a private RPC (§7).

### FR-2 Read the archive
- Anyone can regenerate the full index from L1 with one command and no
  privileged access.
- Viewer is a self-contained HTML file that opens from `file://` — a
  reviewer must be able to verify the archive without trusting our hosting.

### FR-3 Collect and convert fees
- Fees accumulate in the contract.
- `sweepAndBuy(minOut, deadline)` is permissionless; proceeds can only go
  to the immutable treasury.
- `sweepEth()` is the escape hatch if the pool is thin, paused or migrated.

### FR-4 Moderate without deleting
- `hidden.json` lists entry ids the DAO voted to collapse.
- The entry stays in the index and on L1; the viewer says it is hidden and
  links to the calldata.
- Nothing is ever deleted, because nothing *can* be.

---

## 4. Contract scope

`Indelebile.sol`, ~110 lines, no storage, no owner, no upgradeability.
All parameters immutable, set at deployment.

It enforces **only what must be atomic with the write**:

| enforced on-chain | why |
|---|---|
| `msg.value ≥ minFee` | the fee cannot be collected after the fact |
| `balanceOf(sender) ≥ 100,000 $JUSTICE` | must be true at write time |
| the header and author are written, not accepted | junk cannot be minted under the contract's name, and `author` cannot disagree with the sender (§7) |
| assembled content ≤ 2,048 bytes | bounds the ethscription; fits 500 Chinese characters plus envelope |

Everything else — sequence numbers, rate limits, length limits, tag rules,
uniqueness — stays in the indexer, where it costs no gas. Two consequences
worth stating plainly:

- Moving the holding gate on-chain means **the indexer no longer needs an
  archive node**. It reads logs on an ordinary RPC.
- A transaction can satisfy the contract and still be rejected by the
  indexer, spending the fee. FR-1's local validation exists for this.

### Why the swap is not inside `write()`

Swapping per entry would add >100k gas to every write, route $2 trades
through a thin pool where slippage and sandwiching eat the fee, and couple
writing an entry to DEX liquidity — a failed swap would revert the entry.
Batching decouples them: a failed sweep costs the caller gas and nothing
else, and is retried.

---

## 5. Cost (measured, not estimated)

Calibrated against a real transaction rather than a test harness. Sepolia
`0xa096836a…` spent **43,125 gas** on a 206-character English entry; once
EIP-7623's calldata charge is subtracted that leaves 17,341 gas of
execution, and recomputing the same entry from that constant lands within
0.3% of what the chain charged. (`forge` reported 28,622 — its harness
pays for the mock token call and the test frame, which no real transaction
does.) `node src/gas.mjs` recombines the two:

| entry | gas | @1 gwei | @5 gwei |
|---|---|---|---|
| 113-char English | 41,233 | 0.000041 ETH | 0.000206 ETH |
| 500-char Chinese | 83,950 | 0.000084 ETH | 0.000420 ETH |

Which of EIP-7623's two prices binds flips with length: a short English
entry pays the standard rate and a full-length Chinese one hits the floor,
where bytes are all that count and execution is free.

The premium collapses on longer entries: under EIP-7623 floor pricing a
data-heavy transaction pays for its bytes, and the contract's execution
rides underneath that floor for free. **Authors pay almost nothing for the
contract on exactly the entries the Journal is meant to encourage.**

At 5 gwei: ~$0.26 for a short English entry, ~$0.44 for a full-length
Chinese one. The original design (contract + SSTORE + IPFS hash) is
90–110k gas *plus* recurring pinning.

### Budget delta vs the $16–30k estimate
- **Removed:** IPFS/Filecoin integration and hosting ($500–1,500/yr);
  most of the storage-contract work.
- **Reduced:** audit scope — no storage, no owner, no upgradeability, no
  user funds held beyond unswept fees. Still needs review; it is smaller.
- **Added:** the indexer is now the protocol. It must be open source,
  reproducible, and run by more than one party.

**This is a transfer of cost and risk, not an elimination of it.** Say so.

---

## 6. Non-functional requirements

| # | requirement |
|---|---|
| NFR-1 | The index is reproducible: same block range in, byte-identical file out. Nothing may depend on wall-clock time, map ordering, or any source but L1. |
| NFR-2 | Indexing runs on an ordinary RPC. No archive node, no paid tier. |
| NFR-3 | The viewer is one self-contained file, no server, no external requests. |
| NFR-4 | No component holds a private key. Signing is always the author's wallet. |
| NFR-5 | Every governance parameter lives in one file, and changing it is a governance action with an effective-from block — never a silent edit. |
| NFR-6 | The archive survives its own redeployment. Contract parameters are immutable, so changing one means a new contract; `journalContracts` is a list of deployments with block ranges, and author state carries across the boundary. |
| NFR-7 | Reading the archive requires no RPC. The page reads the indexer's output and compares `entriesHash`; only writing touches a chain. |

---

## 7. Front-running — solved by ESIP-6

Ethscriptions enforce global content uniqueness by default, which made
front-running a real threat: an attacker could inscribe our bytes first and
the author would pay the fee for an entry that mints no ethscription.

**ESIP-6 was written for this exact case.** Adding `rule=esip6` as a
dataURI parameter opts out of the uniqueness rule, and such content can
never itself be invalidated as a duplicate. The ESIP states that contracts
*should* set it whenever a failed creation would mean loss of funds — which
is precisely a contract that has already collected a fee.

Every entry carries it. Our own uniqueness is unaffected: `author` and
`seq` are in the body, so two distinct entries cannot share bytes.

This retires three requirements earlier drafts carried: seeding the indexer
from a canonical content set, bumping `seq` to recover from griefing, and
treating a private mempool as mandatory. A private RPC remains useful for
privacy, not for correctness.

### The remaining sharp edge

ESIP-3 keeps one ethscription per transaction and gives **calldata priority
over events**. If our calldata parsed as a dataURI it would win over our
event and the contract would become the owner — the exact failure this
architecture exists to prevent. The spec's regex is anchored at the start
of the string and our calldata begins with a function selector, so it does
not match; this was verified against the spec's own regex. But we are
correct by one anchor.

**D-5, done.** The contract assembles the dataURI instead of accepting one.
`writeEntry(string entryTail)` takes only what follows the author's
address; the contract writes the header and `_hexAddress(msg.sender)`. The
calldata then contains no `data:` sequence at all, and `author` equals the
ESIP-3 initial owner by construction rather than by rule.

Measured both ways: +1,630 gas on a short English entry, −5,120 on a
full-length Chinese one. Roughly a wash, favourable on long entries.

## 8. Open decisions for the DAO

These are genuine either/ors. The proposal should put them to a vote
rather than have us pick quietly.

| # | decision | note |
|---|---|---|
| D-1 | Fee level (`minFee`) | It is the only per-entry spam cost. The holding gate is per *wallet* — one 100k bag can write ten thousand entries — so the gate filters non-holders and nothing more. |
| D-2 | Transferability | Tradable entries invite ordinal sniping and flip bait, which works against the archive. Options: soulbound with author opt-in unlock; or a 6–12 month transfer lock. |
| D-3 | Rate limit | 3 entries per author per ~7 days is a placeholder. |
| D-4 | The worst entry | Someone will inscribe something illegal. On IPFS you could unpin; here you cannot. The answer has to be that the chain is the raw layer and the DAO index is a curated view. **Have this answer ready before the proposal goes up — it is the strongest objection to the whole approach.** |

### On secondary-market revenue
Budget it at **zero**. Royalties are unenforceable on ethscriptions — a
peer-to-peer transfer is calldata sent directly to the recipient and
bypasses any marketplace fee. Secondary markets price ordinal position and
author identity, not writing quality, so a curation vote will not convert
into market value. Treat a celebrity entry as optionality, never as budget.

---

## 9. Acceptance criteria — met

1. **`npm test` and `forge test` green.** 64 and 23 respectively.
2. **Deployed, config set.** Sepolia `0xb196fCfC…`; mainnet rehearsal
   `0x3F06F46F…` in block 25932137.
3. **Real entries.** Three on Sepolia — 206 characters English, 66 Chinese,
   489 Chinese at the length limit — and one on mainnet.
4. **The indexer reproduces them** on an ordinary RPC, no archive node and
   no `--seen` seeding.
5. **A clean clone reproduces it byte for byte.** No local state; the
   Sepolia archive hashes to `372b8006d214a720…` from independent runs.
   *A genuinely independent second party has not yet done this, and should.
   The conformance vectors exist so that they can.*
6. **`out/journal.html` renders and opens from `file://`.**
7. **Fees reach the treasury.** `sweepEth()` moved 0.001 ETH to the
   treasury in block 25932223 — called from an ordinary address, since the
   function is permissionless and its destination immutable. `sweepAndBuy`
   was **not** exercised on mainnet and deliberately so: $JUSTICE's Uniswap
   V2 pair holds 0.011 WETH, where a 0.003 ETH sweep loses 22% to slippage,
   and the real liquidity sits in a V3 pool this interface cannot reach.
   The mainnet contract is deployed with no router at all.

### And one criterion the original plan did not have

**The canonical Ethscriptions indexer agrees with the design.** Ethscription
#16251113 reports `initial_owner` as the author rather than the contract or
the treasury, and `esip6` as true. Those are the two properties the whole
architecture exists for, and no testnet can check them.
