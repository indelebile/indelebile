# Justice Journal — a revision to the technical design

*Draft for discussion. Submitted by a $JUSTICE holder, not by the core
team. A working prototype and every number below can be checked; links to
live transactions are at the end.*

---

## Summary

I support the Justice Journal proposal and I built it to see whether it
would work. It does — but not as specified. Two things in the original
design fail in ways that are hard to see on paper and obvious once code
touches the chain:

1. **The proposed design would have given the DAO ownership of every
   entry.** Not the fee, not the index — the words themselves.
2. **The archive would have depended on a recurring invoice.** Content on
   IPFS survives only while someone keeps paying to pin it. When the pin
   lapses, the chain holds a hash and nothing readable.

Both are fixable, and fixing them makes the project *cheaper*, not more
expensive. The revised design puts the text itself into Ethereum calldata
and mints each entry as an ethscription owned by its author. It removes the
IPFS line item, removes the storage contract, and cuts the audit surface to
about 110 lines with no storage, no owner, and no upgradeability.

It is deployed and working. Three entries on Sepolia — English, Chinese,
and one at the 500-character limit — and one on **Ethereum mainnet**, where
the canonical Ethscriptions indexer confirms the two properties no testnet
can: the author owns the entry, and the uniqueness opt-out took effect. The
archive rebuilds from the chain byte for byte.

---

## 1. What the original proposal gets right

The concept, and most of the frame around it, needs no revision:

- A holding threshold plus a write fee as the barrier to spam.
- Entries that can be hidden by governance but **never deleted**.
- 500 characters, tags, timestamps, per-entry attribution.
- Code open-sourced and community-maintained.

Everything below keeps all of that. The changes are about *where the words
live* and *who owns them*.

---

## 2. The ownership problem

The Ethscriptions protocol has one rule that decides this: **the recipient
of a transaction becomes the owner of what it inscribes.**

The proposal routes the write fee by having the author send to the
treasury. Under that rule, the treasury becomes the owner of every entry —
the author writes their testimony and the DAO holds the title to it. That
is fatal to any future collectible or marketplace layer, and it is
indefensible on its own terms for a project about the right to publish.

The fix is a small contract. **ESIP-3** lets a contract name the initial
owner of what it creates, which is the only construction that collects a
fee *and* leaves the author owning their own words. This is why there is a
contract in the revised design at all — not to store anything.

Verified on Sepolia: for all three entries, the initial owner is the
author's address, not the contract and not the treasury.

---

## 3. Content in calldata, not IPFS

The original design stores entries on IPFS with a hash on chain. Three
problems, in increasing severity:

1. **Pins expire.** A permanent archive whose survival depends on someone
   remembering to renew a $1,500-a-year invoice is not permanent.
2. **The chain holds a receipt, not the content.** When the pin lapses,
   what survives on chain is `Qm…` and nothing else.
3. **It contradicts the premise.** A project about resisting censorship
   should not custody its archive with a company that can be served.

Calldata has none of these. The text is inside the Ethereum transaction.
Nothing has to be renewed, and no one can unpin it — including us.

**Honest limit:** under EIP-4444, ordinary nodes may eventually stop
serving old history, so retrieval will depend on archive nodes and the
Portal Network. That is a far stronger assumption than an IPFS pin, but it
is not "free forever," and the proposal should say so rather than let
someone else say it.

---

## 4. What it costs

Calibrated against a real transaction, not estimated. Sepolia
`0xa096836a…` spent **43,125 gas** on a 206-character English entry;
recomputing it from the derived constant lands within 0.3% of what the
chain charged.

| entry | gas | @1 gwei | @5 gwei |
|---|---|---|---|
| 113 characters, English | 41,233 | 0.000041 ETH | 0.000206 ETH |
| 500 characters, Chinese | 83,950 | 0.000084 ETH | 0.000420 ETH |
| the original design (contract + storage + IPFS hash) | 90,000–110,000 | — | *plus annual pinning* |

Chinese costs more per character because UTF-8 spends three bytes on each
one. The 500-character limit is therefore counted in **characters, not
bytes** — otherwise a Chinese entry would have had a third of the room that
an English one has.

### Budget

| | |
|---|---|
| **Removed** | IPFS/Filecoin integration and hosting ($500–1,500/yr, forever). Most of the storage-contract work. |
| **Reduced** | Audit scope. The contract has no storage, no owner, no upgradeability, and holds no user funds beyond unswept fees. |
| **Added** | The indexer is now the protocol. It must be open source, reproducible, and ideally run by more than one party. |

**This is a transfer of cost and risk, not an elimination of it**, and I
would rather state that than have it discovered later.

---

## 5. The fee

The proposal charges 1,000 $JUSTICE per entry. An ERC-20 fee requires an
`approve()` first — two transactions and a confusing first-time experience
— and couples every write to the token contract.

The revised design charges **0.001 ETH per entry** and converts the
accumulated fees to $JUSTICE for the treasury in batches, through a
permissionless `sweepAndBuy` that anyone may call and whose proceeds can
only reach the treasury. The buy pressure is preserved, writing is one
transaction, and a thin or paused pool can never block someone from
writing.

Swapping per entry was considered and rejected: it would add over 100k gas
to every entry, push two-dollar trades through a thin pool, and — worst —
make a failed swap revert the entry.

**The fee level and its denomination are a DAO decision.** Both are one
deployment away. I am proposing a mechanism, not a number.

---

## 6. The indexer is the protocol

This is the part I would most like scrutinised.

Ethereum's calldata carries a great deal that is not a Journal entry, and
nothing on chain marks ours apart. **The rules do.** Which means the
archive exists exactly to the extent that a stranger can apply those rules
and get the same answer we do.

Three things make that checkable rather than asserted:

- **Reproducibility.** A clean clone with no local state rebuilds the
  archive from an ordinary RPC, byte for byte. The current Sepolia archive
  hashes to `372b8006d214a720…` from two independent runs.
- **Conformance vectors.** 22 inputs paired with the result any correct
  implementation must produce, covering every rejection rule, with content
  hashes so an implementation can check its hashing too. Anyone writing an
  indexer in another language can prove they agree with ours.
- **The reading rules, inscribed.** The instructions for rebuilding the
  archive from Ethereum alone — the address, the genesis block, the event
  topic, the canonical form, the validity rules — fit in 1,470 bytes and
  cost about a dollar to inscribe. An archive whose premise is not
  depending on anyone should not keep its own manual on GitHub.

MIT licensed, so a second implementation needs nobody's permission.

---

## 7. What is built, and what is not

Full audit in `STATUS.md`. In short:

**Built:** the contract, the indexer, the write page, the archive view,
tag and date filtering, entry preview, the holding gate, the fee, local
validation before signing, reproducibility, conformance vectors.

**Not built:** share cards, Twitter and Telegram posting, likes and
popularity sorting, monthly challenges, Snapshot integration, referral
rewards, the curator program, user profiles, ENS, Freedom ID badges,
cross-chain, ZK log-ins. Moderation exists as a mechanism but is not wired
to a vote or to the live page.

That distribution is deliberate. **Everything irreversible is done;
everything deferred is additive.** The data format, the ownership model and
the validity rules cannot be changed once entries exist. Share cards and
Snapshot integration can be added three years later without touching a
single entry already written. The list of things that must be decided
before launch is currently empty.

### One thing that would have foreclosed a future option

The official ERC-721 Ethscriptions Collections protocol was investigated as
a way to give entries collection identity. It cannot be used: with a zero
merkle root only the collection owner may add items, and with a non-zero
root the proof includes the content hash — so the DAO would have to know
every entry before it was written. Collections are built for curated drops,
not for a journal. Crucially, items can only be added **at creation time**,
so had we adopted it carelessly, entries written before the decision could
never join.

Entries are already NFTs in the sense that matters: each is an ethscription
owned by its author and transferable under ESIP-1. A marketplace can be
built or adopted at any time, by us or by anyone, without changing anything
about how entries are written.

---

## 8. Decisions for the DAO

These are genuine either/ors. I have deliberately not picked.

| | Decision | Why it matters |
|---|---|---|
| **D-1** | Fee level and denomination | It is the only *per-entry* cost. The holding gate is per **wallet** — one 100,000 $JUSTICE bag can write ten thousand entries — so the gate filters non-holders and nothing more. |
| **D-2** | Transferability by default | Tradable entries invite ordinal sniping and flip bait, which works against an archive. Options: soulbound with author opt-in unlock, or a 6–12 month transfer lock. |
| **D-3** | Rate limit | Three entries per author per week is a placeholder. |
| **D-4** | **The worst entry** | Someone will inscribe something illegal. On IPFS you could unpin; here you cannot. The answer has to be that the chain is the raw layer and the DAO's index is a curated view, plus the fee and gate raising the cost of abuse. **This needs an answer before launch — it is the strongest objection to the whole approach.** |

### On secondary-market revenue

Budget it at **zero**. Royalties are unenforceable on ethscriptions — a
peer-to-peer transfer is calldata sent directly to the recipient and
bypasses any marketplace. Secondary markets price ordinal position and
author identity, not writing quality, so a curation vote will not convert
into market value. A celebrity entry is optionality, never budget.

---

## 9. Confirmed on mainnet

Sepolia cannot verify the two properties the architecture exists for,
because the canonical Ethscriptions indexer runs on mainnet only. So the
design was rehearsed on mainnet, under a **separate protocol tag** —
`justice-journal-test` — precisely so that nothing written while testing
can ever be read as part of the archive. The production rules reject any
other tag outright, tested in both directions.

**The archive is empty. Not one entry exists. It begins when the DAO says
it begins.**

The rehearsal contract is `0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a`,
deployed in block 25932137 for 0.00021 ETH. One entry was written, and the
canonical Ethscriptions indexer reports it as **ethscription #16251113**:

| field | value | |
|---|---|---|
| `creator` | `0x3f06f46f…` | the contract, as ESIP-3 specifies |
| `initial_owner` | `0xeb4745c5…` | **the author, not the contract or the treasury** |
| `current_owner` | `0xeb4745c5…` | |
| `esip6` | `true` | the uniqueness opt-out took effect |
| `event_log_index` | 465 | recognised as an event creation, not calldata |
| `mimetype` | `application/json` | |

That is the whole claim, confirmed by the protocol's own indexer rather
than by ours: **the author owns their words, and nobody can take their
content by inscribing it first.** `node scripts/verify-mainnet.mjs --tx
0xdf4f13fb…` reproduces the check.

Transaction: `0xdf4f13fb1bf84c3c742034d92f08cd13d2580ca07813647353c5d72abd80787e`

### One further finding

Entries written through an EIP-7702
smart-account wallet still resolve ownership correctly — `msg.sender`
remains the author's address — but pay roughly 90,000 gas of account
abstraction overhead on top. That is the wallet's cost, not the Journal's,
but users should not be surprised by it.

---

## 10. What I am asking for

Not a budget. The prototype exists and is MIT licensed; take it, fork it,
or discard it.

What would be useful:

1. **Scrutiny of §2 and §6.** If the ownership analysis is wrong, the whole
   design is wrong, and I would rather learn that here.
2. **A decision on §8**, particularly D-4.
3. **A second implementation of the indexer.** The conformance vectors make
   it checkable; someone actually writing one is the only thing that proves
   the specification is complete. Our writing it twice would not count.

---

## Evidence

Sepolia, contract `0xb196fCfC583F0B3770F05d94B17cfAe70f4edf4E`, from block
11659670:

| entry | | |
|---|---|---|
| 206 characters, English | block 11659725 | `0xa096836a…` |
| 66 characters, Chinese | block 11659755 | |
| 489 characters, Chinese | block 11659790 | at the length limit |

Deployment cost 1,744,526 gas (0.00185 ETH). All three entries accepted,
none rejected, fees collected as expected. Two independent indexer runs and
one from a clean clone all produce the same archive.
