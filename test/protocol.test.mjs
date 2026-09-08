// Conformance against the published Ethscriptions specification, rather
// than against our own assumptions. The regex and the esip6 check below
// are ports of the Ruby in docs.ethscriptions.com/overview/protocol-specification
// and ESIP-6. If our format ever stops being a valid dataURI, or stops
// carrying the esip6 opt-out, these fail.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEntry, toDataUri, DATA_URI_PREFIX } from '../src/canonical.mjs';
import { encode, contentHash } from '../src/entry.mjs';
import { sha256, toHex } from 'viem';

// %r{\Adata:(?<mediatype>(?<mimetype>.+?/.+?)?(?<parameters>(?:;.+?=.+?)*))?(?<extension>;base64)?,(?<data>.*)}x
// Ruby's `.` excludes newlines and `\A` anchors at string start; the JS
// equivalent is `^` with no /m and no /s.
const DATA_URI = /^data:((.+?\/.+?)?((?:;.+?=.+?)*))?(;base64)?,(.*)$/;

const parse = (uri) => {
  const m = DATA_URI.exec(uri);
  return m && { mediatype: m[1], mimetype: m[2], parameters: m[3], base64: m[4], data: m[5] };
};

const entry = buildEntry({
  author: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  seq: 0, ts: 1757280000, tags: ['assange'],
  body: 'March 10, 2024 — I joined my first rally.',
});

test('our content is a syntactically valid dataURI', () => {
  const m = parse(toDataUri(entry));
  assert.ok(m, 'must match the protocol dataURI regex');
  assert.equal(m.mimetype, 'application/json');
  assert.equal(m.base64, undefined);
});

test('the esip6 opt-out is present and parses as a dataURI parameter', () => {
  const m = parse(toDataUri(entry));
  // ESIP-6: String(match[:parameters]).split(';').include?('rule=esip6')
  const params = String(m.parameters).split(';');
  assert.ok(params.includes('rule=esip6'), `parameters were ${m.parameters}`);
  assert.ok(params.includes('charset=utf-8'));
});

test('a 500-character Chinese entry is still a valid dataURI', () => {
  const cn = buildEntry({ ...entry, body: '记'.repeat(500) });
  const m = parse(toDataUri(cn));
  assert.ok(m);
  assert.equal([...m.data].length, [...toDataUri(cn)].length - [...DATA_URI_PREFIX].length);
});

// The protocol's `.` does not match newlines, so a raw newline would
// truncate the captured data. JSON escapes control characters, which is
// why the envelope has to be JSON and not bare text.
test('newlines in a body are escaped, not raw', () => {
  const multi = buildEntry({ ...entry, body: 'line one\nline two' });
  const uri = toDataUri(multi);
  assert.ok(!uri.includes('\n'), 'no raw newline may reach the URI');
  assert.ok(uri.includes('\\n'), 'it must survive as an escape sequence');
  assert.ok(parse(uri));
});

test('content hash is sha256 of the UTF-8 dataURI, as the protocol defines', () => {
  const uri = toDataUri(entry);
  assert.equal(contentHash(uri), sha256(toHex(uri)));
  // toHex of a string is its UTF-8 bytes; assert that explicitly.
  assert.equal(toHex(uri), '0x' + Buffer.from(uri, 'utf8').toString('hex'));
});

test('encode() and toDataUri() produce the same bytes', () => {
  assert.equal(encode(entry).uri, toDataUri(entry));
});
