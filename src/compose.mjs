#!/usr/bin/env node
// Builds the transaction for one entry and prints everything needed to
// send it by hand. It does not hold keys, sign, or broadcast — you paste
// the output into your own wallet or `cast send`.
//
//   node src/compose.mjs --author 0x.. --seq 0 --body "..." --tags a,b

import { encodeFunctionData, parseAbi, formatEther } from 'viem';
import { buildEntry, encode, estimateGas, byteLength, codePointLength } from './entry.mjs';
import { entryTail, headFor } from './canonical.mjs';
import { validate } from './rules.mjs';
import { PARAMS } from './config.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const author = arg('author');
const body = arg('body');
if (!author || !body) {
  console.error('usage: compose.mjs --author 0x.. --body "..." [--seq 0] [--tags a,b] [--ts unix]');
  process.exit(1);
}

// The tag has to come from the configured deployment, not the default. A
// rehearsal contract writes a different one, and building against the
// default made every entry fail V5 — the tool refused to compose anything.
const entry = buildEntry({
  author,
  seq: Number(arg('seq', '0')),
  ts: Number(arg('ts', String(Math.floor(Date.now() / 1000)))),
  tags: (arg('tags', '') || '').split(',').filter(Boolean),
  body,
  p: PARAMS.protocol,
});
const { uri } = encode(entry);

// The contract writes the header and the author's address itself; we send
// only what follows. See SPEC.md on why the calldata must not contain a
// dataURI of its own.
const abi = parseAbi(['function writeEntry(string entryTail) payable']);
const calldata = encodeFunctionData({ abi, functionName: 'writeEntry', args: [entryTail(entry)] });
const g = estimateGas(calldata);

// Dry-run every rule that does not need chain state. Cheaper to fail here
// than to burn the fee on an entry the indexer will reject.
const dry = validate(
  { txHash: '0x', blockNumber: PARAMS.genesisBlock, logIndex: 0,
    emitter: PARAMS.journalContracts.at(-1).address, author, contentURI: uri, feeWei: PARAMS.minFeeWei },
  { authorState: { maxSeq: null, recentBlocks: [] }, seenContent: new Set() },
);
const local = dry.failed.filter((r) => r !== 'V1'); // V1 needs the deployed address

console.log(`
body        ${codePointLength(entry.body)} chars / ${byteLength(entry.body)} bytes
data URI    ${byteLength(uri)} bytes (${byteLength(headFor(entry.p)) + 40} of them written by the contract)
calldata    ${(calldata.length - 2) / 2} bytes
fee         ${formatEther(PARAMS.minFeeWei)} ETH
local rules ${local.length ? 'FAILS ' + local.join(',') : 'all pass'}
`);

if (local.length) {
  console.error('Fix the entry before sending — the fee is spent either way.\n');
  process.exit(1);
}

console.log('estimated gas cost (the fee is on top):');
for (const gwei of [0.5, 1, 3, 5, 10]) {
  // The contract's execution rides under the EIP-7623 floor on longer
  // entries, so this is an upper bound built from the floor alone.
  const gas = Math.max(g.floor, g.standard + 28_622);
  console.log(`  ${String(gwei).padStart(5)} gwei   ${formatEther(BigInt(gas) * BigInt(gwei * 1e9)).slice(0, 10)} ETH  (~${gas.toLocaleString()} gas)`);
}

console.log(`
content (the contract assembles this; you send only the tail)
${uri}

send it yourself:
  cast send ${PARAMS.journalContracts.at(-1).address} \\
    --value ${PARAMS.minFeeWei} \\
    --data ${calldata} \\
    --rpc-url https://rpc.flashbots.net/fast

Use a private RPC (Flashbots Protect above). A public mempool exposes these
bytes, and Ethscriptions enforce global content uniqueness — see SPEC.md on
front-running.
`);
