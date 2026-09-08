# Justice Journal — MVP requirements (draft v1, 2026-09-07)

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

`JusticeJournal.sol`, ~110 lines, no storage, no owner, no upgradeability.
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

`forge test` for execution, EIP-7623 floor pricing for calldata,
recombined by `node src/gas.mjs`:

| entry | contract route | direct calldata | premium |
|---|---|---|---|
| 113-char English | 51,463 gas | 32,040 gas | +19,423 |
| 500-char Chinese | 88,420 gas | 87,520 gas | **+900** |

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

Measured both ways: +1,630 gas on a short English entry, −2,351 on a
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

## 9. Acceptance criteria for the MVP

1. `node --test 'test/*.test.mjs'` and `forge test` both green.
2. Contract deployed; `journalContract` set in config.
3. **Three real entries on mainnet** — one English, one Chinese, one at the
   500-character limit — with transaction hashes.
4. `node src/indexer.mjs --rpc <url>` reproduces all three from a clean
   checkout, on an ordinary RPC, with no `--seen` seeding needed.
   Cross-check each against the public Ethscriptions API: `esip6` must be
   `true` and `initial_owner` must be the author, not the contract.
5. A second person re-runs step 4 independently and gets an identical
   `out/index.json`.
6. `out/journal.html` renders the three entries and opens from `file://`.
7. One `sweepAndBuy` executed, with $JUSTICE landing in the treasury.

Step 5 is the one that matters. It is the whole claim.
