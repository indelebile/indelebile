import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scan } from '../src/scan.mjs';
import { buildEntry, encode } from '../src/entry.mjs';
import { PARAMS } from '../src/config.mjs';

const A = '0xaaaa000000000000000000000000000000000001';
const B = '0xbbbb000000000000000000000000000000000002';
const JOURNAL = '0x1000000000000000000000000000000000000001';
const IMPOSTOR = '0x9000000000000000000000000000000000000009';
const P = { ...PARAMS, journalContracts: [{ address: JOURNAL, fromBlock: 0, toBlock: null }], genesisBlock: 1000 };

let n = 0;
// One ESIP-2 write log, as the indexer normalizes it.
function write(author, seq, body, over = {}) {
  const { uri } = encode(buildEntry({ author, seq, ts: 1757280000, tags: [], body }));
  return {
    txHash: '0x' + String(++n).padStart(64, '0'),
    blockNumber: 1000n, logIndex: 0, emitter: JOURNAL,
    author, contentURI: uri, feeWei: P.minFeeWei, ...over,
  };
}
const chainOf = (writes) => ({ getWrites: async () => writes });

test('accepts a well-formed write', async () => {
  const w = write(A, 0, 'first');
  const r = await scan(chainOf([w]), { from: 1000, to: 1000, params: P });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].id, w.txHash);
  assert.equal(r.entries[0].author, A);
});

test('V1 rejects an ESIP-2 log from a look-alike contract', async () => {
  // Anyone can emit the ESIP-2 event. Only our contract's logs are entries.
  const r = await scan(chainOf([write(A, 0, 'forged', { emitter: IMPOSTOR })]),
    { from: 1000, to: 1000, params: P });
  assert.equal(r.entries.length, 0);
  assert.ok(r.rejected[0].failed.includes('V1'));
});

test('V2 rejects an underpaid write', async () => {
  const r = await scan(chainOf([write(A, 0, 'cheap', { feeWei: P.minFeeWei - 1n })]),
    { from: 1000, to: 1000, params: P });
  assert.ok(r.rejected[0].failed.includes('V2'));
});

test('V6 rejects a body whose author field is not the initialOwner', async () => {
  // Content copied from another author, re-emitted under the copier's name.
  const stolen = write(A, 0, 'my testimony', { author: B });
  const r = await scan(chainOf([stolen]), { from: 1000, to: 1000, params: P });
  assert.ok(r.rejected[0].failed.includes('V6'));
});

test('V4 rejects non-canonical key order', async () => {
  const uri = 'data:application/json;charset=utf-8,' +
    `{"body":"x","p":"justice-journal","v":1,"author":"${A}","seq":0,"ts":1,"tags":[]}`;
  const r = await scan(chainOf([write(A, 0, 'x', { contentURI: uri })]),
    { from: 1000, to: 1000, params: P });
  assert.ok(r.rejected[0].failed.includes('V4'));
});

test('V8 requires a strictly increasing seq across blocks', async () => {
  const r = await scan(chainOf([
    write(A, 0, 'one', { blockNumber: 1000n }),
    write(A, 0, 'two', { blockNumber: 1001n }),
    write(A, 1, 'three', { blockNumber: 1002n }),
  ]), { from: 1000, to: 1002, params: P });
  assert.deepEqual(r.entries.map((e) => e.body), ['one', 'three']);
  assert.deepEqual(r.rejected[0].failed, ['V8']);
});

test('V9 rate-limits per author, counting accepted entries only', async () => {
  const ws = [];
  for (let i = 0; i < 5; i++) ws.push(write(A, i, 'entry ' + i, { blockNumber: BigInt(1000 + i) }));
  const r = await scan(chainOf(ws), { from: 1000, to: 1004, params: P });
  assert.equal(r.entries.length, P.maxEntriesPerAuthorPerWindow);
  assert.ok(r.rejected.every((x) => x.failed.includes('V9')));
});

test('V9 is per author, not global', async () => {
  const ws = [];
  for (let i = 0; i < 3; i++) {
    ws.push(write(A, i, 'a' + i, { blockNumber: BigInt(1000 + i) }));
    ws.push(write(B, i, 'b' + i, { blockNumber: BigInt(1000 + i), logIndex: 1 }));
  }
  const r = await scan(chainOf(ws), { from: 1000, to: 1002, params: P });
  assert.equal(r.entries.length, 6);
});

test('V10 counts code points, so Chinese gets the same allowance', async () => {
  const ok = await scan(chainOf([write(A, 0, '记'.repeat(500))]), { from: 1000, to: 1000, params: P });
  assert.equal(ok.entries.length, 1);
  const over = await scan(chainOf([write(A, 0, '记'.repeat(501))]), { from: 1000, to: 1000, params: P });
  assert.ok(over.rejected[0].failed.includes('V10'));
});

test('V12 rejects content already inscribed elsewhere on L1', async () => {
  const w = write(A, 0, 'already inscribed');
  const first = await scan(chainOf([w]), { from: 1000, to: 1000, params: P });
  const again = await scan(chainOf([w]), {
    from: 1000, to: 1000, params: P, seenContent: new Set([first.entries[0].contentHash]),
  });
  assert.equal(again.entries.length, 0);
  assert.ok(again.rejected[0].failed.includes('V12'));
});

test('a griefed author recovers by bumping seq', async () => {
  const first = await scan(chainOf([write(A, 0, 'testimony')]), { from: 1000, to: 1000, params: P });
  const retry = await scan(chainOf([write(A, 1, 'testimony')]), {
    from: 1000, to: 1000, params: P, seenContent: new Set([first.entries[0].contentHash]),
  });
  assert.equal(retry.entries.length, 1);
});

test('V13 rejects writes before the genesis block', async () => {
  const r = await scan(chainOf([write(A, 0, 'early', { blockNumber: 999n })]),
    { from: 999, to: 1000, params: P });
  assert.ok(r.rejected[0].failed.includes('V13'));
});

test('output is ordered by chain position and is deterministic', async () => {
  const ws = [
    write(B, 0, 'second', { blockNumber: 1001n }),
    write(A, 0, 'first', { blockNumber: 1000n, logIndex: 3 }),
  ];
  const a = await scan(chainOf(ws), { from: 1000, to: 1001, params: P });
  const b = await scan(chainOf(ws), { from: 1000, to: 1001, params: P });
  assert.deepEqual(a.entries.map((e) => e.body), ['first', 'second']);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// Every contract parameter is immutable, so changing the fee, the gate or
// the treasury means deploying again. The archive has to survive that or it
// ends at its own first governance decision.
test('the archive spans a superseded deployment', async () => {
  const OLD = '0x0dd0000000000000000000000000000000000001';
  const NEW = '0x0dd0000000000000000000000000000000000002';
  const spanning = {
    ...P,
    journalContracts: [
      { address: OLD, fromBlock: 1000, toBlock: 1500 },
      { address: NEW, fromBlock: 1501, toBlock: null },
    ],
  };
  const r = await scan(chainOf([
    write(A, 0, 'written under the old contract', { emitter: OLD, blockNumber: 1200n }),
    write(A, 1, 'written under the new one', { emitter: NEW, blockNumber: 1600n }),
    // the old contract can still emit after it is superseded; that is not an entry
    write(A, 2, 'emitted by the retired contract', { emitter: OLD, blockNumber: 1700n }),
    // and the new one cannot reach back before it existed
    write(B, 0, 'from the future contract, too early', { emitter: NEW, blockNumber: 1100n }),
  ]), { from: 1000, to: 1700, params: spanning });

  assert.deepEqual(r.entries.map((e) => e.body),
    ['written under the old contract', 'written under the new one']);
  assert.equal(r.rejected.length, 2);
  assert.ok(r.rejected.every((x) => x.failed.includes('V1')));
});

test('sequence numbers carry across a migration', async () => {
  const OLD = '0x0dd0000000000000000000000000000000000001';
  const NEW = '0x0dd0000000000000000000000000000000000002';
  const spanning = { ...P, journalContracts: [
    { address: OLD, fromBlock: 1000, toBlock: 1500 },
    { address: NEW, fromBlock: 1501, toBlock: null },
  ] };
  // An author cannot reset their history by moving to the new contract.
  const r = await scan(chainOf([
    write(A, 5, 'old', { emitter: OLD, blockNumber: 1200n }),
    write(A, 5, 'reused seq on the new contract', { emitter: NEW, blockNumber: 1600n }),
  ]), { from: 1000, to: 1700, params: spanning });
  assert.equal(r.entries.length, 1);
  assert.ok(r.rejected[0].failed.includes('V8'));
});

// A mainnet rehearsal writes real, permanent ethscriptions. They must be
// impossible to read as part of the archive, so that nobody can say the
// archive was started before the DAO decided to start it.
test('rehearsal entries are invisible to the production rules', async () => {
  const { PROTOCOL_REHEARSAL } = await import('../src/canonical.mjs');
  const rehearsal = buildEntry({
    author: A, seq: 0, ts: 1757280000, tags: [], body: 'written while validating on mainnet',
    p: PROTOCOL_REHEARSAL,
  });
  const { toDataUri } = await import('../src/canonical.mjs');

  const production = await scan(chainOf([write(A, 0, 'x', { contentURI: toDataUri(rehearsal) })]),
    { from: 1000, to: 1000, params: { ...P, protocol: 'justice-journal' } });
  assert.equal(production.entries.length, 0, 'the archive must not contain it');
  assert.ok(production.rejected[0].failed.includes('V5'));

  // And the same bytes are a valid entry under the rehearsal's own rules,
  // so the rehearsal actually exercises the production code path.
  const rehearsalRun = await scan(chainOf([write(A, 0, 'x', { contentURI: toDataUri(rehearsal) })]),
    { from: 1000, to: 1000, params: { ...P, protocol: PROTOCOL_REHEARSAL } });
  assert.equal(rehearsalRun.entries.length, 1);
});

test('a production entry is equally invisible to the rehearsal rules', async () => {
  const { PROTOCOL_REHEARSAL } = await import('../src/canonical.mjs');
  const r = await scan(chainOf([write(A, 0, 'a real entry')]),
    { from: 1000, to: 1000, params: { ...P, protocol: PROTOCOL_REHEARSAL } });
  assert.equal(r.entries.length, 0);
  assert.ok(r.rejected[0].failed.includes('V5'));
});
