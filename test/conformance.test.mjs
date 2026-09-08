// The frozen conformance vectors. These are what make "the indexer is the
// protocol" checkable rather than asserted: any implementation, in any
// language, can run these and prove it agrees.
//
// A failure here means the rules changed. That is sometimes correct — but
// every entry already on chain was written under the old rules, so it is
// never something to fix by regenerating the vectors without deciding to.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { validate } from '../src/rules.mjs';
import { PARAMS } from '../src/config.mjs';

const suite = JSON.parse(readFileSync(new URL('../conformance/vectors.json', import.meta.url), 'utf8'));

const params = {
  ...PARAMS,
  journalContracts: suite.params.journalContracts,
  minFeeWei: BigInt(suite.params.minFeeWei),
  maxEntriesPerAuthorPerWindow: suite.params.maxEntriesPerAuthorPerWindow,
  rateLimitWindowBlocks: suite.params.rateLimitWindowBlocks,
  bodyMaxChars: suite.params.bodyMaxChars,
  maxTags: suite.params.maxTags,
  genesisBlock: suite.params.genesisBlock,
};

// The vectors pin the rule logic against fixed parameters. The parameters
// themselves are equally part of the protocol, so if the deployed config
// drifts from what the vectors assume, the vectors are certifying a
// protocol nobody is running. Addresses and the genesis block are
// deployment-specific and deliberately excluded.
test('deployed parameters still match what the vectors assume', () => {
  const shared = {
    minFeeWei: PARAMS.minFeeWei.toString(),
    maxEntriesPerAuthorPerWindow: PARAMS.maxEntriesPerAuthorPerWindow,
    rateLimitWindowBlocks: PARAMS.rateLimitWindowBlocks,
    bodyMaxChars: PARAMS.bodyMaxChars,
    maxTags: PARAMS.maxTags,
  };
  for (const [k, v] of Object.entries(shared)) {
    assert.equal(v, suite.params[k],
      `${k} is ${v} in src/config.mjs but ${suite.params[k]} in the vectors — ` +
      'changing it changes what counts as an entry, retroactively');
  }
});

test('the vector file covers every rule the implementation can emit', () => {
  const covered = new Set(suite.vectors.flatMap((v) => v.expect.failed));
  // V12 is unreachable in a single-event vector: it needs prior content.
  const expected = ['V1', 'V2', 'V4', 'V5', 'V6', 'V8', 'V9', 'V10', 'V11', 'V13'];
  const missing = expected.filter((r) => !covered.has(r));
  assert.deepEqual(missing, [], `no vector exercises: ${missing.join(', ')}`);
});

for (const v of suite.vectors) {
  test(`vector: ${v.name} — ${v.why}`, () => {
    const r = validate(v.event, {
      authorState: v.authorState,
      seenContent: new Set(),
      params,
    });
    assert.equal(r.valid, v.expect.valid, `validity differs`);
    assert.deepEqual(r.failed, v.expect.failed, `failed rules differ`);
    if (v.expect.contentHash) {
      assert.equal(r.contentHash, v.expect.contentHash, 'content hash differs');
    }
  });
}
