#!/usr/bin/env node
// Real per-entry gas. forge's gasleft() delta measures execution only; the
// intrinsic calldata cost of an actual transaction is charged separately
// and is what EIP-7623 governs. Quoting either half alone understates the
// entry cost, so combine them here.
//
// EXEC_GAS comes from `forge test -vv` (test_Gas* in JusticeJournal.t.sol).

import { encodeFunctionData, parseAbi, formatEther } from 'viem';
import { buildEntry, encode, estimateGas } from './entry.mjs';
import { entryTail } from './canonical.mjs';

const abi = parseAbi(['function writeEntry(string entryTail) payable']);
const AUTHOR = '0x000000000000000000000000000000000000a11c';

// Execution-only gas from `forge test -vv` (test_Gas* in JusticeJournal.t.sol),
// optimizer on, minus the 21,000 base those numbers already fold in.
const EXEC = { en: 49_622 - 21_000, zh: 61_539 - 21_000 };
// The same measurements for the pre-D-5 design, where the caller sent the
// finished URI and the contract only checked its prefix (GasProbe.t.sol).
const EXEC_OLD = { en: 28_622 - 3_690, zh: 40_539 - 3_690 };

const cases = [
  ['113-char English', 'en', 'March 10, 2024 - I joined my first Julian Assange support rally. Today, I log this date into the Justice Journal.'],
  ['500-char Chinese', 'zh', '记'.repeat(500)],
];

console.log('per-entry cost. EIP-7623 charges max(standard, floor). Which path\n' +
            'binds depends on how much execution there is; both are shown below.\n');
const rows = [];
for (const [label, key, body] of cases) {
  const entry = buildEntry({ author: AUTHOR, seq: 0, ts: 1757280000, tags: [], body });
  const { uri } = encode(entry);

  // After D-5: the caller sends only the tail; the contract writes the head.
  const tailData = encodeFunctionData({ abi, functionName: 'writeEntry', args: [entryTail(entry)] });
  const t = estimateGas(tailData);
  const now = Math.max(21_000 + 4 * t.tokens + EXEC[key], 21_000 + 10 * t.tokens);

  // Before D-5: the caller sent the finished URI.
  const uriData = encodeFunctionData({ abi, functionName: 'writeEntry', args: [uri] });
  const u = estimateGas(uriData);
  const before = Math.max(21_000 + 4 * u.tokens + EXEC_OLD[key], 21_000 + 10 * u.tokens);

  rows.push({ label, uriBytes: new TextEncoder().encode(uri).length,
              tailBytes: (tailData.length - 2) / 2, now, before,
              floor: 21_000 + 10 * t.tokens, standard: 21_000 + 4 * t.tokens + EXEC[key] });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('entry', 20) + pad('calldata', 11) + pad('before D-5', 13) + pad('after D-5', 12) + 'change');
for (const r of rows) {
  const d = r.now - r.before;
  console.log(pad(r.label, 20) + pad(r.tailBytes + ' B', 11) + pad(r.before.toLocaleString(), 13) +
    pad(r.now.toLocaleString(), 12) + (d > 0 ? '+' : '') + d.toLocaleString());
}
console.log('\nwhich pricing path binds, after D-5:');
for (const r of rows) {
  console.log(`  ${pad(r.label, 20)} floor ${r.floor.toLocaleString()} vs standard ${r.standard.toLocaleString()} -> ${r.floor > r.standard ? 'floor' : 'standard'}`);
}

console.log('\ncost at gas price (gas only; the write fee is on top):\n');
console.log(pad('entry', 20) + [0.5, 1, 3, 5, 10].map((g) => pad(g + ' gwei', 14)).join(''));
for (const r of rows) {
  console.log(pad(r.label, 20) + [0.5, 1, 3, 5, 10]
    .map((g) => pad(formatEther(BigInt(r.now) * BigInt(g * 1e9)).slice(0, 9) + ' Ξ', 14)).join(''));
}

console.log(`
For reference, the original proposal's design — a contract write plus an
SSTORE plus an IPFS hash — lands around 90-110k gas AND carries a recurring
pinning bill. Both routes above beat it outright.`);
