#!/usr/bin/env node
// CLI wrapper around scan(). All logic lives in src/scan.mjs and
// src/rules.mjs; this file only wires up RPC and writes the output.
//
//   node src/indexer.mjs --rpc <archive url> --from <block> [--to latest]
//
// Historical balanceOf needs an archive-capable RPC. A default public node
// serves only ~128 blocks of state, so we fail loudly rather than silently
// mis-evaluating V7.

import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { PARAMS } from './config.mjs';
import { scan } from './scan.mjs';
import { RULES } from './rules.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const rpc = arg('rpc', process.env.ETH_RPC_URL);
if (!rpc) { console.error('need --rpc <archive-capable url> or ETH_RPC_URL'); process.exit(1); }

const client = createPublicClient({ chain: mainnet, transport: http(rpc) });
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

const chain = {
  getBlock: (n) => client.getBlock({ blockNumber: n, includeTransactions: true }),
  getReceipt: (hash) => client.getTransactionReceipt({ hash }),
  balanceOfAt: async (addr, n) => {
    try {
      return await client.readContract({
        address: PARAMS.justiceToken, abi: erc20,
        functionName: 'balanceOf', args: [addr], blockNumber: n,
      });
    } catch {
      console.error(`\nFATAL: historical balanceOf failed at block ${n}.`);
      console.error('This RPC is not archive-capable. V7 cannot be evaluated; refusing to');
      console.error('produce an index that would silently differ from everyone else\'s.');
      process.exit(1);
    }
  },
};

const from = BigInt(arg('from', String(PARAMS.genesisBlock)));
const to = arg('to', 'latest') === 'latest' ? await client.getBlockNumber() : BigInt(arg('to'));

// Optional: canonical Ethscriptions global content hashes, one per line.
const seedPath = arg('seen');
const seenContent = new Set(
  seedPath && existsSync(seedPath)
    ? readFileSync(seedPath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    : [],
);
if (seedPath) console.error(`seeded ${seenContent.size} known content hashes`);
else console.error('WARNING: no --seen file. V12 checks treasury traffic only (SPEC.md §5).');

console.error(`scanning ${from}..${to}`);
const { entries, rejected } = await scan(chain, {
  from, to, seenContent,
  onBlock: (n, count) => { if (n % 500n === 0n) console.error(`  ...${n} (${count} entries)`); },
});

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/index.json', import.meta.url), JSON.stringify({
  protocol: 'justice-journal', version: 1,
  range: { from: Number(from), to: Number(to) },
  params: {
    treasury: PARAMS.treasury, justiceToken: PARAMS.justiceToken,
    minFeeWei: PARAMS.minFeeWei.toString(),
    minJusticeBalance: PARAMS.minJusticeBalance.toString(),
    maxEntriesPerAuthorPerWindow: PARAMS.maxEntriesPerAuthorPerWindow,
    rateLimitWindowBlocks: PARAMS.rateLimitWindowBlocks,
    bodyMaxChars: PARAMS.bodyMaxChars,
  },
  entries, rejected,
}, null, 2));

console.error(`\naccepted ${entries.length}, rejected ${rejected.length}`);
for (const r of rejected) {
  console.error(`  ${r.hash} — ${r.failed.map((f) => `${f}: ${RULES[f]}`).join('; ')}`);
}
console.error('wrote out/index.json');
