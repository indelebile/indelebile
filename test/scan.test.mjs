import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan } from '../src/scan.mjs';
import { buildEntry, encode } from '../src/entry.mjs';
import { PARAMS } from '../src/config.mjs';

const A = '0xaaaa000000000000000000000000000000000001';
const B = '0xbbbb000000000000000000000000000000000002';
const TREASURY = '0x2222222222222222222222222222222222222222';
const OTHER = '0x3333333333333333333333333333333333333333';
const P = { ...PARAMS, treasury: TREASURY, genesisBlock: 1000 };

// A fake chain: blocks[n] = [tx, ...]. Balances are per-address constants.
function fakeChain(blocks, balances, failedHashes = new Set()) {
  return {
    getBlock: async (n) => ({ transactions: blocks[Number(n)] ?? [] }),
    getReceipt: async (h) => ({ status: failedHashes.has(h) ? 'reverted' : 'success' }),
    balanceOfAt: async (addr) => balances[addr.toLowerCase()] ?? 0n,
  };
}
let nonce = 0;
function mkTx(author, seq, body, over = {}) {
  const { calldata } = encode(buildEntry({ author, seq, ts: 1757280000, tags: [], body }));
  return { hash: '0x' + String(++nonce).padStart(64, '0'), from: author, to: TREASURY,
           value: P.minFeeWei, input: calldata, transactionIndex: 0, ...over };
}

test('accepts valid entries and ignores unrelated traffic', async () => {
  const t1 = mkTx(A, 0, 'first');
  const noise = { hash: '0xnoise', from: B, to: OTHER, value: 0n, input: '0x', transactionIndex: 1 };
  const chain = fakeChain({ 1000: [t1, noise] }, { [A]: P.minJusticeBalance });
  const r = await scan(chain, { from: 1000, to: 1000, params: P });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].id, t1.hash);
  assert.equal(r.rejected.length, 0);
});

test('rejects a reverted transaction', async () => {
  const t = mkTx(A, 0, 'reverted');
  const chain = fakeChain({ 1000: [t] }, { [A]: P.minJusticeBalance }, new Set([t.hash]));
  const r = await scan(chain, { from: 1000, to: 1000, params: P });
  assert.deepEqual(r.rejected[0].failed, ['V3']);
});

test('author state carries across blocks: seq must keep rising', async () => {
  const chain = fakeChain(
    { 1000: [mkTx(A, 0, 'one')], 1001: [mkTx(A, 0, 'two')], 1002: [mkTx(A, 1, 'three')] },
    { [A]: P.minJusticeBalance });
  const r = await scan(chain, { from: 1000, to: 1002, params: P });
  assert.deepEqual(r.entries.map((e) => e.body), ['one', 'three']);
  assert.deepEqual(r.rejected[0].failed, ['V8']);
});

test('rate limit counts only accepted entries and spans blocks', async () => {
  const blocks = {};
  for (let i = 0; i < 5; i++) blocks[1000 + i] = [mkTx(A, i, 'entry ' + i)];
  const chain = fakeChain(blocks, { [A]: P.minJusticeBalance });
  const r = await scan(chain, { from: 1000, to: 1004, params: P });
  assert.equal(r.entries.length, P.maxEntriesPerAuthorPerWindow);
  assert.equal(r.rejected.length, 2);
  assert.ok(r.rejected.every((x) => x.failed.includes('V9')));
});

test('rate limit is per author, not global', async () => {
  const blocks = {};
  for (let i = 0; i < 3; i++) blocks[1000 + i] = [mkTx(A, i, 'a' + i), mkTx(B, i, 'b' + i, { transactionIndex: 1 })];
  const chain = fakeChain(blocks, { [A]: P.minJusticeBalance, [B]: P.minJusticeBalance });
  const r = await scan(chain, { from: 1000, to: 1002, params: P });
  assert.equal(r.entries.length, 6);
});

test('front-runner in an earlier block does not steal the entry', async () => {
  // Attacker replays A's exact bytes from their own address one block early.
  const real = mkTx(A, 0, 'my testimony');
  const stolen = { ...real, hash: '0xff'.padEnd(66, '0'), from: B };
  const chain = fakeChain({ 1000: [stolen], 1001: [real] },
    { [A]: P.minJusticeBalance, [B]: P.minJusticeBalance });
  const r = await scan(chain, { from: 1000, to: 1001, params: P });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].author, A);          // the real author owns it
  assert.ok(r.rejected[0].failed.includes('V6')); // the copy is not an entry
});

test('output is deterministic across runs', async () => {
  const blocks = { 1000: [mkTx(A, 0, 'x'), mkTx(B, 0, 'y', { transactionIndex: 1 })] };
  const chain = fakeChain(blocks, { [A]: P.minJusticeBalance, [B]: P.minJusticeBalance });
  const a = await scan(chain, { from: 1000, to: 1000, params: P });
  const b = await scan(chain, { from: 1000, to: 1000, params: P });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('pre-seeded global content set pre-empts an entry (V12)', async () => {
  // The same body was already inscribed on L1 outside the treasury flow,
  // so the ethscription is not ours to mint.
  const t = mkTx(A, 0, 'already inscribed');
  const { entries, rejected } = await scan(fakeChain({ 1000: [t] }, { [A]: P.minJusticeBalance }),
    { from: 1000, to: 1000, params: P });
  const ch = entries[0].contentHash;

  const r = await scan(fakeChain({ 1000: [t] }, { [A]: P.minJusticeBalance }),
    { from: 1000, to: 1000, params: P, seenContent: new Set([ch]) });
  assert.equal(r.entries.length, 0);
  assert.ok(r.rejected[0].failed.includes('V12'));
});
