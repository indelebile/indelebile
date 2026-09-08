// Canonical entry form. Zero dependencies on purpose: the browser loads
// this exact file, so the page and the indexer cannot drift apart on what
// the bytes are. A duplicated encoder here would silently break V4.

export const PROTOCOL = 'justice-journal';
export const VERSION = 1;
// `rule=esip6` opts out of the protocol's global content-uniqueness rule
// (ESIP-6). ESIP-6 exists for exactly our case and names it: a contract
// that has taken a user's money cannot revert if the creation fails as a
// duplicate. Without it, anyone watching the mempool can inscribe our
// bytes first, and the author pays the fee for an entry that mints no
// ethscription. With it, a duplicate can never invalidate us.
//
// Our own uniqueness is not weakened: the body carries `author` and `seq`,
// so two distinct entries can never share bytes.
export const MIME = 'application/json;charset=utf-8;rule=esip6';
export const DATA_URI_PREFIX = `data:${MIME},`;

// Fixed key order. Two authors writing the same entry must produce
// byte-identical output, and a verifier must be able to re-derive the
// bytes from the decoded object. JSON.stringify over a key array gives us
// that without a canonical-JSON dependency.
export const KEY_ORDER = ['p', 'v', 'author', 'seq', 'ts', 'tags', 'body'];

export function buildEntry({ author, seq, ts, tags = [], body }) {
  return {
    p: PROTOCOL,
    v: VERSION,
    author: author.toLowerCase(),
    seq,
    ts,
    tags: tags.map((t) => t.toLowerCase()),
    body,
  };
}

export const canonicalJson = (entry) => JSON.stringify(entry, KEY_ORDER);
export const toDataUri = (entry) => DATA_URI_PREFIX + canonicalJson(entry);
export const codePointLength = (s) => [...s].length;
export const byteLength = (s) => new TextEncoder().encode(s).length;

export const TAG_PATTERN = /^[a-z0-9-]+$/;

/// Every rule that can be checked without the chain. The page runs this
/// before offering to send, because the fee is spent even on an entry the
/// indexer will reject.
export function checkLocal(entry, limits) {
  const failed = [];
  if (entry.p !== PROTOCOL || entry.v !== VERSION) failed.push('V5');
  if (!Number.isInteger(entry.ts) || entry.ts < 0) failed.push('V5');
  if (!Number.isInteger(entry.seq) || entry.seq < 0) failed.push('V8');
  if (typeof entry.body !== 'string' || entry.body.length === 0 ||
      codePointLength(entry.body) > limits.bodyMaxChars) failed.push('V10');
  if (!Array.isArray(entry.tags) || entry.tags.length > limits.maxTags ||
      !entry.tags.every((t) => typeof t === 'string' && t.length <= 32 && TAG_PATTERN.test(t))) {
    failed.push('V11');
  }
  return failed;
}
