# Justice Journal — a revision to the technical design

*From a $JUSTICE holder, not the core team. Everything below is deployed
and can be checked; a working prototype is MIT licensed and linked at the
end.*

---

I support the Justice Journal and I built it to see whether the design
would work. It does — but not as specified. Two things fail in ways that
are hard to see on paper and obvious once code touches the chain.

## 1. The proposed design would have given the DAO ownership of every entry

The Ethscriptions protocol has one rule that decides this: **the recipient
of a transaction owns what it inscribes.**

The proposal routes the write fee by having the author send to the
treasury. Under that rule the treasury becomes the owner of every entry —
the author writes their testimony and the DAO holds title to it.

The fix is a small contract. ESIP-3 lets a contract name the initial owner,
which is the only construction that collects a fee *and* leaves the author
owning their words. That is the only reason there is a contract at all; it
stores nothing.

**Confirmed on Ethereum mainnet.** [Ethscription
#16251113](https://api.ethscriptions.com/v2/ethscriptions/0xdf4f13fb1bf84c3c742034d92f08cd13d2580ca07813647353c5d72abd80787e),
written through the contract, is reported by the canonical Ethscriptions
indexer as:

```
creator        0x3f06f46f…   the contract, as ESIP-3 specifies
initial_owner  0xeb4745c5…   the author — not the contract, not the treasury
esip6          true
```

## 2. The archive would have depended on a recurring invoice

Content on IPFS survives only while someone keeps paying to pin it. When
the pin lapses the chain holds `Qm…` and nothing readable. A project about
resisting censorship should not custody its archive with a company that can
be served.

So the text itself goes into Ethereum calldata. Nothing to renew, nothing
to unpin — including by us.

*Honest limit: under EIP-4444 ordinary nodes may eventually stop serving
old history, so retrieval will depend on archive nodes. Far stronger than
an IPFS pin, but not "free forever."*

## 3. This is cheaper, not more expensive

Calibrated against a real transaction, not estimated.

| entry | gas | @1 gwei | @5 gwei |
|---|---|---|---|
| 113 characters, English | 41,233 | 0.000041 ETH | 0.000206 ETH |
| 500 characters, Chinese | 83,950 | 0.000084 ETH | 0.000420 ETH |
| the original design | 90,000–110,000 | — | *plus annual pinning* |

The IPFS line item disappears. The storage contract disappears. The audit
surface is ~110 lines with no storage, no owner, no upgradeability.

**What is added:** the indexer becomes the protocol. Nothing on chain marks
a Journal entry apart from any other calldata — the rules do. So the rules
must be open source, reproducible, and checkable by a stranger. They are:
a clean clone rebuilds the archive byte for byte, and 22 conformance
vectors let a second implementation prove it agrees rather than be asked to
trust ours.

This is a transfer of cost and risk, not an elimination of it.

## 4. On the fee

The proposal charges 1,000 $JUSTICE. An ERC-20 fee needs `approve()` first
— two transactions and a poor first experience.

The revision charges **0.001 ETH** and converts accumulated fees to
$JUSTICE in batches, through a permissionless sweep whose destination is
immutable. Anyone can trigger it; nobody can redirect it.

One finding the DAO should weigh: **at present liquidity that conversion is
not viable.** $JUSTICE's Uniswap V2 pair holds 0.011 WETH, where sweeping
0.003 ETH loses 22% to slippage; the real liquidity is in a V3 pool this
interface cannot reach. The mainnet deployment therefore carries no router
and holds fees as ETH.

*Also worth knowing: 100,000 $JUSTICE is currently worth about $2.29. The
holding gate the proposal specifies is close to no barrier, and the fee is
doing all the anti-spam work.*

## 5. What is built, and what is not

**Built:** the contract, the indexer, the write page, the archive view, tag
and date filtering, the holding gate, the fee, local validation before
signing, reproducibility, conformance vectors.

**Not built:** share cards, Twitter and Telegram posting, likes, monthly
challenges, Snapshot integration, referral rewards, curation, profiles,
ENS, ZK log-ins. Moderation exists as a mechanism but is not wired to a
vote.

That distribution is deliberate. **Everything irreversible is done;
everything deferred is additive.** The data format, the ownership model and
the validity rules cannot be changed once entries exist. Share cards can be
added three years later without touching a single entry.

**The archive is empty.** The mainnet work above ran under a separate
protocol tag — `justice-journal-test` — which the production rules reject
outright. Not one real entry exists. It begins when the DAO says it begins.

## 6. Decisions for the DAO

I have deliberately not picked these.

| | Decision | Why it matters |
|---|---|---|
| **D-1** | Fee level and denomination | Gas alone already deters casual junk — nobody pays to write nonsense. What it does not deter is a *paid* incentive: any deterministic per-entry reward that exceeds the cost of writing turns the Journal into a faucet. §5's rewards are safe today by arithmetic, not by design — see below. |
| **D-2** | Transferability by default | Tradable entries invite ordinal sniping and flip bait, which works against an archive. Soulbound with author opt-in unlock is one option. |
| **D-3** | Rate limit | Three entries per author per week is a placeholder. |
| **D-4** | **The worst entry** | Someone will inscribe something illegal. On IPFS you could unpin; here you cannot. This needs an answer before launch — it is the strongest objection to the whole approach. |

### The fee and the rewards are one decision

Gas is a real barrier to casual junk, and at present it is a sufficient
one: writing an entry costs about **$0.0204**, while §5's per-share reward
of 50–100 $JUSTICE is worth **$0.0011–0.0023** — six to eleven percent of
what it costs to claim it. The whole monthly reward cap of 10M $JUSTICE is
$228.70. Nobody will farm that.

But that safety is arithmetic, not structure. The break-even is **893
$JUSTICE per entry**. §5's referral reward has no stated amount; set it at
10,000 and it pays eleven times the cost of writing on day one. And if
$JUSTICE appreciates tenfold the threshold falls to 89, at which point the
existing share reward crosses it on its own.

So rather than argue about a number, the proposal should carry an
invariant:

> **No deterministic per-entry reward may exceed the cost of writing an
> entry, measured on the day the reward is set.**

Competitive rewards — monthly challenges decided by vote — are exempt:
they are lottery-shaped and their expected value per entry is far below
cost. It is the guaranteed, per-action rewards that need the check.

With that invariant in place, the write fee can be set low or at zero and
gas does the work. Without it, no fee is high enough, because the reward
can always be raised to clear it.

**On secondary-market revenue: budget it at zero.** Royalties are
unenforceable on ethscriptions, and secondary markets price ordinal
position and author identity, not writing quality. Entries are already
NFTs — each is an ethscription owned by its author — so a marketplace can
be built or adopted at any time without changing how entries are written.

## 7. What I am asking for

Not a budget. The prototype exists and is MIT licensed; take it, fork it,
or discard it.

1. **Scrutiny of §1 and §3.** If the ownership analysis is wrong, the whole
   design is wrong, and I would rather learn that here.
2. **A decision on §6**, particularly D-4.
3. **A second implementation of the indexer.** The conformance vectors make
   it checkable; someone actually writing one is the only thing that proves
   the specification is complete. Us writing it twice would not count.

---

### Evidence

| | |
|---|---|
| Mainnet entry | [`0xdf4f13fb…`](https://etherscan.io/tx/0xdf4f13fb1bf84c3c742034d92f08cd13d2580ca07813647353c5d72abd80787e) → ethscription #16251113 |
| Rehearsal contract | [`0x3F06F46F…`](https://etherscan.io/address/0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a), block 25932137, deployed for 0.00021 ETH |
| Sepolia | three entries — English, Chinese, and one at the 500-character limit |
| Reproducibility | clean clone rebuilds the archive byte for byte |
| Tests | 64 JavaScript, 23 Solidity |

Full technical detail — the specification, the requirements audit against
the original proposal, the protocol findings, and the mainnet runbook — is
in the repository.
