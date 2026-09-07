// The validity predicate. This function IS the protocol: two people who
// run it over the same L1 range must get byte-identical output. It is
// pure — every input is either L1 state or derived from an earlier
// application of this same function.

import { PARAMS } from './config.mjs';
import { decode, contentHash, codePointLength } from './entry.mjs';

export const RULES = {
  V1: 'tx.to must be the treasury address',
  V2: 'tx.value must be at least the write fee',
  V3: 'tx must have succeeded',
  V4: 'calldata must decode to a canonical Journal entry',
  V5: 'protocol tag and version must match',
  V6: 'entry.author must equal tx.from',
  V7: 'author must hold the minimum $JUSTICE at the previous block',
  V8: 'entry.seq must exceed the author\'s highest accepted seq',
  V9: 'author is over the rate limit for the trailing window',
  V10: 'body exceeds the character limit',
  V11: 'tags are malformed or too many',
  V12: 'content is a duplicate of an earlier ethscription',
  V13: 'block is before the protocol genesis block',
};

/**
 * @param {object} tx      normalized L1 tx: {hash, blockNumber, txIndex, from, to, value, input, status}
 * @param {object} ctx     {justiceBalance, authorState, seenContent, params}
 *   justiceBalance  bigint  balance at end of (blockNumber - 1)
 *   authorState     {maxSeq: number|null, recentBlocks: number[]} from accepted entries only
 *   seenContent     Set<string> content hashes already accepted OR already inscribed on L1
 * @returns {{valid: boolean, failed: string[], entry: object|null, contentHash: string|null}}
 */
export function validate(tx, ctx) {
  const P = ctx.params ?? PARAMS;
  const failed = [];

  if (tx.blockNumber < P.genesisBlock) failed.push('V13');
  if ((tx.to ?? '').toLowerCase() !== P.treasury.toLowerCase()) failed.push('V1');
  if (BigInt(tx.value) < P.minFeeWei) failed.push('V2');
  if (tx.status !== 'success') failed.push('V3');

  const d = decode(tx.input);
  if (!d.ok) {
    failed.push('V4');
    return { valid: false, failed, entry: null, contentHash: null, reason: d.reason };
  }
  const e = d.entry;

  if (e.p !== 'justice-journal' || e.v !== 1) failed.push('V5');
  if (typeof e.author !== 'string' || e.author.toLowerCase() !== tx.from.toLowerCase()) failed.push('V6');
  if (BigInt(ctx.justiceBalance ?? 0n) < P.minJusticeBalance) failed.push('V7');

  if (!Number.isInteger(e.seq) || e.seq < 0) {
    failed.push('V8');
  } else if (ctx.authorState?.maxSeq != null && e.seq <= ctx.authorState.maxSeq) {
    failed.push('V8');
  }

  const windowStart = tx.blockNumber - P.rateLimitWindowBlocks;
  const inWindow = (ctx.authorState?.recentBlocks ?? []).filter((b) => b > windowStart).length;
  if (inWindow >= P.maxEntriesPerAuthorPerWindow) failed.push('V9');

  if (typeof e.body !== 'string' || codePointLength(e.body) > P.bodyMaxChars || e.body.length === 0) {
    failed.push('V10');
  }

  if (!Array.isArray(e.tags) || e.tags.length > P.maxTags ||
      !e.tags.every((t) => typeof t === 'string' && t.length <= P.tagMaxChars && P.tagPattern.test(t))) {
    failed.push('V11');
  }

  if (!Number.isInteger(e.ts) || e.ts < 0) failed.push('V5');

  const uri = 'data:application/json;charset=utf-8,' + JSON.stringify(e, ['p','v','author','seq','ts','tags','body']);
  const ch = contentHash(uri);
  if (ctx.seenContent?.has(ch)) failed.push('V12');

  return { valid: failed.length === 0, failed, entry: e, contentHash: ch };
}
