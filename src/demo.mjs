#!/usr/bin/env node
// Builds a synthetic index from sample entries so the viewer and the gas
// table can be demonstrated before any real transaction exists. The output
// is clearly synthetic: hashes are sequential, not real.
//
//   node src/demo.mjs && node src/render.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { buildEntry, encode, estimateGas } from './entry.mjs';
import { scan } from './scan.mjs';
import { PARAMS } from './config.mjs';

const TREASURY = '0x2222222222222222222222222222222222222222';
const P = { ...PARAMS, treasury: TREASURY, genesisBlock: 21_000_000 };

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

const blocks = {};
SAMPLES.forEach(([author, tags, body], i) => {
  const seq = SAMPLES.slice(0, i).filter(([a]) => a === author).length;
  const { calldata } = encode(buildEntry({
    author, seq, ts: 1757280000 + i * 86400 * 3, tags, body,
  }));
  blocks[P.genesisBlock + i * 7] = [{
    hash: '0x' + (i + 1).toString(16).padStart(64, '0'),
    from: author, to: TREASURY, value: P.minFeeWei,
    input: calldata, transactionIndex: 0,
  }];
});

const chain = {
  getBlock: async (n) => ({ transactions: blocks[Number(n)] ?? [] }),
  getReceipt: async () => ({ status: 'success' }),
  balanceOfAt: async () => P.minJusticeBalance,
};

const from = P.genesisBlock;
const to = P.genesisBlock + (SAMPLES.length - 1) * 7;
const { entries, rejected } = await scan(chain, { from, to, params: P });

mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
writeFileSync(new URL('../out/index.json', import.meta.url), JSON.stringify({
  protocol: 'justice-journal', version: 1, synthetic: true,
  range: { from, to },
  params: { treasury: TREASURY, minFeeWei: P.minFeeWei.toString(),
            minJusticeBalance: P.minJusticeBalance.toString(),
            bodyMaxChars: P.bodyMaxChars },
  entries, rejected,
}, null, 2));

console.log(`synthetic index: ${entries.length} entries\n`);
console.log('per-entry gas (EIP-7623 floor):');
for (const e of entries) {
  const g = estimateGas(encode(buildEntry(e)).calldata);
  const cn = /[一-鿿]/.test(e.body) ? ' [zh]' : '';
  console.log(`  ${String([...e.body].length).padStart(3)} chars${cn.padEnd(5)} ${String(g.gas).padStart(7)} gas   @5gwei ${(g.gas * 5e-9).toFixed(6)} ETH`);
}
