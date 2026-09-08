#!/usr/bin/env node
// Real per-entry gas. forge's gasleft() delta measures execution only; the
// intrinsic calldata cost of an actual transaction is charged separately
// and is what EIP-7623 governs. Quoting either half alone understates the
// entry cost, so combine them here.
//
// EXEC_GAS comes from `forge test -vv` (test_Gas* in JusticeJournal.t.sol).

import { encodeFunctionData, parseAbi, formatEther } from 'viem';
import { buildEntry, encode, estimateGas } from './entry.mjs';

const abi = parseAbi(['function write(string contentURI) payable']);
const AUTHOR = '0x000000000000000000000000000000000000a11c';

// execution-only gas measured by forge, minus the 21,000 base it already excludes
const EXEC = { en: 46_643 - 21_000, zh: 58_483 - 21_000 };

const cases = [
  ['113-char English', 'en', 'March 10, 2024 - I joined my first Julian Assange support rally. Today, I log this date into the Justice Journal.'],
  ['500-char Chinese', 'zh', '记'.repeat(500)],
];

console.log('per-entry cost, contract route (ESIP-3) vs direct calldata (ESIP-1)\n');
const rows = [];
for (const [label, key, body] of cases) {
  const { uri } = encode(buildEntry({ author: AUTHOR, seq: 0, ts: 1757280000, tags: [], body }));

  // Route A: call JusticeJournal.write(string). ABI framing adds a selector,
  // an offset, a length and right-padding on top of the content bytes.
  const callData = encodeFunctionData({ abi, functionName: 'write', args: [uri] });
  const a = estimateGas(callData);
  const contractGas = Math.max(21_000 + 4 * a.tokens + EXEC[key], 21_000 + 10 * a.tokens);

  // Route B: plain transfer carrying the data URI, no contract.
  const b = estimateGas(encode(buildEntry({ author: AUTHOR, seq: 0, ts: 1757280000, tags: [], body })).calldata);

  rows.push({ label, uriBytes: new TextEncoder().encode(uri).length,
              abiBytes: (callData.length - 2) / 2, contractGas, directGas: b.gas });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('entry', 20) + pad('URI bytes', 11) + pad('contract', 11) + pad('direct', 11) + 'contract premium');
for (const r of rows) {
  console.log(pad(r.label, 20) + pad(r.uriBytes, 11) + pad(r.contractGas.toLocaleString(), 11) +
    pad(r.directGas.toLocaleString(), 11) + `+${(r.contractGas - r.directGas).toLocaleString()}`);
}

console.log('\ncost at gas price (gas only; the write fee is on top):\n');
console.log(pad('entry', 20) + [0.5, 1, 3, 5, 10].map((g) => pad(g + ' gwei', 14)).join(''));
for (const r of rows) {
  console.log(pad(r.label, 20) + [0.5, 1, 3, 5, 10]
    .map((g) => pad(formatEther(BigInt(r.contractGas) * BigInt(g * 1e9)).slice(0, 9) + ' Ξ', 14)).join(''));
}

console.log(`
For reference, the original proposal's design — a contract write plus an
SSTORE plus an IPFS hash — lands around 90-110k gas AND carries a recurring
pinning bill. Both routes above beat it outright.`);
