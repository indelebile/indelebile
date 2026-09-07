# Justice Journal (calldata prototype)

Reference implementation for storing AssangeDAO Journal entries directly
in Ethereum L1 calldata instead of IPFS, minted as ethscriptions owned by
their authors.

- [PRD.md](PRD.md) — requirements, scope, open decisions for the DAO
- [SPEC.md](SPEC.md) — entry format, validity rules, cost, front-running

```bash
npm install
node --test 'test/*.test.mjs'        # 20 tests, no network needed
cd contracts && forge test           # 14 tests

node src/demo.mjs && node src/render.mjs   # synthetic index + viewer
open out/journal.html
```

## Sending a real entry

`compose.mjs` builds the transaction and prints it. **It never holds a
key, signs, or broadcasts** — you send it yourself from your own wallet.

```bash
node src/compose.mjs \
  --author 0xYOURADDRESS --seq 0 --tags assange,memory \
  --body "March 10, 2024 — I joined my first Julian Assange support rally."
```

Set `journalContract` in `src/config.mjs` to the deployed address first.
Send through a private RPC (the printed command uses Flashbots Protect) —
a public mempool exposes the bytes to front-running, see SPEC.md §6.

## Indexing

```bash
node src/indexer.mjs --rpc $RPC --from <genesis> --seen ethscriptions.txt
node src/render.mjs --hidden hidden.json
```

An ordinary RPC is enough — the holding gate lives in the contract, so the
indexer never reads historical state. It reads ESIP-2 logs from the
JusticeJournal address, so indexing is one filtered request per range
rather than a request per block.

## Layout

| file | role |
|---|---|
| `src/config.mjs` | every governance-set parameter |
| `src/entry.mjs` | encoding, canonical form, EIP-7623 gas |
| `src/rules.mjs` | the validity predicate — this *is* the protocol |
| `src/scan.mjs` | the scan loop, pure, testable against a fake chain |
| `src/indexer.mjs` | RPC wiring only |
| `src/gas.mjs` | combines forge execution gas with EIP-7623 calldata cost |
| `contracts/src/JusticeJournal.sol` | fee, holding gate, ESIP-2 mint, batched sweep |
| `src/compose.mjs` | builds a transaction to send by hand |
| `src/render.mjs` | self-contained HTML viewer |
