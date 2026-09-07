// The scan loop, separated from RPC wiring so it can be run against a
// fake chain in tests. `chain` needs three methods: getBlock, getReceipt,
// balanceOfAt. Deterministic given the same chain and range.

import { PARAMS } from './config.mjs';
import { validate } from './rules.mjs';

// `seenContent` may be pre-seeded with the canonical Ethscriptions global
// content set. Our own scan only knows about content sent to the treasury,
// which is a strictly weaker uniqueness check than the protocol's — an
// entry can pass V12 here while the ethscription itself was already minted
// by someone else. Seed it in production. See SPEC.md §5.
export async function scan(chain, { from, to, params = PARAMS, onBlock, seenContent = new Set() } = {}) {
  const TREASURY = params.treasury.toLowerCase();
  const authors = new Map();
  const entries = [];
  const rejected = [];
  const stateOf = (a) => authors.get(a) ?? { maxSeq: null, recentBlocks: [] };

  for (let n = BigInt(from); n <= BigInt(to); n++) {
    const block = await chain.getBlock(n);
    onBlock?.(n, entries.length);
    for (const tx of block.transactions) {
      if ((tx.to ?? '').toLowerCase() !== TREASURY) continue;

      const receipt = await chain.getReceipt(tx.hash);
      const author = tx.from.toLowerCase();
      const balance = await chain.balanceOfAt(tx.from, n - 1n);

      const rec = {
        hash: tx.hash, blockNumber: Number(n), txIndex: tx.transactionIndex,
        from: author, to: tx.to, value: tx.value, input: tx.input,
        status: receipt.status,
      };
      const r = validate(rec, {
        justiceBalance: balance, authorState: stateOf(author), seenContent, params,
      });

      if (!r.valid) {
        rejected.push({ hash: tx.hash, block: Number(n), failed: r.failed });
        continue;
      }
      seenContent.add(r.contentHash);
      const st = stateOf(author);
      authors.set(author, { maxSeq: r.entry.seq, recentBlocks: [...st.recentBlocks, Number(n)] });
      entries.push({
        id: tx.hash, block: Number(n), txIndex: tx.transactionIndex,
        author, seq: r.entry.seq, ts: r.entry.ts,
        tags: r.entry.tags, body: r.entry.body,
        contentHash: r.contentHash, feeWei: tx.value.toString(),
      });
    }
  }
  entries.sort((a, b) => a.block - b.block || a.txIndex - b.txIndex);
  return { entries, rejected };
}
