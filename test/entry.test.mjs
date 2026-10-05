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

// The Etherscan path pastes the tail into a single-line input. A raw line
// break would be cut there, the contract would take what was left and the
// fee with it, and the archive would reject the entry. JSON escapes control
// characters, so a multi-paragraph body must still come out on one line —
// and must come back out exactly as written.
test('an entry tail is always one line, and round-trips exactly', async () => {
  const { buildEntry, entryTail, headFor, PROTOCOL } = await import('../src/canonical.mjs');
  const author = '0x' + 'ab'.repeat(20);
  const body = '第一段，有"引号"和\\反斜杠。\n\n第二段\tafter a tab.\r\nAnd 🕊 an emoji.';
  const entry = buildEntry({ author, seq: 4, ts: 1791200000, tags: ['assange'], body, p: PROTOCOL });
  const tail = entryTail(entry);

  assert.ok(!/[\n\r\t]/.test(tail), 'the tail must contain no raw control characters');

  // What the contract will assemble: head, then the signer's address, then the tail.
  const uri = headFor(PROTOCOL) + author.slice(2) + tail;
  const json = JSON.parse(uri.slice(uri.indexOf(',') + 1));
  assert.deepEqual(json, entry, 'the contract-assembled entry must equal the one composed');
});
