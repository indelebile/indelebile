#!/usr/bin/env node
// Builds the calldata for one entry and prints everything needed to send
// it by hand. It does not hold keys, sign, or broadcast — you paste the
// output into your own wallet or `cast send`.
//
//   node src/compose.mjs --author 0x.. --seq 0 --body "..." --tags a,b

import { buildEntry, encode, estimateGas, byteLength, codePointLength } from './entry.mjs';
import { validate } from './rules.mjs';
import { PARAMS } from './config.mjs';
import { formatEther } from 'viem';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  return i === -1 ? d : argv[i + 1];
};

const author = arg('author');
const body = arg('body');
if (!author || !body) {
  console.error('usage: compose.mjs --author 0x.. --body "..." [--seq 0] [--tags a,b] [--ts unix]');
  process.exit(1);
}

const entry = buildEntry({
  author,
  seq: Number(arg('seq', '0')),
  ts: Number(arg('ts', String(Math.floor(Date.now() / 1000)))),
  tags: (arg('tags', '') || '').split(',').filter(Boolean),
  body,
});

const { uri, calldata } = encode(entry);
const gas = estimateGas(calldata);

// Dry-run the entry against every rule we can check without the chain.
const dry = validate(
  { hash: '0x', blockNumber: PARAMS.genesisBlock, txIndex: 0, from: author,
    to: PARAMS.treasury, value: PARAMS.minFeeWei, input: calldata, status: 'success' },
  { justiceBalance: PARAMS.minJusticeBalance, authorState: { maxSeq: null, recentBlocks: [] },
    seenContent: new Set() },
);
const offchain = dry.failed.filter((r) => !['V1', 'V7'].includes(r)); // need chain state

console.log(`
body        ${codePointLength(entry.body)} chars / ${byteLength(entry.body)} bytes
data URI    ${byteLength(uri)} bytes
gas         ${gas.gas.toLocaleString()}  (floor ${gas.floor.toLocaleString()}, standard ${gas.standard.toLocaleString()})
fee         ${formatEther(PARAMS.minFeeWei)} ETH
offchain    ${offchain.length ? 'FAILS ' + offchain.join(',') : 'all local rules pass'}

cost at each gas price (gas only, excludes the ${formatEther(PARAMS.minFeeWei)} ETH fee):`);
for (const gwei of [0.5, 1, 3, 5, 10, 20]) {
  const eth = (BigInt(gas.gas) * BigInt(Math.round(gwei * 1e9))).toString();
  console.log(`  ${String(gwei).padStart(5)} gwei   ${formatEther(BigInt(eth)).slice(0, 10)} ETH`);
}

console.log(`
content
${uri}

calldata (paste into the wallet's hex data field)
${calldata}

or send it yourself:
  cast send ${PARAMS.treasury} \\
    --value ${PARAMS.minFeeWei} \\
    --data ${calldata} \\
    --rpc-url https://rpc.flashbots.net/fast

Use a private RPC (Flashbots Protect above) — see SPEC.md §5 on
front-running. A public mempool exposes these bytes before inclusion.
`);
