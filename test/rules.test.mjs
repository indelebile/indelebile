import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEntry, encode, decode, estimateGas, canonicalJson } from '../src/entry.mjs';
import { validate } from '../src/rules.mjs';
import { PARAMS } from '../src/config.mjs';

const AUTHOR = '0x1111111111111111111111111111111111111111';
const TREASURY = '0x2222222222222222222222222222222222222222';
const P = { ...PARAMS, treasury: TREASURY, genesisBlock: 100 };

const goodEntry = buildEntry({
  author: AUTHOR, seq: 0, ts: 1757280000,
  tags: ['assange', 'iran'],
  body: 'My name is C. In 2023 I wrote an anonymous letter in Iran for freedom.',
});

function txFor(entry, over = {}) {
  const { calldata } = encode(entry);
  return {
    hash: '0xdead', blockNumber: 1000, txIndex: 0,
    from: AUTHOR, to: TREASURY, value: P.minFeeWei,
    input: calldata, status: 'success', ...over,
  };
}
const ctx = (over = {}) => ({
  justiceBalance: P.minJusticeBalance, authorState: { maxSeq: null, recentBlocks: [] },
  seenContent: new Set(), params: P, ...over,
});

test('encode/decode round-trips exactly', () => {
  const { uri, calldata } = encode(goodEntry);
  const d = decode(calldata);
  assert.equal(d.ok, true);
  assert.deepEqual(d.entry, goodEntry);
  assert.equal(encode(d.entry).uri, uri);
});

test('a well-formed entry is valid', () => {
  const r = validate(txFor(goodEntry), ctx());
  assert.deepEqual(r.failed, []);
  assert.equal(r.valid, true);
});

test('V6 blocks calldata copied by a front-runner', () => {
  // Attacker replays the exact bytes from the mempool from their own EOA.
  const attacker = '0x9999999999999999999999999999999999999999';
  const r = validate(txFor(goodEntry, { from: attacker }), ctx());
  assert.equal(r.valid, false);
  assert.ok(r.failed.includes('V6'));
});

test('V4 rejects non-canonical key order', () => {
  const reordered = '{"body":"x","p":"justice-journal","v":1,"author":"' + AUTHOR + '","seq":0,"ts":1,"tags":[]}';
  const uri = 'data:application/json;charset=utf-8,' + reordered;
  const hex = '0x' + Buffer.from(uri, 'utf8').toString('hex');
  const r = validate(txFor(goodEntry, { input: hex }), ctx());
  assert.ok(r.failed.includes('V4'));
});

test('V2 rejects an underpaid entry', () => {
  const r = validate(txFor(goodEntry, { value: P.minFeeWei - 1n }), ctx());
  assert.ok(r.failed.includes('V2'));
});

test('V7 rejects an author below the holding gate', () => {
  const r = validate(txFor(goodEntry), ctx({ justiceBalance: P.minJusticeBalance - 1n }));
  assert.ok(r.failed.includes('V7'));
});

test('V8 requires a strictly increasing seq', () => {
  const r = validate(txFor(goodEntry), ctx({ authorState: { maxSeq: 0, recentBlocks: [] } }));
  assert.ok(r.failed.includes('V8'));
});

test('V9 enforces the rate limit inside the window, and releases outside it', () => {
  const at = { blockNumber: 100_000 };
  const recent = [99_999, 99_998, 99_997];
  const hit = validate(txFor(goodEntry, at), ctx({ authorState: { maxSeq: null, recentBlocks: recent } }));
  assert.ok(hit.failed.includes('V9'));
  const old = [1, 2, 3]; // older than the 50,400-block trailing window
  const pass = validate(txFor(goodEntry, at), ctx({ authorState: { maxSeq: null, recentBlocks: old } }));
  assert.ok(!pass.failed.includes('V9'));
});

test('V10 counts code points, so Chinese gets the same allowance', () => {
  const cn = buildEntry({ author: AUTHOR, seq: 0, ts: 1, tags: [], body: '记'.repeat(500) });
  const r = validate(txFor(cn), ctx());
  assert.ok(!r.failed.includes('V10'));
  const over = buildEntry({ author: AUTHOR, seq: 0, ts: 1, tags: [], body: '记'.repeat(501) });
  assert.ok(validate(txFor(over), ctx()).failed.includes('V10'));
});

test('V12 rejects a duplicate of an entry already inscribed', () => {
  const first = validate(txFor(goodEntry), ctx());
  const r = validate(txFor(goodEntry), ctx({ seenContent: new Set([first.contentHash]) }));
  assert.ok(r.failed.includes('V12'));
});

test('a griefed author recovers by bumping seq', () => {
  const first = validate(txFor(goodEntry), ctx());
  const bumped = buildEntry({ ...goodEntry, author: AUTHOR, seq: 1 });
  const r = validate(txFor(bumped), ctx({ seenContent: new Set([first.contentHash]) }));
  assert.deepEqual(r.failed, []);
});

test('gas estimate uses the EIP-7623 floor', () => {
  const g = estimateGas(encode(goodEntry).calldata);
  assert.equal(g.gas, g.floor);
  assert.ok(g.floor > g.standard);
});
