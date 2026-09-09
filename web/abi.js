// Hand-rolled ABI encoding. The page loads no libraries: everything it
// sends is built here, so a reader can verify the exact bytes that reach
// the chain without trusting a bundle.
//
// Selectors and topics are compile-time constants (`cast sig`, `cast
// keccak`), which is what lets us skip a keccak implementation entirely.

const SEL = {
  writeEntry: '0x46e00f5e', // writeEntry(string)
  balanceOf: '0x70a08231',  // balanceOf(address)
  faucet: '0xde5f72fd',     // faucet()
};

const hex = (n, bytes = 32) => n.toString(16).padStart(bytes * 2, '0');
const padAddr = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

function utf8Hex(s) {
  return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/// encode writeEntry(string entryTail): selector + offset + length + padded
///
/// Only the tail goes on the wire. The contract writes the dataURI header
/// and the author's address itself, which is why this calldata contains no
/// `data:` prefix — see SPEC.md on calldata-versus-event priority.
function encodeWriteEntry(entryTail) {
  const data = utf8Hex(entryTail);
  const byteLen = data.length / 2;
  const padded = data.padEnd(Math.ceil(byteLen / 32) * 64, '0');
  return SEL.writeEntry + hex(32n) + hex(BigInt(byteLen)) + padded;
}

function encodeBalanceOf(addr) {
  return SEL.balanceOf + padAddr(addr);
}

// Only what the page still uses. Decoding log data and building topic
// filters left with the archive: the page reads the indexer's output now,
// and keeping the helpers around would invite someone to re-derive the
// rules in the browser again.
window.JJ_ABI = { SEL, encodeWriteEntry, encodeBalanceOf };
