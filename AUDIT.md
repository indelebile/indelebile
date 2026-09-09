# Code and requirements audit

2026-09-09. Everything below was found by reading the code and running it,
not from memory. Three items were breaking and are fixed; the rest are
listed rather than changed, because most involve a decision.

---

## Fixed in this pass

### 1. `compose.mjs` could not build an entry at all — *breaking*

It built entries with the default protocol tag while the deployed contract
writes `justice-journal-test`, so its own local validation rejected every
entry at V5:

```
local rules FAILS V5
Fix the entry before sending — the fee is spent either way.
```

The tool has been unusable since the rehearsal deployment. The tag now
comes from the configured deployment.

*Why it was not caught:* the tests pin the protocol deliberately, so they
exercise the rules rather than whatever deployment happens to be
configured — which is right, and which is exactly why nothing failed when
the configured deployment diverged.

### 2. The page previewed bytes it was not going to write — *breaking*

Under a heading reading *"the exact bytes that will be recorded"*, the page
showed `"p":"justice-journal"` while the contract writes
`"p":"justice-journal-test"`, and reported the header as 128 bytes when it
is 133. `web/config.js` had no protocol field at all, so the page could not
have known. It has one now, and a test fails if it disagrees with the
indexer's.

### 3. `demo.mjs` quoted gas figures ~27% too high

It still added `26_000` for execution — the pre-calibration estimate taken
from forge's harness. The measured figure is `17_341`. Every number it
printed was wrong; `gas.mjs` was corrected at the time and this was missed.

---

## Gaps in the guarantees

### 4. The conformance vectors do not cover multi-deployment ranges

Contracts are a list now, each covering a block range, and a superseded
contract's later emissions are not entries. That behaviour is tested in
`scan.test.mjs` — but **not in `conformance/vectors.json`**, which is the
only thing a second implementation checks itself against.

So a second indexer could get the range semantics wrong, produce a
different archive, and still pass every vector. This is the sharpest
remaining hole, because the vectors are what the whole "anyone can
reimplement this" claim rests on.

### 5. A test enforces dead code

`web.test.mjs` asserts that `abi.js` exports `decodeEsip3String`, `padAddr`
and `TOPIC`. The page stopped using all three when it moved to reading the
indexer's output. The test now keeps dead code alive.

### 6. `hidden.json` is not wired to the live page

Governance-hidden entries collapse in `render.mjs`'s static output but not
in the page people actually visit. The mechanism exists; the path to it
does not.

---

## Stale documentation

### 7. `STATUS.md` predates six changes

Written 2026-09-08, before: the mainnet deployment, multi-deployment
support, the rehearsal protocol tag, watch mode, the public-RPC finding,
and the page moving to read the indexer's output. Its audit of the original
proposal is still sound; its description of the system is not.

### 8. `MAINNET.md` still says "Still needed before deploying"

It has been deployed. The section now reads as a to-do list for something
already done.

### 9. `SPEC.md` and `PRD.md` do not mention four shipped things

Neither documents `journalContracts` (the deployment list), the rehearsal
protocol tag, the public-RPC constraint on rebuilding the archive, or watch
mode. `SPEC.md` also still refers to a singular `journalContract` in one
place. The specification is what a second implementer reads.

### 10. `DEPLOY-SEPOLIA.md` is superseded by `MAINNET.md`

Two runbooks, one obsolete, neither saying which to follow.

---

## Not implemented, and known

Unchanged from `STATUS.md` — the whole social and incentive layer is
deliberately unbuilt, and none of it is blocked by the data format:

- share cards, Twitter/Telegram posting
- likes, popularity sorting, monthly challenges, Snapshot integration
- referral rewards, curator program *(and see the proposal's
  recommendation to drop per-action rewards entirely)*
- user profiles, ENS, "Freedom ID" badges
- cross-chain logging, ZK log-ins
- community reporting, and the vote that would drive `hidden.json`

Plus, from the infrastructure side:

- **No public repository.** MIT licensed, but it exists on one machine.
  "Anyone can run the indexer" is not yet true in practice.
- **No second implementation.** The vectors make one checkable; nobody has
  written one, and ours writing it twice would not count.
- **The reading rules are not inscribed.** `docs/READING-RULES.txt` and
  `scripts/inscribe-rules.mjs` are ready; the transaction has not been
  sent. Until it is, the instructions for rebuilding the archive live only
  in this repository.
- **`sweepAndBuy` has never run on mainnet** and cannot at current
  liquidity — the contract is deployed with no router at all.

---

## What is sound

Recorded because an audit that only lists faults is misleading:

- The contract, on-chain and verified: head, `headLen`, token, treasury,
  router, fee and gate all read back as intended.
- The archive reproduces byte for byte from a clean clone, and watch mode
  produces the same `entriesHash` as a from-scratch build.
- The canonical Ethscriptions indexer confirms the two properties the
  architecture exists for.
- 73 JavaScript tests and 23 Solidity tests. The ones guarding against
  silent failure — class names, element ids, palette contrast, tab wiring,
  protocol agreement — were each verified by reintroducing the bug.
