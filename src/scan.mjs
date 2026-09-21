// The scan loop, separated from RPC wiring so it can be run against a fake
// chain in tests. Deterministic given the same events and range.
//
// `chain.getWrites(from, to)` returns every ESIP-3 write log from the
// Indelebile contract in ascending (blockNumber, logIndex) order.
// Reading logs rather than scanning blocks is what makes this fast: one
// filtered request per range instead of a request per block.
//
// `seenContent` may be pre-seeded with the canonical Ethscriptions global
// content set. Our own scan only knows about writes through our contract,
// which is a strictly weaker uniqueness check than the protocol's — an
// entry can pass V12 here while the ethscription itself was already minted
// by someone else. Seed it in production. See SPEC.md.

import { PARAMS } from './config.mjs';
import { validate } from './rules.mjs';

export async function scan(chain, { from, to, params = PARAMS, seenContent = new Set() } = {}) {
  const authors = new Map();
  const entries = [];
  const rejected = [];
  const stateOf = (a) => authors.get(a) ?? { maxSeq: null, recentBlocks: [] };

  const writes = await chain.getWrites(BigInt(from), BigInt(to));
  const ordered = [...writes].sort(
    (a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex,
  );

  for (const raw of ordered) {
    const ev = { ...raw, blockNumber: Number(raw.blockNumber), author: raw.author.toLowerCase() };
    const r = validate(ev, { authorState: stateOf(ev.author), seenContent, params });

    if (!r.valid) {
      rejected.push({ txHash: ev.txHash, block: ev.blockNumber, failed: r.failed });
      continue;
    }
    seenContent.add(r.contentHash);
    const st = stateOf(ev.author);
    authors.set(ev.author, { maxSeq: r.entry.seq, recentBlocks: [...st.recentBlocks, ev.blockNumber] });
    entries.push({
      id: ev.txHash, block: ev.blockNumber, logIndex: ev.logIndex,
      author: ev.author, seq: r.entry.seq, ts: r.entry.ts,
      tags: r.entry.tags, body: r.entry.body,
      contentHash: r.contentHash, feeWei: String(ev.feeWei),
    });
  }
  entries.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
  return { entries, rejected };
}
