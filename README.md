# Indelebile

Journal entries written into Ethereum L1 calldata rather than IPFS, and
minted as ethscriptions **owned by their authors**. A reference
implementation: contract, indexer, and a page to write from.

Live at **https://indelebile.xyz**, rebuilt from the chain every ten minutes by
[a public job](.github/workflows/publish.yml).

| | |
|---|---|
| [PROPOSAL-SHORT.md](PROPOSAL-SHORT.md) | the case, at forum length |
| [SPEC.md](SPEC.md) | entry format, validity rules, cost, front-running |
| [PRD.md](PRD.md) | requirements, scope, decisions left to the DAO |
| [STATUS.md](STATUS.md) | what is built, against the original proposal |
| [AUDIT.md](AUDIT.md) | known faults and gaps |
| [DEPLOY.md](DEPLOY.md) | deploying, and what the mainnet rehearsal established |
| [PROTOCOL-NOTES.md](PROTOCOL-NOTES.md) | what the Ethscriptions spec actually says |

```bash
npm install
npm test                       # 81 tests, no network needed
cd contracts && forge test     # 23 tests
```

## Running it

```bash
node src/indexer.mjs --rpc <rpc>              # build the archive
node src/indexer.mjs --rpc <rpc> --watch 30   # or keep it current
npm run web                                   # http://127.0.0.1:8080
```

The page reads the archive the indexer produced; it does not query the
chain to display entries. Without `out/index.json` it has nothing to show,
so run the indexer first.

`node src/demo.mjs` fills the archive with synthetic entries for a look
around — it **overwrites `out/index.json`**, so run the indexer again
afterwards.

Deploying, on any network: [DEPLOY.md](DEPLOY.md).

## Sending a real entry

`compose.mjs` builds the transaction and prints it. **It never holds a
key, signs, or broadcasts** — you send it yourself from your own wallet.

```bash
node src/compose.mjs \
  --author 0xYOURADDRESS --seq 0 --tags assange,memory \
  --body "March 10, 2024 — I joined my first Julian Assange support rally."
```

Point `src/config.mjs` at a deployment first — `scripts/apply-deployment.mjs`
does that and `web/config.js` together, and refuses if the two end up
disagreeing.

The printed command uses a private RPC. Since entries carry `rule=esip6`
that is a privacy preference rather than a requirement: nobody can take
your content by inscribing it first (SPEC.md §6). It still keeps your words
out of the public mempool until they are mined.

## Indexing

```bash
node src/indexer.mjs --rpc $RPC                 # once
node src/indexer.mjs --rpc $RPC --watch 30      # keep it current
node src/render.mjs --hidden hidden.json
```

Watch mode fetches incrementally but re-derives the whole archive on every
tick, because `scan()` is a pure function of the accumulated writes — so a
long-running build and a from-scratch build cannot disagree, and there is
no carried-forward state to drift. Entries within five blocks of the head
are held back: a reorg that dropped one should not remove it from an
archive that had already shown it.

`--rpc` takes a comma-separated list and falls through it. That is not
belt-and-braces: rebuilding the archive needs historical `eth_getLogs`, and
most free public endpoints now refuse it — one demands a token, another
caps the range at ten blocks, and they change policy without notice. Two
that worked when this was written are `rpc.mevblocker.io` and
`eth.api.onfinality.io/public`; your own node or any provider's free tier
also works and is more dependable.

No archive node is needed — the holding gate lives in the contract, so the
indexer never reads historical state. It reads ESIP-3 logs from the
Indelebile address, so indexing is one filtered request per range
rather than a request per block.

## The indexer is the protocol

Ethereum's calldata carries a great deal that is not a Indelebile
entry, and nothing on chain marks ours apart. The rules do — which means
the archive exists only to the extent that anyone can apply those rules and
get the same answer.

Three things make that checkable rather than asserted:

- **[conformance/vectors.json](conformance/vectors.json)** — inputs paired
  with the result any correct implementation must produce, covering every
  rejection rule. Write an indexer in another language, run these, and you
  can prove you agree. See [conformance/README.md](conformance/README.md).
- **Reproducibility** — a clean clone with no local state rebuilds
  `out/index.json` byte for byte from an ordinary RPC.
- **[docs/READING-RULES.txt](docs/READING-RULES.txt)** — the minimum needed
  to rebuild the archive from Ethereum alone, meant to be inscribed as an
  ethscription so the instructions outlive this repository.

MIT licensed, so a second implementation needs nobody's permission.

## Layout

| file | role |
|---|---|
| `src/config.mjs` | every governance-set parameter |
| `src/entry.mjs` | encoding, canonical form, EIP-7623 gas |
| `src/rules.mjs` | the validity predicate — this *is* the protocol |
| `src/scan.mjs` | the scan loop, pure, testable against a fake chain |
| `src/indexer.mjs` | RPC wiring only |
| `src/gas.mjs` | combines forge execution gas with EIP-7623 calldata cost |
| `contracts/src/Indelebile.sol` | fee, holding gate, ESIP-3 mint, batched sweep |
| `src/compose.mjs` | builds a transaction to send by hand |
| `conformance/vectors.json` | frozen expected results — the protocol's teeth |
| `src/canonical.mjs` | the canonical entry form — **loaded by both the indexer and the page**, so they cannot drift |
| `src/render.mjs` | self-contained HTML viewer |
| `web/index.html` | the write page: compose, validate locally, send |
| `web/abi.js` | hand-rolled ABI encoding; the page loads no libraries |
| `web/serve.mjs` | dev server rooted at the project so the page can share `src/canonical.mjs` |
| `scripts/apply-deployment.mjs` | points both configs at a deployment, and verifies it took |
| `scripts/verify-mainnet.mjs` | checks an entry against the canonical Ethscriptions indexer |
| `scripts/inscribe-rules.mjs` | inscribes the reading rules, so they outlive this repository |
| `hidden.json` | entries governance voted to collapse; never removed |
| `contracts/script/Deploy.s.sol` | deploys the journal plus testnet stand-ins |
