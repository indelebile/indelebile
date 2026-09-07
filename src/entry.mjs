// Entry encoding. The bytes that go into calldata are produced here and
// nowhere else, so encode/decode are exact inverses by construction.

import { sha256, toHex, hexToString, stringToHex } from 'viem';
import { PARAMS } from './config.mjs';
import { DATA_URI_PREFIX, canonicalJson, codePointLength } from './canonical.mjs';

// The canonical form lives in canonical.mjs, which the browser loads too.
export { buildEntry, canonicalJson, codePointLength, DATA_URI_PREFIX } from './canonical.mjs';

export function encode(entry) {
  const uri = DATA_URI_PREFIX + canonicalJson(entry);
  return { uri, calldata: stringToHex(uri) };
}

// Returns { ok, entry, reason }. Never throws on malformed input — the
// indexer runs this against arbitrary calldata from the open chain.
export function decode(calldata) {
  let uri;
  try {
    uri = hexToString(calldata);
  } catch {
    return { ok: false, reason: 'calldata is not valid UTF-8' };
  }
  if (!uri.startsWith(DATA_URI_PREFIX)) {
    return { ok: false, reason: 'wrong data URI prefix' };
  }
  let entry;
  try {
    entry = JSON.parse(uri.slice(DATA_URI_PREFIX.length));
  } catch {
    return { ok: false, reason: 'body is not valid JSON' };
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, reason: 'body is not a JSON object' };
  }
  // Reject anything that would not round-trip: unknown keys, reordered
  // keys, whitespace. Without this an attacker can mint two distinct
  // ethscriptions that decode to the same entry.
  if (canonicalJson(entry) !== uri.slice(DATA_URI_PREFIX.length)) {
    return { ok: false, reason: 'not in canonical form' };
  }
  return { ok: true, entry };
}

// Local dedupe key. The authoritative uniqueness rule belongs to the
// canonical Ethscriptions indexer; this is what we use to detect
// duplicates within our own scan.
export function contentHash(uri) {
  return sha256(toHex(uri));
}

export function byteLength(uri) {
  return new TextEncoder().encode(uri).length;
}

// EIP-7623 floor pricing. A data-carrying transaction with no execution
// pays the floor, so this is the gas an entry actually costs.
export function estimateGas(calldata) {
  const bytes = Buffer.from(calldata.slice(2), 'hex');
  let zero = 0;
  let nonzero = 0;
  for (const b of bytes) (b === 0 ? zero++ : nonzero++);
  const tokens = zero + nonzero * 4;
  const standard = 21_000 + 4 * tokens;
  const floor = 21_000 + 10 * tokens;
  return { zero, nonzero, tokens, standard, floor, gas: Math.max(standard, floor) };
}

export const LIMITS = PARAMS;
