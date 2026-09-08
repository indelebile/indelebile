#!/usr/bin/env node
// Generates conformance/vectors.json from the reference implementation.
//
// The vectors are the point where "the indexer is the protocol" stops being
// a slogan. Without them, the protocol is whatever our JavaScript happens
// to do, and a second implementation in another language has nothing to
// check itself against. With them, anyone can write their own indexer and
// prove it agrees — which is what makes the archive independent of us.
//
// Run this only to add cases. Changing an existing vector changes the
// protocol, and every entry already on chain was written under the old one.

import { writeFileSync } from 'node:fs';
import { validate } from '../src/rules.mjs';
import { buildEntry, toDataUri, DATA_URI_PREFIX, canonicalJson, PROTOCOL } from '../src/canonical.mjs';
import { PARAMS } from '../src/config.mjs';

const JOURNAL = '0x1000000000000000000000000000000000000001';
const A = '0xaaaa000000000000000000000000000000000001';
const B = '0xbbbb000000000000000000000000000000000002';
// Pinned to the archive's own tag. A rehearsal deployment runs under a
// different one, and the vectors describe the rules, not one deployment.
const P = { ...PARAMS, journalContracts: [{ address: JOURNAL, fromBlock: 0, toBlock: null }],
            genesisBlock: 1000, protocol: PROTOCOL };

const uriFor = (over = {}) =>
  toDataUri(buildEntry({ author: A, seq: 0, ts: 1757280000, tags: ['assange'], body: 'hello', ...over }));

const ev = (over = {}) => ({
  txHash: '0x' + '11'.repeat(32),
  blockNumber: 1000,
  logIndex: 0,
  emitter: JOURNAL,
  author: A,
  contentURI: uriFor(),
  feeWei: P.minFeeWei.toString(),
  ...over,
});

const raw = (json) => DATA_URI_PREFIX + json;

const cases = [
  ['valid-english', 'the ordinary case', ev()],
  ['valid-chinese-at-limit', '500 code points of Chinese is 1500 bytes and must still pass',
    ev({ contentURI: uriFor({ body: '记'.repeat(500) }) })],
  ['valid-no-tags', 'tags may be empty', ev({ contentURI: uriFor({ tags: [] }) })],
  ['valid-escaped-newline', 'JSON escapes control characters, so a newline survives',
    ev({ contentURI: uriFor({ body: 'one\ntwo' }) })],

  ['V1-foreign-emitter', 'anyone can emit the ESIP-3 event; only our contract counts',
    ev({ emitter: '0x9999999999999999999999999999999999999999' })],
  ['V2-underpaid', 'the fee is the per-entry spam cost', ev({ feeWei: (P.minFeeWei - 1n).toString() })],
  ['V4-reordered-keys', 'canonical key order is p,v,author,seq,ts,tags,body',
    ev({ contentURI: raw('{"v":1,"p":"justice-journal","author":"' + A + '","seq":0,"ts":1,"tags":[],"body":"x"}') })],
  ['V4-extra-key', 'unknown keys would let two ethscriptions decode to one entry',
    ev({ contentURI: raw(canonicalJson(buildEntry({ author: A, seq: 0, ts: 1, tags: [], body: 'x' })).slice(0, -1) + ',"extra":1}') })],
  ['V4-pretty-printed', 'whitespace is not canonical',
    ev({ contentURI: raw(JSON.stringify(buildEntry({ author: A, seq: 0, ts: 1, tags: [], body: 'x' }), null, 2)) })],
  ['V4-wrong-prefix', 'the rule=esip6 parameter is part of the canonical form',
    ev({ contentURI: 'data:application/json;charset=utf-8,{"p":"justice-journal","v":1,"author":"' + A + '","seq":0,"ts":1,"tags":[],"body":"x"}' })],
  ['V4-not-json', 'malformed content is not an entry', ev({ contentURI: DATA_URI_PREFIX + 'not json' })],
  ['V5-wrong-protocol', 'another protocol reusing our contract is still not us',
    ev({ contentURI: raw('{"p":"other","v":1,"author":"' + A + '","seq":0,"ts":1,"tags":[],"body":"x"}') })],
  ['V6-author-mismatch', 'the body author must equal the ESIP-3 initialOwner',
    ev({ author: B })],
  ['V10-empty-body', 'an empty entry is not an entry', ev({ contentURI: uriFor({ body: '' }) })],
  ['V10-over-limit', '501 code points', ev({ contentURI: uriFor({ body: '记'.repeat(501) }) })],
  ['V11-uppercase-tag', 'tags are lowercase letters, digits and hyphens',
    ev({ contentURI: raw('{"p":"justice-journal","v":1,"author":"' + A + '","seq":0,"ts":1,"tags":["Assange"],"body":"x"}') })],
  ['V11-too-many-tags', 'at most five',
    ev({ contentURI: uriFor({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }) })],
  ['V13-before-genesis', 'nothing before the protocol starts', ev({ blockNumber: 999 })],
];

// Stateful rules need a starting position, expressed as data so another
// implementation can reproduce it without reading our code.
const stateful = [
  ['V8-seq-not-increasing', 'seq must exceed every seq this author already had accepted',
    ev(), { maxSeq: 0, recentBlocks: [] }],
  ['V8-seq-may-skip', 'gaps are allowed; only the direction is enforced',
    ev({ contentURI: uriFor({ seq: 7 }) }), { maxSeq: 3, recentBlocks: [] }],
  ['V9-rate-limited', 'three entries per author per 50,400 blocks',
    ev(), { maxSeq: null, recentBlocks: [999, 998, 997] }],
  ['V9-outside-window', 'older entries do not count against the limit',
    ev({ blockNumber: 100000 }), { maxSeq: null, recentBlocks: [1, 2, 3] }],
];

const vectors = [];
for (const [name, why, e] of cases) {
  const r = validate(e, { authorState: { maxSeq: null, recentBlocks: [] }, seenContent: new Set(), params: P });
  vectors.push({ name, why, event: e, authorState: { maxSeq: null, recentBlocks: [] },
                 expect: { valid: r.valid, failed: r.failed, contentHash: r.contentHash } });
}
for (const [name, why, e, authorState] of stateful) {
  const r = validate(e, { authorState, seenContent: new Set(), params: P });
  vectors.push({ name, why, event: e, authorState,
                 expect: { valid: r.valid, failed: r.failed, contentHash: r.contentHash } });
}

writeFileSync(new URL('vectors.json', import.meta.url), JSON.stringify({
  protocol: 'justice-journal', version: 1,
  note: 'Expected results for any implementation of the Justice Journal rules. See conformance/README.md.',
  params: {
    journalContracts: [{ address: JOURNAL, fromBlock: 0, toBlock: null }],
    protocol: P.protocol,
    minFeeWei: P.minFeeWei.toString(),
    maxEntriesPerAuthorPerWindow: P.maxEntriesPerAuthorPerWindow,
    rateLimitWindowBlocks: P.rateLimitWindowBlocks,
    bodyMaxChars: P.bodyMaxChars,
    maxTags: P.maxTags,
    genesisBlock: P.genesisBlock,
  },
  vectors,
}, null, 2) + '\n');

console.log(`wrote ${vectors.length} vectors (${vectors.filter((v) => v.expect.valid).length} valid, ${vectors.filter((v) => !v.expect.valid).length} rejected)`);
