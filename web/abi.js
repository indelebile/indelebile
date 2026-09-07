// Hand-rolled ABI encoding. The page loads no libraries: everything it
// sends is built here, so a reader can verify the exact bytes that reach
// the chain without trusting a bundle.
//
// Selectors and topics are compile-time constants (`cast sig`, `cast
// keccak`), which is what lets us skip a keccak implementation entirely.

const SEL = {
  write: '0xebaac771',      // write(string)
  balanceOf: '0x70a08231',  // balanceOf(address)
  faucet: '0xde5f72fd',     // faucet()
};

const TOPIC = {
  // ethscriptions_protocol_CreateEthscription(address,string)
  esip2: '0x665fba0baf3dc33e9943340197893ac16f56482c2defb8de60f944987fee451c',
};

const hex = (n, bytes = 32) => n.toString(16).padStart(bytes * 2, '0');
const padAddr = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

function utf8Hex(s) {
  return [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/// encode write(string contentURI): selector + offset + length + padded data
function encodeWrite(contentURI) {
  const data = utf8Hex(contentURI);
  const byteLen = data.length / 2;
  const padded = data.padEnd(Math.ceil(byteLen / 32) * 64, '0');
  return SEL.write + hex(32n) + hex(BigInt(byteLen)) + padded;
}

function encodeBalanceOf(addr) {
  return SEL.balanceOf + padAddr(addr);
}

/// Decode the non-indexed `string contentURI` out of an ESIP-2 log's data.
function decodeEsip2String(dataHex) {
  const d = dataHex.replace(/^0x/, '');
  const offset = Number(BigInt('0x' + d.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + d.slice(offset, offset + 64)));
  const body = d.slice(offset + 64, offset + 64 + len * 2);
  const bytes = new Uint8Array(body.match(/../g).map((h) => parseInt(h, 16)));
  return new TextDecoder().decode(bytes);
}

window.JJ_ABI = { SEL, TOPIC, encodeWrite, encodeBalanceOf, decodeEsip2String, padAddr, utf8Hex };
