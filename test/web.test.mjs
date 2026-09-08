// web/abi.js is a classic script the browser loads, so nothing else in the
// test suite would catch a broken reference in it — it parses fine and
// throws only at runtime, leaving window.JJ_ABI undefined and the page
// silently empty. That happened once; this stops it happening again.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEntry, entryTail } from '../src/canonical.mjs';
import { encodeFunctionData, parseAbi } from 'viem';

function loadAbiJs() {
  const sandbox = { window: {}, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/abi.js', import.meta.url), 'utf8'), sandbox);
  return sandbox.window.JJ_ABI;
}

test('abi.js executes and exports everything app.js imports', () => {
  const abi = loadAbiJs();
  assert.ok(abi, 'window.JJ_ABI must be set');
  for (const k of ['SEL', 'TOPIC', 'encodeWriteEntry', 'encodeBalanceOf',
                   'decodeEsip3String', 'padAddr', 'utf8Hex']) {
    assert.ok(abi[k], `missing export: ${k}`);
  }
});

test('config.js executes and exports the fields app.js reads', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../web/config.js', import.meta.url), 'utf8'), sandbox);
  const c = sandbox.window.JJ_CONFIG;
  for (const k of ['CHAIN_ID', 'CHAIN_NAME', 'READ_RPC', 'JOURNAL', 'JUSTICE',
                   'MIN_FEE_WEI', 'MIN_BALANCE', 'BODY_MAX_CHARS', 'MAX_TAGS', 'GENESIS_BLOCK']) {
    assert.ok(c[k] !== undefined, `missing config: ${k}`);
  }
});

// The page hand-rolls its ABI encoding to avoid loading a library. That is
// only safe if it agrees with a real encoder, byte for byte.
test('hand-rolled encoding matches viem for the same entry', () => {
  const abi = loadAbiJs();
  const viemAbi = parseAbi(['function writeEntry(string entryTail) payable']);
  for (const body of ['short', '记'.repeat(500), 'a "quoted" line\nand a newline']) {
    const e = buildEntry({ author: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
                           seq: 3, ts: 1757280000, tags: ['assange'], body });
    const mine = '0x' + abi.encodeWriteEntry(entryTail(e)).replace(/^0x/, '');
    const theirs = encodeFunctionData({ abi: viemAbi, functionName: 'writeEntry', args: [entryTail(e)] });
    assert.equal(mine, theirs, `mismatch for body: ${body.slice(0, 20)}`);
  }
});

test('log topic matches the ESIP-3 event signature', () => {
  const abi = loadAbiJs();
  assert.equal(abi.TOPIC.esip3,
    '0x665fba0baf3dc33e9943340197893ac16f56482c2defb8de60f944987fee451c');
});
