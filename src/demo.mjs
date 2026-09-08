#!/usr/bin/env node
// Builds a synthetic index from sample entries so the viewer and the gas
// table can be demonstrated before any real transaction exists. The output
// is clearly synthetic: hashes are sequential, not real.
//
//   node src/demo.mjs && node src/render.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { buildEntry, encode, estimateGas } from './entry.mjs';
import { PROTOCOL } from './canonical.mjs';
import { encodeFunctionData, parseAbi } from 'viem';
import { scan } from './scan.mjs';
import { PARAMS } from './config.mjs';

const JOURNAL = '0x1000000000000000000000000000000000000001';
const P = { ...PARAMS, journalContracts: [{ address: JOURNAL, fromBlock: 0, toBlock: null }], genesisBlock: 21_000_000, protocol: PROTOCOL };

const SAMPLES = [
  ['0xa11ce00000000000000000000000000000000001', ['iran', 'letters'],
   'My name is C. In 2023, I wrote an anonymous letter in Iran for freedom. Today, I record it into block 1821. I believe freedom is not a moment of passion, but a lifetime of memory.'],
  ['0xb0b0000000000000000000000000000000000002', ['rally', 'assange'],
   'March 10, 2024 — I joined my first Julian Assange support rally. Today, I log this date into the Justice Journal.'],
  ['0xc0de000000000000000000000000000000000003', ['wikileaks'],
   '我第一次读到 Collateral Murder 是在大学图书馆的电脑上。那天之后我再也无法把"官方说法"和"发生过的事"当成同一件东西。今天我把这个日期写进链上。'],
  ['0xa11ce00000000000000000000000000000000001', ['press-freedom'],
   'Second entry. The first one cost me less than a dollar in gas. That is what it costs to put a sentence somewhere no one can quietly delete it.'],
];

const writes = SAMPLES.map(([author, tags, body], i) => {
  const seq = SAMPLES.slice(0, i).filter(([a]) => a === author).length;
  const { uri } = encode(buildEntry({ author, seq, ts: 1757280000 + i * 86400 * 3, tags, body }));
  return {
    txHash: '0x' + (i + 1).toString(16).padStart(64, '0'),
    blockNumber: BigInt(P.genesisBlock + i * 7), logIndex: 0,
    emitter: JOURNAL, author, contentURI: uri, feeWei: P.minFeeWei,
  };
});

const chain = { getWrites: async () => writes };

const from = P.genesisBlock;
const to = P.genesisBlock + (SAMPLES.length - 1) * 7;
const { entries, rejected } = await scan(chain, { from, to, params: P });

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/index.json', import.meta.url), JSON.stringify({
  protocol: 'justice-journal', version: 1, synthetic: true,
  range: { from, to },
  params: { journalContracts: P.journalContracts, minFeeWei: P.minFeeWei.toString(),
            minJusticeBalance: P.minJusticeBalance.toString(),
            bodyMaxChars: P.bodyMaxChars },
  entries, rejected,
}, null, 2));

console.log(`synthetic index: ${entries.length} entries\n`);
const abi = parseAbi(['function write(string contentURI) payable']);
console.log('per-entry gas, contract route (write(string), EIP-7623 floor):');
for (const e of entries) {
  const uri = encode(buildEntry(e)).uri;
  const g = estimateGas(encodeFunctionData({ abi, functionName: 'write', args: [uri] }));
  const gas = Math.max(g.floor, g.standard + 26_000); // + measured execution
  const cn = /[一-鿿]/.test(e.body) ? ' [zh]' : '';
  console.log(`  ${String([...e.body].length).padStart(3)} chars${cn.padEnd(5)} ${String(gas).padStart(7)} gas   @5gwei ${(gas * 5e-9).toFixed(6)} ETH`);
}
