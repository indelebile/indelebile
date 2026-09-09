# Against the original proposal

Audited against the AssangeDAO Justice Journal proposal as written.
Requirements checked 2026-09-08; system description current to 2026-09-09. Four outcomes: **done**, **partial**, **changed** (built
differently, with a reason), **not built**.

The pattern is deliberate. Everything irreversible — the data format, the
ownership model, the validity rules — is done, because those cannot be
changed once entries exist. Almost everything not built is additive and
can be added at any time without touching a single entry already written.

---

## §4 User flow

| # | Proposal | Status | |
|---|---|---|---|
| 1 | Visit the Journal page on the DAO website | **partial** | The page exists and runs; it is not hosted on the DAO site, and the repository is not public. |
| 2 | Connect wallet, verify holding ≥100,000 $JUSTICE | **done** | Enforced in the contract, not only in the page — a hand-built transaction cannot bypass it. |
| 3 | Compose up to 500 characters | **done** | Counted in Unicode code points, so Chinese gets the same allowance as English rather than a third of it. |
| 4 | Fixed fee: 1,000 $JUSTICE + gas | **changed** | See below. |
| 5 | Shareable link + image card | **not built** | |
| 6 | Post to Twitter or Telegram | **not built** | |

### Why the fee changed

The proposal charges 1,000 $JUSTICE. An ERC-20 fee needs `approve()` first
— two transactions and a confusing first-time experience — and it couples
every write to the token contract.

Instead: **0.001 ETH per entry, converted to $JUSTICE in batches** by a
permissionless `sweepAndBuy`. The $JUSTICE buy pressure is preserved, the
write is one transaction, and a dead or thin pool can never block someone
from writing. Swapping per entry would have added over 100k gas to every
entry and pushed two-dollar trades through a thin pool.

**The fee level and denomination are a DAO decision, not ours.** Both are
one deployment away.

---

## §4 Technical notes

| Proposal | Status | |
|---|---|---|
| Store content on IPFS, hash on-chain | **changed** | Content is in L1 calldata. This is the central change — see SPEC.md §1. No pinning bill, nothing to renew, and the chain holds the text rather than a receipt for it. |
| Log includes address, timestamp, hash, tags | **done** | Plus a per-author sequence number, which the proposal did not have and which turns out to be needed for ordering and for recovering from a griefed entry. |
| Extendable: profiles, collections, comments, likes | **not built** | Collections were investigated properly and ruled out: the official ERC-721 Ethscriptions Collections protocol cannot accept open user submissions (see below). |
| Open-sourced and community-maintained | **done** | MIT, plus conformance vectors so a second implementation can prove it agrees rather than being asked to trust ours. |

---

## §5 Incentives

| Proposal | Status | |
|---|---|---|
| Monthly writing challenges via Snapshot | **not built** | |
| Mint as NFT | **already true** | Every entry *is* an ethscription owned by its author, transferable under ESIP-1. Not a future feature. |
| Referral rewards | **not built** | |
| Curator program | **not built** | |

---

## §6 Governance and anti-abuse

| Proposal | Status | |
|---|---|---|
| Entry threshold (hold + fee) | **done** | With one correction: the holding gate is per *wallet* while writing is per *entry*, so one bag can write indefinitely. The fee is the real per-entry cost; a rate limit caps bursts. |
| Community reports | **not built** | |
| Snapshot/GTU vote may hide entries, never delete | **partial** | Done except the vote. `hidden.json` collapses an entry in both the live page and the rendered archive, keeping its author, date, block link and tags and saying it is still in the index and still on chain. A missing list hides nothing — moderation fails open. What is absent is any governance integration that would write to that list. |
| Transparency: verifiable, timestamped on-chain | **done, and further** | The archive is reproducible: a clean clone with no local state rebuilds it byte for byte. Conformance vectors let anyone check their own implementation. |

---

## Infrastructure section

### Frontend

| Proposal | Status | |
|---|---|---|
| Connect wallet (MetaMask, WalletConnect) | **partial** | Any EIP-1193 wallet. No WalletConnect. |
| Write and preview | **done** | The preview shows the exact bytes that will be recorded, not a rendering of them. |
| Sign and submit | **done** | |
| View by date | **done** | Chain order, which is the only ordering that cannot be disputed. |
| View by tags | **done** | |
| View by popularity | **not built** | There is nothing to be popular by — no likes. |
| Share on Twitter | **not built** | |

### Smart contract

| Proposal | Status | |
|---|---|---|
| Log entries (hash and metadata) | **done** | |
| Enforce holding requirement | **done** | |
| Collect fee | **done** | In ETH — see above. |
| Store address, timestamp | **changed** | Emitted, never stored. Storage was the expensive part of the original design and buys nothing an event does not. |
| Optional ENS name | **not built** | |
| Full content on-chain, or IPFS + hash | **done** | Full content on-chain, in calldata. |

### Backend / indexer

| Proposal | Status | |
|---|---|---|
| Off-chain indexer for fast display | **done, and load-bearing** | The proposal called this optional. It is not: nothing on chain marks a Journal entry apart from any other calldata, so the rules *are* the archive — and the page reads its output rather than querying the chain, so there is only one implementation of them. Runs continuously (`--watch`) or once. |
| Filter by time, tags | **done** | |
| Filter by popularity | **not built** | |
| ENS mapping, avatars, social links | **not built** | |

### IPFS / Filecoin

**Removed on purpose.** The line item and its recurring bill are gone.

### DAO integration

| Proposal | Status |
|---|---|
| Snapshot governance for monthly best | **not built** |
| Reward logic via $JUSTICE airdrops | **not built** |

---

## Future extensions

| Proposal | Status | |
|---|---|---|
| NFT minting per entry | **already true** | |
| User profiles, "Freedom ID" badges | **not built** | |
| Cross-chain logging | **not built** | |
| On-chain voting on best entries | **not built** | |
| ZK log-ins | **not built** | |

---

## Tokenomics

| Proposal | Status | |
|---|---|---|
| Entry cost 1,000 $JUSTICE | **changed** | 0.001 ETH, swept into $JUSTICE for the treasury. |
| Holding requirement ≥100,000 $JUSTICE | **done** | |
| Reward for sharing to Twitter | **not built** | |
| Weekly/monthly reward cap | **not built** | |

---

## What changed after this audit was first written

Six things shipped between the first pass and now, none of which the
proposal anticipated and all of which are now in `SPEC.md`:

| | |
|---|---|
| **Deployed on mainnet** | Under a separate protocol tag; the canonical Ethscriptions indexer confirms the author owns the entry and `esip6` took effect. See `DEPLOY.md`. |
| **Deployments are a list** | Contract parameters are immutable, so a DAO multisig treasury means redeploying. `journalContracts` carries block ranges so the archive spans deployments; without it the archive would end at its own first governance decision. |
| **A rehearsal protocol tag** | `justice-journal-test`. V5 demands an exact match, so mainnet can be exercised with permanent entries while the archive stays empty until the DAO starts it. |
| **The page reads the indexer's output** | It used to query logs and filter them itself — a second copy of the rules in the browser, free to drift. |
| **Public RPCs refuse historical `getLogs`** | Of ten mainnet endpoints tested, two answered. Rebuilding needs a list of endpoints, or your own node. Reading the archive needs none. |
| **Watch mode** | Incremental to fetch, full to derive, so a long-running build and a from-scratch build produce the same `entriesHash`. |

## Things found that the proposal did not anticipate

1. **The proposal's own design would have given the DAO ownership of every
   entry.** The Ethscriptions protocol makes a transaction's recipient the
   owner, so routing the fee by sending to the treasury hands the treasury
   the author's words. This is why there is a contract at all.
2. **Front-running.** Ethscriptions are unique by default, so a bot could
   copy an entry from the mempool and inscribe it first, leaving the author
   with the bill and nothing to show. ESIP-6 solves it outright and was
   written for this exact case.
3. **ERC-721 collections cannot take open submissions.** With a zero merkle
   root only the collection owner may add items; with a non-zero root a
   proof is required, and the proof includes the content hash — so the DAO
   would have to know every entry before it was written. Collections are
   for curated drops, not for a journal.
4. **Chinese cost three bytes per character.** The 500-character limit had
   to be defined in code points, or a Chinese entry would have had a third
   of the room.
5. **The holding gate is worth about $2.29.** 100,000 $JUSTICE at the price
   when this was measured. The barrier the proposal specifies is close to
   no barrier, which is why the write fee does all the anti-spam work — and
   why §5's incentives and §6's anti-abuse section quietly contradict each
   other. `PROPOSAL-SHORT.md` §6 works that through.

---

## What it would take to finish

Grouped by what actually blocks what.

**Nothing here is blocked by the data format.** Every item below can be
built after entries exist, without invalidating one.

| | Work |
|---|---|
| **Social layer** | share cards, Twitter/Telegram posting, profiles, ENS |
| **Curation layer** | likes, popularity sorting, monthly challenges, Snapshot integration, curator program |
| **Governance layer** | reports, wiring `hidden.json` to a vote and to the live page |
| **Incentives** | referral rewards, airdrop logic, reward caps |
| **Hosting** | putting the page on the DAO site; a public repository |
| **Governance wiring** | something that writes to `hidden.json` after a vote; the list is honoured, nothing fills it |
| **Provenance** | inscribing `docs/READING-RULES.txt`, so rebuilding the archive does not depend on this repository surviving |

The one thing that **cannot** be deferred is anything that changes the
entry format, because the format is fixed at the moment an entry is
written. That list is currently empty.
