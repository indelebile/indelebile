# What the Ethscriptions spec actually says

Read 2026-09-08 from docs.ethscriptions.com and facet.org, after building
most of this on assumptions. Recording it here because several assumptions
were wrong and the corrections were not cosmetic.

## Confirmed

**Transaction recipient is the initial owner.** "The recipient of the
creation transaction is the Ethscription's initial owner." The architecture
pivot away from `tx.to == treasury` was necessary, not a nicety — that
design really would have given the DAO ownership of every entry.

**The ESIP-3 event signature is exactly what we emit.**

```solidity
event ethscriptions_protocol_CreateEthscription(address indexed initialOwner, string contentURI);
```

**Uniqueness is sha256 of the UTF-8 dataURI.** Matches `contentHash()`.

**Our mimetype parses.** `application/json;charset=utf-8` splits into
mimetype `application/json` and parameters `;charset=utf-8`; any
syntactically valid mimetype is allowed.

## Wrong, and corrected

**Contract creation is ESIP-3, not ESIP-2.** ESIP-2 is trustless escrow
(`TransferEthscriptionForPreviousOwner`). Every mention in this repo said
ESIP-2. Live since L1 block 18130000.

**ESIP-6 exists and solves front-running outright.** Adding `rule=esip6` as
a dataURI parameter opts out of global uniqueness, and such content can
never be invalidated as a duplicate. The ESIP's rationale names our exact
situation: a contract that has taken a user's money cannot revert if
creation fails. Three separate mitigations we had designed — `--seen`
seeding, `seq`-bump recovery, mandatory private mempool — were all
unnecessary.

**Gzip is unavailable to us.** ESIP-7 would cut JSON size meaningfully but
"does not apply to contract-created ethscriptions." Author ownership costs
us compression.

**Blobs are for attachments only.** ESIP-8 allows blob attachments; the
text still belongs in calldata, since blobs are pruned after ~18 days.

## The sharp edge we are one anchor away from

ESIP-3 keeps one ethscription per transaction and **prioritises calldata
over events**. Tested against the spec's own regex, using our real calldata:

```
spec regex (anchored \Adata:)   matches?  false   -> our event wins, author owns it
unanchored variant              matches?  true    -> calldata wins, contract owns it
```

The published spec anchors, so we are correct. But an indexer that did not
anchor would silently reproduce the original ownership bug on every entry.
Hardening: let the contract assemble the dataURI from a raw body, so the
calldata carries no `data:` prefix at all. Tracked as PRD decision D-5.

## Things that changed under the protocol since this repo started

**There is now an Ethscriptions AppChain** — a Stage-2 L2 that derives
ethscription state deterministically from L1, with EVM predeploys and
SSTORE2 content storage. Two ways to consume the same canonical state: the
traditional off-chain indexer (what we built) or the AppChain. Worth
mentioning in the proposal: the archive is independently verifiable through
a second, cryptographic path we do not have to build or run.

**Facet is a Stage-2 rollup with no admin keys**, base-sequenced through a
fixed EOA inbox nobody controls, with a native gas token (FCT) minted in
proportion to L1 gas burned rather than bridged. The censorship-resistance
story is stronger than I credited. It still is not where the archive
belongs — that stays on L1 — but it is a credible home for a later
interaction layer, and FCT-by-burning means participants would not need to
bridge.

## Still unverified

- The `DataUri` class is a gem, not in the indexer repo, so the anchoring
  was confirmed against the published spec rather than the running code.
  The reference indexer's last commit is 2025-10; the AppChain may now be
  the authoritative implementation.
- Whether the AppChain's derivation treats calldata-vs-event priority
  identically to the traditional indexer.
- Whether L1 ERC-20 balances are readable from Facet, which is what a
  Facet-hosted interaction layer would need to reuse the holding gate.
