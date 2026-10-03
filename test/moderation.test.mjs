import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { flag, SHAPES } from '../scripts/flag.mjs';

// The whole value of the flagging tool is that it cannot do the thing a
// filter would do. If it ever gains the ability to write, the claim in
// MODERATION.md §5 stops being true.
test('the flagging tool cannot hide anything', () => {
  const src = readFileSync(new URL('../scripts/flag.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['writeFileSync', 'appendFileSync', 'unlinkSync', 'rmSync', 'fetch(']) {
    assert.ok(!src.includes(forbidden), `flag.mjs must not use ${forbidden}`);
  }
});

// Someone who pays to inscribe harm is deliberate, so the shapes matter
// more than the vocabulary: a key, an address or a link cannot be
// disguised as easily as a word.
test('structural signals are caught', () => {
  const cases = [
    ['a key 0x' + 'a'.repeat(64), 'private key'],
    ['mail me at someone@example.com', 'email'],
    ['see https://t.me/whatever', 'link'],
    ['Qm' + 'a'.repeat(44), 'ipfs'],
    ['call +1 415 555 0132 now', 'phone'],
  ];
  for (const [body, kind] of cases) {
    const hits = flag({ body, author: '0x' + '1'.repeat(40) });
    assert.ok(hits.some((h) => h.kind === kind), `${kind} not caught in: ${body}`);
  }
});

// An author quoting their own address is not a finding, and a queue full
// of those is a queue nobody reads.
test('the author’s own address is not a finding', () => {
  const author = '0x' + 'ab'.repeat(20);
  const hits = flag({ body: `written from ${author}`, author });
  assert.equal(hits.filter((h) => h.kind === 'address').length, 0);
});

// Spacing and punctuation are the cheapest way past a term list.
test('terms match through spacing and punctuation', () => {
  for (const body of ['b a d w o r d here', 'b.a.d-w_o_r_d here', 'BADWORD here']) {
    assert.ok(flag({ body }, ['badword']).some((h) => h.kind === 'term'), body);
  }
});

// A term list that fires on ordinary testimony buries the queue, and this
// archive exists to carry exactly that testimony.
test('ordinary testimony about violence is not flagged', () => {
  const body = 'I watched the airstrike. Three children died in the car. '
    + 'I was raped in that prison and nobody wrote it down.';
  assert.deepEqual(flag({ body, author: '0x' + '1'.repeat(40) }), []);
});

// The entries actually in the archive should not be sitting in a review
// queue because of a rule that is too eager.
test('the live archive produces no findings', (t) => {
  // A generated file: present after the indexer has run, absent in a
  // fresh clone. Skipping says so rather than failing for a reason that
  // has nothing to do with the rules.
  const out = new URL('../out/index.json', import.meta.url);
  if (!existsSync(out)) return t.skip('no out/index.json — run the indexer first');
  const { entries = [] } = JSON.parse(readFileSync(out, 'utf8'));
  for (const e of entries) {
    assert.deepEqual(flag(e), [], `entry ${e.id} was flagged by a default rule`);
  }
});

// Each shape has to explain itself: the queue is read by a person who has
// to decide, and "matched a regex" is not a reason to decide anything.
test('every shape states a ground or a reason', () => {
  for (const [kind, re, why] of SHAPES) {
    assert.ok(kind && re instanceof RegExp, 'a shape needs a name and a pattern');
    assert.ok(why && why.length > 20, `${kind} must say why it matters`);
  }
});
