# Indelebile — a technical design for the Justice Journal proposal

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
| **D-1** | Rewards, and therefore the fee | Gas already deters casual junk — nobody pays to write nonsense. The open question is §5: pay for the act of writing, or only for entries the community elects? See the recommendation below. With no per-action reward, the write fee can be low or zero. |
| **D-2** | Transferability by default | Tradable entries invite ordinal sniping and flip bait, which works against an archive. Soulbound with author opt-in unlock is one option. |
| **D-3** | Rate limit | Three entries per author per week is a placeholder. |
| **D-4** | **The worst entry** | Someone will inscribe something illegal. On IPFS you could unpin; here you cannot. This needs an answer before launch — it is the strongest objection to the whole approach. |

### A recommendation on rewards

**Pay nothing for the act of writing. Reward only the entries the
community elects.** Four things follow, and none of them requires trusting
that nobody will try.

**1. It removes the arithmetic instead of pricing around it.** A guaranteed
per-entry reward is farmable the moment it exceeds the cost of writing;
the only defence is to keep pricing it below, forever, as both sides move.
§5's rewards happen to be safe today — writing an entry costs about
**$0.0204** while a 50–100 $JUSTICE share reward is worth **$0.0011–0.0023**
— but break-even is **893 $JUSTICE per entry**, the referral reward has no
stated amount, and a tenfold price move drops the threshold to 89. Deleting
per-action rewards makes the question moot rather than recurring. It also
removes referral tracking, reward caps and payout logic from the budget.

**2. Capturing a competitive prize does not pay.** The monthly cap of 10M
$JUSTICE is **$228.70**. Acquiring 50M $JUSTICE to swing a vote costs
**$1,418** at a 24% slippage premium, and round-tripping out of an illiquid
position leaves roughly $500 of pure friction. Spending $500 to win $229 is
a bad trade before counting the price exposure carried through the voting
period — a 20% drawdown on that position exceeds the entire prize.

**3. And that holds regardless of price.** Both the prize and the cost of
capturing it are denominated in $JUSTICE, so appreciation moves them
together and the ratio is unchanged. This is exactly what per-action
rewards do *not* give you: those pay $JUSTICE against a cost denominated in
ETH gas, which is the one place price movement can open a gap. Dropping
them closes the only price-sensitive hole in the design.

**4. The real variable is turnout, not price.** With a prize `P` and honest
voting weight `H`, capture becomes profitable once `P > 0.25 × H` — that
is, when turnout falls below roughly four times the prize. At a 10M cap,
voting must stay above **40M $JUSTICE**, or 0.24% of supply. Low for an
active DAO; not automatic for a quiet month, where one participant could
take the prize for a few hundred dollars.

So rather than a fixed monthly cap:

> **Scale the prize to the voting weight that actually turned out, and
> pay nothing below a quorum.**

That adapts to how alive the DAO is, instead of assuming it.

Two conditions make the model hold in practice:

- **Winners chosen by judgment, not by a metric.** If selection follows
  likes or views, volume becomes useful again and those signals can be
  manufactured. People recognise padding; counters do not.
- **Decide who votes.** Under token weighting, splitting into many
  addresses gains nothing, so a holding gate adds little; under
  one-address-one-vote it *is* the sybil cost, and 500,000 $JUSTICE
  ($11.49) is a far better gate than 100,000 ($2.29). Note that tokens are
  not consumed — an attacker buys, votes, and sells — so the real cost is
  round-trip friction, not face value.

**The strongest argument is not about spam.** Paying for the act of writing
changes who shows up: some arrive because they want to write, and some
because it pays. Paying only for what the community singles out means
everyone who writes is there for the first reason. For an archive meant to
be read in twenty years, that is not a side effect — it is the substance.


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
