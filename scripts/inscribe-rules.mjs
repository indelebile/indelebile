#!/usr/bin/env node
// Inscribe the archive's reading rules as an ethscription, so the
// instructions for rebuilding the archive are as permanent as the archive.
//
// Today those rules live only in this repository. The entries themselves
// are self-describing, but knowing *which contract address is canonical*
// requires our documentation — an archive meant to outlive us should not
// depend on a GitHub repository staying up.
//
// This is a plain ethscription, not a Journal entry: it is written
// directly as calldata rather than through the contract, so it carries no
// fee and no holding gate. Prints a transaction to send yourself.
//
//   node scripts/inscribe-rules.mjs [--to 0x..]

import { readFileSync } from 'node:fs';
import { stringToHex, formatEther } from 'viem';
import { PARAMS } from '../src/config.mjs';
import { estimateGas } from '../src/entry.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const text = readFileSync(new URL('../docs/READING-RULES.txt', import.meta.url), 'utf8')
  .trimEnd()
  .replaceAll('CONTRACT_ADDR', PARAMS.journalContract)
  .replaceAll('GENESIS', String(PARAMS.genesisBlock))
  .replaceAll('MINFEE', PARAMS.minFeeWei.toString());

for (const placeholder of ['CONTRACT_ADDR', 'GENESIS', 'MINFEE']) {
  if (text.includes(placeholder)) { console.error(`${placeholder} was not substituted`); process.exit(1); }
}

const uri = `data:text/plain;charset=utf-8,${text}`;
const calldata = stringToHex(uri);
const g = estimateGas(calldata);
// The owner. Defaults to the treasury: the rules belong to the DAO, not to
// whoever happened to send the transaction.
const to = arg('to', PARAMS.treasury);

console.log(`
${uri}

—
${new TextEncoder().encode(uri).length} bytes · ${g.gas.toLocaleString()} gas`);
for (const gwei of [1, 3, 5]) {
  console.log(`  @${gwei} gwei  ${formatEther(BigInt(g.gas) * BigInt(gwei * 1e9)).slice(0, 10)} ETH`);
}
console.log(`
send it yourself — recipient becomes the owner:

  cast send ${to} \\
    --data ${calldata} \\
    --rpc-url <rpc>
`);
