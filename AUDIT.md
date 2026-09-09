# Code and requirements audit

2026-09-09. Everything below was found by reading the code and running it,
not from memory.

**All eleven findings are now closed.** Three were breaking. What remains
after them is the *unimplemented* list at the foot of this page, which is
deliberate and, with two exceptions, waiting on decisions rather than work.

The pattern worth noticing: every fault here was silent. A tool that
refused to build anything, a preview showing bytes that were not going to
be written, gas figures a quarter too high, vectors that would have passed
a wrong implementation, a demo script replacing the live archive. None of
them raised an error. Each fix that could be guarded now has a test that
was verified by reintroducing the bug.

---

## Findings

### 1. `compose.mjs` could not build an entry at all — *breaking*, fixed

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

### 2. The page previewed bytes it was not going to write — *breaking*, fixed

Under a heading reading *"the exact bytes that will be recorded"*, the page
showed `"p":"justice-journal"` while the contract writes
`"p":"justice-journal-test"`, and reported the header as 128 bytes when it
is 133. `web/config.js` had no protocol field at all, so the page could not
have known. It has one now, and a test fails if it disagrees with the
indexer's.

### 3. `demo.mjs` quoted gas figures ~27% too high — fixed

It still added `26_000` for execution — the pre-calibration estimate taken
from forge's harness. The measured figure is `17_341`. Every number it
printed was wrong; `gas.mjs` was corrected at the time and this was missed.

---

## Gaps in the guarantees

### 4. ~~The conformance vectors do not cover multi-deployment ranges~~ — fixed

*Was:* contracts are a list, each covering a block range, and that
behaviour was tested in `scan.test.mjs` but not in the vectors — the only
thing a second implementation checks itself against. An indexer could get
the range semantics wrong and still pass everything.

*Now:* the vector set carries two deployments with a deliberate gap between
them, and V1 is exercised as the two conditions it actually is:

| vector | why |
|---|---|
| `V1-retired-contract-after-its-range` | a superseded contract can still emit |
| `V1-current-contract-before-its-range` | it cannot reach back before it existed |
| `V1-in-the-gap-between-deployments` | the ranges are not contiguous |
| `valid-under-retired-contract` | and the retired one still owns its blocks |
| `V8-seq-carries-across-a-migration` | an author cannot reset their history |
| `V9-rate-limit-carries-across-a-migration` | nor their rate limit |

22 vectors became 28. Proved by writing an implementation that checks the
address and ignores the range — the shape of the mistake anyone would
make — and confirming three vectors catch it. A test now keeps the vector
set able to make that distinction: it requires more than one deployment, a
closed range, a real gap, and at least three vectors that fail V1 from an
otherwise valid address.

### 5. ~~A test enforces dead code~~ — fixed

*Was:* `web.test.mjs` asserted that `abi.js` exports `decodeEsip3String`,
`padAddr` and `TOPIC`, all unused since the page moved to reading the
indexer's output. The test kept dead code alive.

*Now:* removed, and the test asserts the opposite — those helpers must
**not** come back, because exporting them invites re-deriving the rules in
the browser, which is what the page was moved away from.

### 6. ~~`hidden.json` is not wired to the live page~~ — fixed

*Was:* governance-hidden entries collapsed in `render.mjs`'s static output
but not in the page people actually visit.

*Now:* the page reads `hidden.json` and collapses the entry in place,
keeping its author, date, block link and tags, and saying it is *still in
the index and still on chain* with a link to the calldata. A missing or
unreadable list hides nothing — moderation fails open, which is the right
way for it to fail in an archive.

---

### 11. `demo.mjs` silently overwrites the live archive — fixed

Found while auditing: running it replaces `out/index.json` with synthetic
entries and says nothing, so the page then shows sample data as though it
were the archive. It now warns on the way out, `render.mjs` warns when it
reads one, and the page labels it instead of printing a block height.

## Documentation

### 7. ~~`STATUS.md` predates six changes~~ — fixed

*Was:* written before the mainnet deployment, multi-deployment support, the
rehearsal protocol tag, watch mode, the public-RPC finding, and the page
moving to read the indexer's output.

*Now:* those six have a section of their own, the rows they invalidated are
corrected, and the $2.29 holding gate is recorded among the things the
proposal did not anticipate. The requirements audit itself needed no
change — it was the system description that had gone stale.

### 8. ~~`MAINNET.md` still says "Still needed before deploying"~~ — fixed

Folded into `DEPLOY.md`, where what the rehearsal established is recorded
as fact and what remains is scoped to the *real* deployment: the DAO's
multisig treasury, the production protocol tag, and inscribing the reading
rules.

### 9. ~~`SPEC.md` and `PRD.md` do not mention four shipped things~~ — fixed

*Was:* neither documented `journalContracts`, the rehearsal protocol tag,
the public-RPC constraint, or watch mode — and the specification is what a
second implementer reads.

*Now:* `SPEC.md` §4 explains that V1 is two conditions and why deployments
are a list; §3 covers the protocol tag as a deployment parameter; a new
§6c covers the RPC constraint, why reading the archive needs no endpoint,
and how watch mode stays consistent with a from-scratch build. `PRD.md`
gains NFR-6 and NFR-7. The singular reference is gone.

### 10. ~~`DEPLOY-SEPOLIA.md` is superseded by `MAINNET.md`~~ — fixed

Both replaced by one `DEPLOY.md` covering local, Sepolia and mainnet, with
the reasons for each mainnet setting and what the rehearsal established.
`README.md` was rewritten alongside it: it advertised the wrong test
counts and led with `demo.mjs`, which overwrites the real archive.

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
