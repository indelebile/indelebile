# Justice Journal (calldata prototype)

Reference implementation for storing AssangeDAO Journal entries directly
in Ethereum L1 calldata instead of IPFS. See [SPEC.md](SPEC.md).

```bash
npm install
node --test 'test/*.test.mjs'      # 20 tests, no network needed

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

Set `treasury` and `justiceToken` in `src/config.mjs` first. Send through
a private RPC (the printed command uses Flashbots Protect) — a public
mempool exposes the bytes to front-running, see SPEC.md §5.

## Indexing

```bash
node src/indexer.mjs --rpc $ARCHIVE_RPC --from <genesis> --seen ethscriptions.txt
node src/render.mjs --hidden hidden.json
```

Needs an archive-capable RPC: V7 reads a historical `balanceOf`, and a
default public node keeps only ~128 blocks of state. The indexer exits
rather than produce an index that would silently differ from everyone
else's.

## Layout

| file | role |
|---|---|
| `src/config.mjs` | every governance-set parameter |
| `src/entry.mjs` | encoding, canonical form, EIP-7623 gas |
| `src/rules.mjs` | the validity predicate — this *is* the protocol |
| `src/scan.mjs` | the scan loop, pure, testable against a fake chain |
| `src/indexer.mjs` | RPC wiring only |
| `src/compose.mjs` | builds a transaction to send by hand |
| `src/render.mjs` | self-contained HTML viewer |
