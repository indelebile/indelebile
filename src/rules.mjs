// The validity predicate. This function IS the protocol: two people who
// run it over the same L1 range must get byte-identical output. It is
// pure — every input is either L1 state or derived from an earlier
// application of this same function.
//
// Two rules from the pre-contract draft are gone, both because the
// JusticeJournal contract now enforces them atomically:
//   - "the transaction succeeded" — a reverted transaction emits no logs,
//     so a rejected write cannot reach the indexer at all.
//   - "the author holds 100,000 $JUSTICE" — checked in `write()`.
// Dropping the second one is what lets the indexer run against an ordinary
// RPC instead of an archive node.

import { PARAMS } from './config.mjs';
import { decode, contentHash, codePointLength, canonicalJson } from './entry.mjs';
import { DATA_URI_PREFIX } from './config.mjs';

export const RULES = {
  V1: 'log must come from the canonical JusticeJournal contract',
  V2: 'fee paid must be at least minFeeWei',
  V4: 'contentURI must be a canonical Journal entry',
  V5: 'protocol tag, version and timestamp must be well-formed',
  V6: 'entry.author must equal the ESIP-2 initialOwner',
  V8: 'entry.seq must exceed the author\'s highest accepted seq',
  V9: 'author is over the rate limit for the trailing window',
  V10: 'body must be 1-500 code points',
  V11: 'tags must be well-formed',
  V12: 'content is already inscribed elsewhere',
  V13: 'block is before the protocol genesis block',
};

// Enforced on-chain by JusticeJournal, not re-derived here.
export const CONTRACT_ENFORCED = {
  'tx success': 'a reverted write emits no log',
  'holding gate': 'write() reverts below minBalance',
};

/**
 * @param {object} ev  a normalized ESIP-2 write: {txHash, blockNumber, logIndex,
 *                     emitter, author, contentURI, feeWei}
 * @param {object} ctx {authorState, seenContent, params}
 */
export function validate(ev, ctx) {
  const P = ctx.params ?? PARAMS;
  const failed = [];

  if (ev.blockNumber < P.genesisBlock) failed.push('V13');
  if ((ev.emitter ?? '').toLowerCase() !== P.journalContract.toLowerCase()) failed.push('V1');
  if (BigInt(ev.feeWei) < P.minFeeWei) failed.push('V2');

  // The contentURI arrives as a string from the log, not as hex calldata.
  const d = decode('0x' + Buffer.from(ev.contentURI, 'utf8').toString('hex'));
  if (!d.ok) {
    failed.push('V4');
    return { valid: false, failed, entry: null, contentHash: null, reason: d.reason };
  }
  const e = d.entry;

  if (e.p !== 'justice-journal' || e.v !== 1) failed.push('V5');
  if (!Number.isInteger(e.ts) || e.ts < 0) failed.push('V5');
  if (typeof e.author !== 'string' || e.author.toLowerCase() !== ev.author.toLowerCase()) failed.push('V6');

  if (!Number.isInteger(e.seq) || e.seq < 0) {
    failed.push('V8');
  } else if (ctx.authorState?.maxSeq != null && e.seq <= ctx.authorState.maxSeq) {
    failed.push('V8');
  }

  const windowStart = ev.blockNumber - P.rateLimitWindowBlocks;
  const inWindow = (ctx.authorState?.recentBlocks ?? []).filter((b) => b > windowStart).length;
  if (inWindow >= P.maxEntriesPerAuthorPerWindow) failed.push('V9');

  if (typeof e.body !== 'string' || e.body.length === 0 || codePointLength(e.body) > P.bodyMaxChars) {
    failed.push('V10');
  }

  if (!Array.isArray(e.tags) || e.tags.length > P.maxTags ||
      !e.tags.every((t) => typeof t === 'string' && t.length <= P.tagMaxChars && P.tagPattern.test(t))) {
    failed.push('V11');
  }

  const ch = contentHash(DATA_URI_PREFIX + canonicalJson(e));
  if (ctx.seenContent?.has(ch)) failed.push('V12');

  return { valid: failed.length === 0, failed, entry: e, contentHash: ch };
}
