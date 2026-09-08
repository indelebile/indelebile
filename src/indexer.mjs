#!/usr/bin/env node
// CLI wrapper around scan(). All logic lives in src/scan.mjs and
// src/rules.mjs; this file only wires up RPC and writes the output.
//
//   node src/indexer.mjs --rpc <url> [--from <block>] [--to latest] [--seen file]
//   node src/indexer.mjs --rpc <url> --watch [seconds]
//
// Watch mode keeps the archive current without re-reading the chain from
// genesis every time. Only the *fetch* is incremental: the accumulated
// writes are re-derived in full on every tick, because scan() is a pure
// function of that list, so a watched build and a from-scratch build cannot
// disagree. Getting that backwards — carrying derived state forward — is
// how an incremental indexer drifts from the rules it claims to implement.
//
// An ordinary RPC is enough. The holding gate moved into the contract, so
// nothing here reads historical state.

import { createPublicClient, http, fallback, parseAbiItem, sha256, toHex } from 'viem';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { PARAMS } from './config.mjs';
import { scan } from './scan.mjs';
import { RULES } from './rules.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

// Comma-separated, tried in order. Rebuilding the archive needs historical
// eth_getLogs, and most free public nodes now refuse it — one demands a
// token, another caps the range at ten blocks — so a single endpoint is a
// single point of failure for the one property that matters.
const rpcs = (arg('rpc', process.env.ETH_RPC_URL) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!rpcs.length) { console.error('need --rpc <url[,url...]> or ETH_RPC_URL'); process.exit(1); }
if (!PARAMS.journalContracts?.length || PARAMS.journalContracts.some((c) => /^0x0+$/.test(c.address))) {
  console.error('set journalContracts in src/config.mjs to the deployed address(es) first');
  process.exit(1);
}

// No `chain`: the indexer must work against mainnet, Sepolia or a local
// node without a flag. getLogs and getBlockNumber need no chain metadata.
// viem's fallback transport moves on when an endpoint errors, and ranks
// them by responsiveness after that.
const client = createPublicClient({ transport: fallback(rpcs.map((u) => http(u)), { rank: false }) });

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

const OUT = new URL('../out/index.json', import.meta.url);
mkdirSync(new URL('../out/', import.meta.url), { recursive: true });

// Entries within this many blocks of the head are not published. A reorg
// that drops one would otherwise take it out of an archive that had already
// shown it, and "permanent" should mean it.
const CONFIRMATIONS = Number(arg('confirmations', '5'));

function publish(entries, rejected, builtAtBlock, scannedFrom) {
  // The hash of the entries alone — not the range, which moves with the
  // head. A reader who re-derives the archive compares this one number
  // instead of diffing files, which is what the rules being reproducible
  // is for.
  const entriesHash = sha256(toHex(JSON.stringify(entries)));
  const body = JSON.stringify({
    protocol: PARAMS.protocol, version: 1,
    builtAtBlock, entriesHash,
    range: { from: scannedFrom, to: builtAtBlock },
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
  }, null, 2);
  writeFileSync(OUT, body);
  return entriesHash;
}

const watching = argv.includes('--watch');
const every = Number(arg('watch', '30')) || 30;

if (!watching) {
  console.error(`scanning ${from}..${to}`);
  const { entries, rejected } = await scan(chain, { from, to, seenContent });
  const h = publish(entries, rejected, Number(to), Number(from));
  console.error(`\naccepted ${entries.length}, rejected ${rejected.length}`);
  console.error(`entries sha256 ${h}`);
  for (const r of rejected) {
    console.error(`  ${r.txHash} — ${r.failed.map((f) => `${f}: ${RULES[f]}`).join('; ')}`);
  }
  console.error('wrote out/index.json');
} else {
  console.error(`watching from ${from}, polling every ${every}s, ${CONFIRMATIONS} confirmations`);
  const writes = [];
  const seenLog = new Set();
  let cursor = from;
  let lastHash = null;

  for (;;) {
    try {
      const head = await client.getBlockNumber();
      const safe = head - BigInt(CONFIRMATIONS);
      if (safe >= cursor) {
        for (const w of await chain.getWrites(cursor, safe)) {
          const key = `${w.txHash}:${w.logIndex}`;
          if (seenLog.has(key)) continue;
          seenLog.add(key);
          writes.push(w);
        }
        cursor = safe + 1n;
      }

      // Always derive from the whole accumulated list, never incrementally.
      const { entries, rejected } = await scan(
        { getWrites: async () => writes },
        { from, to: safe, seenContent: new Set(seenContent) },
      );
      const h = sha256(toHex(JSON.stringify(entries)));
      if (h !== lastHash) {
        publish(entries, rejected, Number(safe), Number(from));
        console.error(`[${new Date().toISOString().slice(11, 19)}] block ${safe} · ` +
                      `${entries.length} entries, ${rejected.length} rejected · ${h.slice(0, 18)}…`);
        lastHash = h;
      }
    } catch (e) {
      console.error(`[${new Date().toISOString().slice(11, 19)}] ${e.shortMessage ?? e.message}`);
    }
    await new Promise((r) => setTimeout(r, every * 1000));
  }
}
