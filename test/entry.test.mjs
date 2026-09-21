// Encoding only. Rule coverage lives in scan.test.mjs, which exercises the
// same predicate end to end.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEntry, encode, decode, estimateGas, codePointLength } from '../src/entry.mjs';

const AUTHOR = '0x1111111111111111111111111111111111111111';
const entry = buildEntry({
  author: AUTHOR.toUpperCase(), seq: 0, ts: 1757280000, tags: ['Assange', 'iran'],
  body: 'My name is C. In 2023, I wrote an anonymous letter in Iran for freedom.',
});

test('addresses and tags are lowercased on the way in', () => {
  assert.equal(entry.author, AUTHOR);
  assert.deepEqual(entry.tags, ['assange', 'iran']);
});

test('encode/decode round-trips exactly', () => {
  const { uri, calldata } = encode(entry);
  const d = decode(calldata);
  assert.equal(d.ok, true);
  assert.deepEqual(d.entry, entry);
  assert.equal(encode(d.entry).uri, uri);
});

test('keys are emitted in the canonical order', () => {
  const { uri } = encode(entry);
  const keys = [...uri.matchAll(/"(p|v|author|seq|ts|tags|body)":/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['p', 'v', 'author', 'seq', 'ts', 'tags', 'body']);
});

test('decode rejects reordered keys, extra keys and stray whitespace', () => {
  const hex = (s) => '0x' + Buffer.from('data:application/json;charset=utf-8,' + s, 'utf8').toString('hex');
  const base = { p: 'indelebile', v: 1, author: AUTHOR, seq: 0, ts: 1, tags: [], body: 'x' };
  assert.equal(decode(hex(JSON.stringify({ body: 'x', ...base }))).ok, false);
  assert.equal(decode(hex(JSON.stringify({ ...base, extra: 1 }))).ok, false);
  assert.equal(decode(hex(JSON.stringify(base, null, 1))).ok, false);
});

test('decode never throws on hostile input', () => {
  for (const bad of ['0x', '0xdeadbeef', '0x' + '41'.repeat(50), '0xff']) {
    const r = decode(bad);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
  }
});

test('code point counting treats Chinese and English alike', () => {
  assert.equal(codePointLength('记'.repeat(500)), 500);
  assert.equal(codePointLength('a'.repeat(500)), 500);
});

test('a long entry hits the EIP-7623 floor, a short one may not', () => {
  const long = estimateGas(encode(buildEntry({ ...entry, body: '记'.repeat(500) })).calldata);
  assert.equal(long.gas, long.floor);
  assert.ok(long.floor > long.standard, 'data-heavy entries are floor-priced');
});
