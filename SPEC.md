# Justice Journal — calldata specification (draft v1)

An entry is a plain Ethereum transaction. There is no contract, no IPFS,
and no privileged operator. The content lives in L1 calldata; the rules
below decide which transactions count as entries. Anyone can re-run the
reference indexer and must get a byte-identical result.

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

## 2. Entry format

The calldata is the UTF-8 bytes of an Ethscriptions data URI:

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

## 3. Validity rules

An entry is valid iff every rule passes. All inputs are L1 state or
derived from earlier applications of these same rules, so the index is
reproducible by anyone.

| # | rule |
|---|---|
| V1 | `tx.to` is the DAO treasury |
| V2 | `tx.value ≥ minFeeWei` — **this is the write fee** |
| V3 | the transaction succeeded |
| V4 | calldata decodes to a canonical entry (§2) |
| V5 | `p == "justice-journal"`, `v == 1`, `ts` is a non-negative integer |
| V6 | `author == tx.from` |
| V7 | `balanceOf($JUSTICE, tx.from)` at end of block `N-1` ≥ 100,000 |
| V8 | `seq` exceeds the author's highest accepted `seq` |
| V9 | author is under the rate limit for the trailing window |
| V10 | body is 1–500 code points |
| V11 | tags well-formed |
| V12 | content is not already inscribed (§5) |
| V13 | block ≥ genesis block |

### V2 is the point of this document

The objection to a contract-free design is "you can't collect the fee".
You can. An ethscription-creating transaction is an ordinary EOA
transaction and **can carry ETH value**. Requiring `tx.to == treasury` and
`tx.value ≥ fee` gives a per-entry, indexer-enforced, independently
verifiable fee with no contract at all.

The cost: the fee is denominated in ETH, so there is no $JUSTICE sink or
buy pressure. If the DAO requires a $JUSTICE-denominated fee, that needs
the ESIP-2 contract variant instead. **This is a genuine either/or and the
proposal should put it to a vote rather than pick quietly.**

### V7 and V9 together

The holding gate is per *wallet*; writing is per *entry*. One 100k bag can
write ten thousand entries. A holding gate alone is not an anti-spam
mechanism, and it is rentable across blocks by anyone willing to borrow.

So: **V2 is the real spam cost**, V7 filters non-holders, and V9 caps
burst abuse. Removing V2 in favour of "we'll monetise the secondary
market" removes the only per-entry cost in the system.

---

## 4. Cost

EIP-7623 (Pectra) floor pricing governs a data-only transaction:

```
gas = 21,000 + 10 × (zero_bytes + 4 × nonzero_bytes)
```

Measured from the reference implementation (`node src/demo.mjs`):

| entry | gas | @1 gwei | @5 gwei |
|---|---|---|---|
| 113 chars English | 32,800 | 0.000033 ETH | 0.000164 ETH |
| 179 chars English | 35,320 | 0.000035 ETH | 0.000177 ETH |
| 82 chars Chinese | 36,120 | 0.000036 ETH | 0.000181 ETH |
| original design (contract + SSTORE + IPFS hash) | ~90–110k | — | — plus annual pinning |

Chinese runs ~2.2× the gas per character (3-byte UTF-8). Even so, a full
500-character Chinese entry stays well under $2 at 5 gwei.

Budget impact versus the original $16–30k estimate: the smart-contract
audit line ($5–10k) and the IPFS line ($500–1,500/yr) both disappear. They
are partly replaced by indexer work — the indexer is now the protocol, so
it must be open source, reproducible, and run by more than one party.
**This is a transfer of cost and risk, not an elimination of it.**

---

## 5. Front-running

Ethscriptions enforce global content uniqueness. An attacker watching the
mempool can copy your bytes and inscribe them first.

**V6 stops the theft.** The copy carries your address in `author` but
their address in `tx.from`, so it is not a valid Journal entry and the
attacker gains nothing.

**V6 does not stop the grief.** Their inscription still consumed the
content globally, so your later transaction creates a valid *entry* but
not a valid *ethscription* — meaning no NFT, nothing transferable. Three
layers of defence, in order:

1. **Submit through a private mempool** (Flashbots Protect). The bytes are
   not public before inclusion. This is the actual fix; the write tool
   defaults to it.
2. **Bump `seq` and retry.** Different bytes, different hash, valid again.
   Griefing costs the attacker gas every round and never pays.
3. **Seed the indexer's uniqueness set from the canonical Ethscriptions
   index**, not just from treasury traffic. Without seeding, V12 is
   strictly weaker than the protocol's own uniqueness rule and the index
   will claim entries whose ethscriptions belong to someone else.
   `--seen <file>` exists for this; the indexer warns when it is missing.

---

## 6. Governance and moderation

- **Parameters** live in `src/config.mjs`. Changing one changes the index,
  so every change is a governance action with an effective-from block —
  never a silent edit.
- **Moderation is a display overlay.** `hidden.json` lists entry ids the
  DAO has voted to collapse. The entry stays in the index and stays on L1;
  the viewer says so and links to the calldata. Nothing is ever deleted,
  because nothing *can* be.
- **Plan for the worst entry.** Someone will inscribe something illegal.
  On IPFS you could unpin; here you cannot. The answer has to be that the
  chain is the raw layer and the DAO's index is a curated view, plus V2
  and V7 raising the cost of abuse. Have this answer ready before the
  proposal goes up — it is the strongest objection to the whole approach.

---

## 7. What is deliberately not here

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
