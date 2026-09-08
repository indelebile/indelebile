#!/usr/bin/env node
// Cross-check a mainnet entry against the canonical Ethscriptions indexer.
//
// Everything else in this repository verifies our own rules against our own
// implementation. This checks the two things only the protocol itself can
// answer, and which no testnet can: that the author — not the contract —
// is the ethscription's initial owner, and that rule=esip6 took effect.
//
// Those two properties are the reason the architecture looks the way it
// does. If either is wrong, nothing else matters.
//
//   node scripts/verify-mainnet.mjs --tx 0x…

import { PARAMS } from '../src/config.mjs';
import { decode } from '../src/entry.mjs';

const argv = process.argv.slice(2);
const tx = argv[argv.indexOf('--tx') + 1];
if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
  console.error('usage: verify-mainnet.mjs --tx 0x<64 hex>');
  process.exit(1);
}

const res = await fetch(`https://api.ethscriptions.com/v2/ethscriptions/${tx}`);
if (!res.ok) {
  console.error(`the canonical indexer does not know ${tx} (HTTP ${res.status}).`);
  console.error('It may not have caught up yet; wait a minute and retry. If it');
  console.error('persists, the ethscription was never created — check that the');
  console.error('content was not already inscribed by someone else.');
  process.exit(1);
}
const body = await res.json();
const e = body.result ?? body;

const decoded = decode('0x' + Buffer.from(e.content_uri, 'utf8').toString('hex'));
const author = decoded.ok ? decoded.entry.author?.toLowerCase() : null;

const checks = [
  ['initial owner is the author, not the contract',
    e.initial_owner?.toLowerCase() === author,
    `initial_owner=${e.initial_owner}, author in body=${author}`],
  ['initial owner is not the Journal contract',
    e.initial_owner?.toLowerCase() !== PARAMS.journalContract.toLowerCase(),
    `journalContract=${PARAMS.journalContract}`],
  ['rule=esip6 took effect', e.esip6 === true, `esip6=${e.esip6}`],
  ['created by our contract', e.creator?.toLowerCase() === PARAMS.journalContract.toLowerCase(),
    `creator=${e.creator}`],
  ['content decodes as a canonical entry', decoded.ok, decoded.reason ?? ''],
  ['recognised as an event creation, not calldata', e.event_log_index !== null,
    `event_log_index=${e.event_log_index}`],
];

console.log(`\nethscription #${e.ethscription_number}  block ${e.block_number}\n`);
let failed = 0;
for (const [what, ok, detail] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) { console.log(`        ${detail}`); failed++; }
}

console.log(failed
  ? `\n${failed} check(s) failed. Do not write another entry until this is understood.\n`
  : '\nAll checks passed. The protocol agrees with the design.\n');
process.exit(failed ? 1 : 0);
