// Prints a review queue. Writes nothing, hides nothing.
//
//   node scripts/flag.mjs            # human-readable queue
//   node scripts/flag.mjs --json     # same, for a reviewer's tooling
//
// A term list decides what a person looks at. It never decides what a
// reader sees: that is MODERATION.md's job, and it is done by people who
// sign their name to it. See MODERATION.md §5 for why this is not a
// filter and should not become one.
//
// Most of the signal here is structural rather than lexical. Someone who
// pays to inscribe something harmful is deliberate, and deliberate
// content defeats word lists — but a key, an address, a phone number or
// an encoded payload has a shape, and shape is harder to disguise than
// vocabulary.

import { readFileSync, existsSync } from 'node:fs';

const TERMS = new URL('../moderation/terms.txt', import.meta.url);
const INDEX = new URL('../out/index.json', import.meta.url);

// Spacing, zero-width characters and punctuation between letters are the
// cheapest way past a term list, so terms are matched against a squashed
// copy of the body as well as the body itself.
const squash = (s) => s.toLowerCase().replace(/[\s​-‏._*\-|/\\]+/g, '');

export const SHAPES = [
  ['link', /\bhttps?:\/\/\S+|\b(?:t\.me|bit\.ly|tinyurl\.com)\/\S+/i, 'an off-chain link — whatever it points at can change after review'],
  ['ipfs', /\b(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,})\b/, 'an IPFS identifier, which may address material not in this archive'],
  ['seed phrase', /\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/i, 'a long run of short words, the shape of a recovery phrase (G-3)'],
  ['private key', /\b(?:0x)?[0-9a-f]{64}\b/i, 'a 64-character hex string, the shape of a private key (G-3)'],
  ['address', /\b0x[0-9a-fA-F]{40}\b/, 'an Ethereum address other than the author’s own'],
  ['email', /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, 'an email address (G-2 if it belongs to a private individual)'],
  ['phone', /(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\d/, 'a long digit run, the shape of a phone or identity number (G-2)'],
  ['encoded blob', /[A-Za-z0-9+/]{120,}={0,2}/, 'a long encoded run — unreadable to a reviewer, so it has to be decoded before judging'],
];

export function readTerms() {
  if (!existsSync(TERMS)) return [];
  return readFileSync(TERMS, 'utf8').split('\n')
    .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean);
}

/// Pure, so the rules can be tested without a file or a chain.
export function flag(entry, terms = []) {
  const body = String(entry.body ?? '');
  const flat = squash(body);
  const hits = [];

  for (const t of terms) {
    if (body.toLowerCase().includes(t) || flat.includes(squash(t))) {
      hits.push({ kind: 'term', match: t, why: 'listed term — look, then decide' });
    }
  }
  for (const [kind, re, why] of SHAPES) {
    const m = body.match(re);
    if (!m) continue;
    // The author's own address in their own entry is not a finding.
    if (kind === 'address' && m[0].toLowerCase() === String(entry.author ?? '').toLowerCase()) continue;
    hits.push({ kind, match: m[0].slice(0, 40), why });
  }
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(INDEX)) {
    console.error('no out/index.json: run the indexer first');
    process.exit(1);
  }
  const terms = readTerms();
  const { entries = [] } = JSON.parse(readFileSync(INDEX, 'utf8'));
  const queue = entries
    .map((e) => ({ entry: e, hits: flag(e, terms) }))
    .filter((r) => r.hits.length);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(queue.map(({ entry, hits }) => ({ id: entry.id, author: entry.author, hits })), null, 2));
  } else {
    console.log(`${entries.length} entries, ${terms.length} listed terms, ${queue.length} for review.`);
    console.log('Nothing has been hidden. This tool cannot hide anything — see MODERATION.md §5.\n');
    for (const { entry, hits } of queue) {
      console.log(`${entry.id}  by ${entry.author}  entry #${entry.seq}`);
      for (const h of hits) console.log(`    ${h.kind}: ${JSON.stringify(h.match)} — ${h.why}`);
      console.log(`    ${entry.body.slice(0, 120).replace(/\s+/g, ' ')}…\n`);
    }
    if (queue.length) console.log('A reviewer reads each of these. A collapse needs a ground in MODERATION.md §2 and the process in §3.');
  }
}
