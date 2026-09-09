# Conformance vectors

The indexer *is* the protocol. Ethereum's calldata carries a great deal
that is not a Justice Journal entry, and nothing on chain distinguishes
ours from the rest — the rules do. So the rules have to be checkable by
someone who has never seen this repository and does not trust it.

`vectors.json` is that check: inputs paired with the result any correct
implementation must produce.

## Using them for a new implementation

Each vector is one ESIP-3 write plus the author's prior state, and the
result expected of it:

```json
{
  "name": "V6-author-mismatch",
  "why": "the body author must equal the ESIP-3 initialOwner",
  "event": { "emitter": "0x…", "author": "0x…", "contentURI": "data:…", "feeWei": "…", … },
  "authorState": { "maxSeq": null, "recentBlocks": [] },
  "expect": { "valid": false, "failed": ["V6"], "contentHash": "0x…" }
}
```

Run your implementation over `event` and `authorState` under the `params`
at the top of the file. You must reproduce `valid`, `failed` and
`contentHash` exactly. `contentHash` is sha256 of the UTF-8 data URI, the
same rule the Ethscriptions protocol uses.

Passing every vector is not proof of correctness, but failing one is proof
of divergence — and a divergent indexer produces a different archive.

## Changing them

Regenerate with `node conformance/generate.mjs`, and only deliberately.
Every entry already on chain was written under the current rules; changing
a vector changes what counts as an entry, retroactively. That is a
governance decision with an effective-from block, not a code change.

Adding vectors for cases not yet covered is always welcome.

## Deployments are a list, and the ranges matter

`params.journalContracts` carries more than one entry, each with a block
range, because that is the shape the rules actually have: every contract
parameter is immutable, so changing a fee or a treasury means deploying
again, and the archive spans both.

Rule V1 is therefore two conditions wearing one number — the emitter must
be one of ours, **and** the block must fall inside that contract's own
range. Three vectors fail V1 while coming from a perfectly valid address:

| vector | why |
|---|---|
| `V1-retired-contract-after-its-range` | a superseded contract can still emit; those emissions are not entries |
| `V1-current-contract-before-its-range` | a contract cannot reach back before it existed |
| `V1-in-the-gap-between-deployments` | the ranges are deliberately not contiguous |

An implementation that checks the address and ignores the range passes
every other vector in this file and still produces a different archive the
first time the contract is replaced. Those three are what catch it —
verified by writing such an implementation and watching them fail.

Two stateful vectors cover the other half: `V8-seq-carries-across-a-migration`
and `V9-rate-limit-carries-across-a-migration`. An author's sequence numbers
and rate limit do not reset when the contract does.

## What is not covered here

- **V12 (duplicate content)** needs state from earlier entries, so it is
  exercised in `test/scan.test.mjs` rather than as a single-event vector.
- **Ordering and author state accumulation** across many events — also in
  `test/scan.test.mjs`.
- **The protocol's own rules** — that a data URI is well formed, that
  `rule=esip6` parses as a parameter — are checked against the published
  Ethscriptions spec in `test/protocol.test.mjs`.
