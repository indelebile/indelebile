# Justice Journal — calldata specification (draft v1)

An entry is a call to `JusticeJournal.write(string)`. The content lives in
that transaction's calldata and is minted as an ethscription **owned by its
author**. There is no IPFS, no storage, and no privileged operator. The
rules below decide which calls count as entries; anyone can re-run the
reference indexer and must get a byte-identical result.

> Superseded: an earlier draft of this document had entries sent directly
> to the treasury with no contract. That is wrong. Under ESIP-1 the
> transaction recipient becomes the ethscription's owner, so that design
> made the DAO the owner of every author's entry. See §2.

---

## 1. Why calldata instead of IPFS

The original proposal stores content on IPFS with a hash on-chain. Three
problems, in increasing order of severity:

1. Pins expire. A permanent archive whose survival depends on someone
   remembering to renew a $1,500/year pinning bill is not permanent.
2. The chain holds a receipt, not the content. When the pin lapses, what
   survives on-chain is `Qm...` and nothing else.
3. It contradicts the premise. A project about resisting censorship should
   not custody the archive with a US company that can be served.

Calldata has none of these. It also costs less than the original design
(§3), and it removes the contract, which removes the audit.

**Do not use blobs (EIP-4844).** Blobs are pruned after roughly 18 days.
This must be calldata.

**Honest limit:** under EIP-4444, ordinary nodes may stop serving old
history, so retrieval will depend on archive nodes and the Portal Network.
That is a far stronger assumption than an IPFS pin, but it is not "free
forever". Say so in the proposal rather than letting someone else say it.

---

## 2. Why there is a contract

Under **ESIP-1**, `tx.to` becomes the ethscription's initial owner. Any
contract-free design that routes the fee by requiring `tx.to == treasury`
therefore hands the DAO ownership of every entry — fatal for a marketplace
layer and indefensible on its own terms.

**ESIP-3** lets a contract name the `initialOwner` in an event. That is the
only construction that collects a fee *and* leaves the author owning their
words. `JusticeJournal.sol` is ~110 lines: no storage, no owner, no
upgradeability, all parameters immutable.

It enforces what must be atomic with the write — `msg.value >= minFee` and
`balanceOf(sender) >= 100,000 $JUSTICE` — plus two cheap structural checks:

- **the canonical prefix.** Because the key order is fixed at `p, v,
  author, …`, the first 77 bytes of every entry are a constant, so the
  contract can compare one keccak hash. Without it, `write("hello")` would
  succeed, take the fee, and mint an ethscription under the contract's name
  that the indexer then rejects — the author pays and gets nothing. It
  costs ~650 gas.
- **a 2,048-byte cap**, which fits 500 characters of Chinese plus the
  envelope and five tags.

This does *not* make the content valid — full canonical validation means
parsing JSON in Solidity, which is not worth doing. The remaining rules
stay in the indexer where they cost no gas, so a transaction can still
satisfy the contract and be rejected later.

Note that checking `"v":1` in the prefix means a format version bump
requires a new deployment. That is already true of every other parameter. Moving the gate on-chain has a useful side
effect: **the indexer no longer needs an archive node**, because it never
reads historical state.

Fees accumulate in the contract and are converted by a permissionless
batched `sweepAndBuy(minOut, deadline)`, with `sweepEth()` as the escape
hatch. Swapping per entry would add >100k gas to every write, push $2
trades through a thin pool, and couple writing an entry to DEX liquidity —
a failed swap would revert the entry.

---

## 3. Entry format

The `contentURI` argument is an Ethscriptions data URI:

```
data:application/json;charset=utf-8,{"p":"justice-journal","v":1,"author":"0x…","seq":0,"ts":1757280000,"tags":["assange"],"body":"…"}
```

Keys appear in exactly this order: `p, v, author, seq, ts, tags, body`.
Any other order, extra keys, or added whitespace is **not** an entry (V4).
Without that rule an attacker can mint two distinct ethscriptions that
decode to the same entry.

| field | meaning |
|---|---|
| `p`, `v` | protocol tag and version |
| `author` | lowercase address, must equal `tx.from` — this is the front-running defence (§5) |
| `seq` | the author's own counter, strictly increasing |
| `ts` | author-declared unix time; the block is the authoritative clock |
| `tags` | ≤5, each `[a-z0-9-]{1,32}` |
| `body` | ≤500 Unicode code points, so Chinese gets the same allowance as English |

`author` costs ~55 bytes of overhead per entry. That is the price of
front-running resistance, and it is worth it — see §5.

---

## 4. Validity rules

An entry is valid iff every rule passes. All inputs are L1 state or
derived from earlier applications of these same rules, so the index is
reproducible by anyone.

| # | rule |
|---|---|
| V1 | the ESIP-3 log was emitted by the canonical JusticeJournal contract |
| V1b | *(contract)* content begins with the canonical 77-byte prefix and is ≤2,048 bytes |
| V2 | `fee >= minFeeWei` |
| V4 | `contentURI` decodes to a canonical entry (§3) |
| V5 | `p == "justice-journal"`, `v == 1`, `ts` is a non-negative integer |
| V6 | `entry.author` equals the ESIP-3 `initialOwner` |
| V8 | `seq` exceeds the author's highest accepted `seq` |
| V9 | author is under the rate limit for the trailing window |
| V10 | body is 1–500 code points |
| V11 | tags well-formed |
| V12 | content is not already inscribed (§6) |
| V13 | block ≥ genesis block |

Two rules from the pre-contract draft are gone, both now enforced
atomically by `write()`:

- *transaction succeeded* — a reverted write emits no logs, so it cannot
  reach the indexer at all.
- *holding gate* — checked in `write()`. This is what removes the archive
  node requirement.

**V1 matters more than it looks.** Anyone can emit the ESIP-3 event from
their own contract. Only logs from the canonical address are entries.

### The fee is the only per-entry cost

The holding gate is per *wallet*; writing is per *entry*. One 100k bag can
write ten thousand entries, and the gate is rentable across blocks by
anyone willing to borrow. So the gate filters non-holders and nothing more.

**V2 is the real spam cost** and V9 caps burst abuse. Replacing the fee
with "we'll monetise the secondary market" removes the only per-entry cost
in the system — see PRD §8.

The fee is denominated in ETH and converted to $JUSTICE by the batched
sweep, so the $JUSTICE buy pressure is preserved without putting a DEX in
the write path.

---

## 5. Cost

EIP-7623 (Pectra) floor pricing governs a data-only transaction:

```
gas = 21,000 + 10 × (zero_bytes + 4 × nonzero_bytes)
```

Execution measured by `forge test`, calldata priced by EIP-7623, recombined
by `node src/gas.mjs`:

| entry | contract route | direct calldata | premium |
|---|---|---|---|
| 113-char English | 51,463 gas | 32,040 gas | +19,423 |
| 500-char Chinese | 88,420 gas | 87,520 gas | **+900** |

The contract premium collapses on longer entries: a data-heavy transaction
pays the floor for its bytes, and the contract's execution rides underneath
that floor for free. Authors pay almost nothing for the contract on exactly
the entries the Journal wants to encourage.

At 5 gwei that is ~$0.26 for a short English entry and ~$0.44 for a
full-length Chinese one. The original design — contract write plus SSTORE
plus IPFS hash — is 90–110k gas *plus* recurring pinning.

Chinese runs ~2.2× the gas per character (3-byte UTF-8). Even so, a full
500-character Chinese entry stays well under $2 at 5 gwei.

Budget impact versus the original $16–30k estimate: the smart-contract
audit line ($5–10k) and the IPFS line ($500–1,500/yr) both disappear. They
are partly replaced by indexer work — the indexer is now the protocol, so
it must be open source, reproducible, and run by more than one party.
**This is a transfer of cost and risk, not an elimination of it.**

---

## 6. Front-running — solved by ESIP-6

Ethscriptions enforce global content uniqueness by default: only the first
ethscription with a given sha256 is valid. That made front-running a real
threat — an attacker watching the mempool could inscribe our bytes first,
and the author would pay the fee for an entry that mints no ethscription.

**ESIP-6 removes the problem, and it was written for exactly this case.**
Adding `rule=esip6` as a dataURI parameter opts an ethscription out of the
uniqueness rule, and the spec states that content marked this way can never
itself be invalidated as a duplicate. ESIP-6's rationale names our
situation directly: a contract that has already taken a user's money cannot
revert if the creation fails, so contracts *should* set this parameter
whenever creation failure would mean loss of funds.

Every entry therefore carries it:

```
data:application/json;charset=utf-8;rule=esip6,{"p":"justice-journal",...
```

Our own uniqueness does not weaken. The body carries `author` and `seq`, so
two distinct entries can never share bytes: different authors differ in
`author`, and the same author cannot reuse a `seq` (V8).

What this retires, all of which earlier drafts of this document required:

- seeding the indexer from a canonical Ethscriptions content set (`--seen`)
- bumping `seq` to recover from a griefed entry
- submitting through a private mempool as a *protocol* requirement

A private RPC is still worth using for privacy — it keeps your text out of
the public mempool before inclusion — but it is no longer load-bearing.

## 6b. One transaction, one ethscription

ESIP-3 keeps the rule that each Ethereum transaction produces at most one
ethscription, and **calldata takes priority over events**. If our
transaction's calldata were itself a valid dataURI, it would win over our
event and the initial owner would become `tx.to` — the contract — which is
precisely the failure this whole architecture exists to avoid.

The published spec anchors its dataURI regex at the start of the string
(`\Adata:`), and our calldata begins with a 4-byte function selector, so it
does not match. Verified directly against the spec's own regex:

```
spec regex (anchored)   matches our calldata?  false   -> our event wins
unanchored variant      matches our calldata?  true    -> calldata would win
```

We are correct under the specification, but only by one anchor. A hardening
worth considering before mainnet: have the contract build the dataURI from
a raw body rather than accept the finished string, so the calldata contains
no `data:` prefix at all. That would also make `author == msg.sender` true
by construction instead of by rule, and shrink calldata by 88 bytes.

## 7. Governance and moderation

- **Contract parameters** are immutable and set at deployment. Changing
  one means deploying a new contract and a governance vote to move
  `journalContract`; the old index stays valid for its own range.
- **Indexer parameters** live in `src/config.mjs`. Changing one changes the index,
  so every change is a governance action with an effective-from block —
  never a silent edit.
- **Moderation is a display overlay.** `hidden.json` lists entry ids the
  DAO has voted to collapse. The entry stays in the index and stays on L1;
  the viewer says so and links to the calldata. Nothing is ever deleted,
  because nothing *can* be.
- **Plan for the worst entry.** Someone will inscribe something illegal.
  On IPFS you could unpin; here you cannot. The answer has to be that the
  chain is the raw layer and the DAO's index is a curated view, plus V2
  and the holding gate raising the cost of abuse. Have this answer ready before the
  proposal goes up — it is the strongest objection to the whole approach.

---

## 8. What is deliberately not here

- **NFT / marketplace layer.** Entries are ethscriptions, so they are
  transferable by default. Whether they *should* be is a separate
  decision: tradability creates ordinal sniping and flip-bait, which works
  against the archive's purpose. Options worth voting on: soulbound by
  default with author opt-in unlock, or a 6–12 month transfer lock.
  Note that royalties are unenforceable on ethscriptions — a peer-to-peer
  transfer bypasses any marketplace fee — so secondary revenue should be
  budgeted at zero.
- **Comments, likes, curation.** High-frequency interaction does not
  belong in L1 calldata. This is the natural second phase, and Facet is a
  reasonable home for it, since Facet's own data lands in L1 calldata and
  the archive's trust model does not degrade.
