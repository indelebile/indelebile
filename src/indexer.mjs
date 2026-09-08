#!/usr/bin/env node
// CLI wrapper around scan(). All logic lives in src/scan.mjs and
// src/rules.mjs; this file only wires up RPC and writes the output.
//
//   node src/indexer.mjs --rpc <url> [--from <block>] [--to latest] [--seen file]
//
// An ordinary RPC is enough. The holding gate moved into the contract, so
// nothing here reads historical state.

import { createPublicClient, http, parseAbiItem } from 'viem';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { PARAMS } from './config.mjs';
import { scan } from './scan.mjs';
import { RULES } from './rules.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const rpc = arg('rpc', process.env.ETH_RPC_URL);
if (!rpc) { console.error('need --rpc <url> or ETH_RPC_URL'); process.exit(1); }
if (!PARAMS.journalContracts?.length || PARAMS.journalContracts.some((c) => /^0x0+$/.test(c.address))) {
  console.error('set journalContracts in src/config.mjs to the deployed address(es) first');
  process.exit(1);
}

// No `chain`: the indexer must work against mainnet, Sepolia or a local
// node without a flag. getLogs and getBlockNumber need no chain metadata.
const client = createPublicClient({ transport: http(rpc) });

const ESIP2 = parseAbiItem(
  'event ethscriptions_protocol_CreateEthscription(address indexed initialOwner, string contentURI)');
const WRITTEN = parseAbiItem(
  'event EntryWritten(address indexed author, bytes32 indexed contentHash, uint256 fee)');

// Both events are emitted by the same call, so they pair by transaction.
// EntryWritten carries the fee; the ESIP-3 log carries the content.
// Every canonical deployment is queried over its own active range, and the
// results are merged. A contract that has been superseded is still read for
// the blocks in which it was current.
const chain = {
  async getWrites(from, to) {
    const CHUNK = 9_000n; // stay under common getLogs range caps
    const out = [];
    for (const c of PARAMS.journalContracts) {
      const lo0 = BigInt(Math.max(Number(from), c.fromBlock));
      const hi0 = c.toBlock == null ? to : BigInt(Math.min(Number(to), c.toBlock));
      if (lo0 > hi0) continue;
      console.error(`  contract ${c.address}${c.note ? ' — ' + c.note : ''}`);
      await scanRange(c.address, lo0, hi0, out, CHUNK);
    }
    return out;
  },
};

async function scanRange(address, from, to, out, CHUNK) {
    for (let lo = from; lo <= to; lo += CHUNK) {
      const hi = lo + CHUNK - 1n > to ? to : lo + CHUNK - 1n;
      const [esip2, written] = await Promise.all([
        client.getLogs({ address, event: ESIP2, fromBlock: lo, toBlock: hi }),
        client.getLogs({ address, event: WRITTEN, fromBlock: lo, toBlock: hi }),
      ]);
      const feeByTx = new Map(written.map((l) => [l.transactionHash, l.args.fee]));
      for (const l of esip2) {
        out.push({
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
          emitter: l.address,
          author: l.args.initialOwner,
          contentURI: l.args.contentURI,
          feeWei: feeByTx.get(l.transactionHash) ?? 0n,
        });
      }
      console.error(`    blocks ${lo}-${hi}: ${esip2.length} writes`);
    }
}

const from = BigInt(arg('from', String(PARAMS.genesisBlock)));
const to = arg('to', 'latest') === 'latest' ? await client.getBlockNumber() : BigInt(arg('to'));

// Entries carry `rule=esip6`, so the protocol's global uniqueness rule does
// not apply to them and there is nothing to seed from a canonical index.
// V12 now only guards against a duplicate inside our own set, which V6 and
// V8 already make unreachable. --seen is kept for auditing.
const seedPath = arg('seen');
const seenContent = new Set(
  seedPath && existsSync(seedPath)
    ? readFileSync(seedPath, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)
    : [],
);
if (seedPath) console.error(`seeded ${seenContent.size} content hashes`);

console.error(`scanning ${from}..${to}`);
const { entries, rejected } = await scan(chain, { from, to, seenContent });

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/index.json', import.meta.url), JSON.stringify({
  protocol: 'justice-journal', version: 1,
  range: { from: Number(from), to: Number(to) },
  params: {
    journalContracts: PARAMS.journalContracts, treasury: PARAMS.treasury,
    justiceToken: PARAMS.justiceToken,
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
  console.error(`  ${r.txHash} — ${r.failed.map((f) => `${f}: ${RULES[f]}`).join('; ')}`);
}
console.error('wrote out/index.json');
