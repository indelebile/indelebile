#!/usr/bin/env node
// Point both configs at a deployment. The indexer and the page must agree
// on which contract is canonical or they disagree about what an entry is,
// and keeping two files in sync by hand is how that goes wrong.
//
//   node scripts/apply-deployment.mjs --network sepolia \
//     --journal 0x.. --justice 0x.. --treasury 0x.. --genesis 12345678
//
// By default this replaces the current deployment, which is what you want
// while iterating. Pass --supersede to keep the previous one instead: its
// range is closed at the new genesis and the archive spans both. Use that
// whenever entries already exist under the old contract — every parameter
// is immutable, so a fee or treasury change means a new deployment, and
// without --supersede those entries silently stop being entries.

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const NETWORKS = {
  sepolia: {
    chainId: 11155111, name: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    rpcs: ['https://ethereum-sepolia-rpc.publicnode.com'],
    currency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    faucet: true,
  },
  anvil: {
    chainId: 31337, name: 'Anvil (local)',
    explorer: '', rpcs: ['http://127.0.0.1:8547'],
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    faucet: true,
  },
  mainnet: {
    chainId: 1, name: 'Ethereum',
    explorer: 'https://etherscan.io',
    rpcs: ['https://rpc.mevblocker.io', 'https://eth.api.onfinality.io/public', 'https://ethereum-rpc.publicnode.com'],
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    faucet: false,
  },
};

const net = NETWORKS[arg('network', 'sepolia')];
if (!net) { console.error('unknown --network; use ' + Object.keys(NETWORKS).join(', ')); process.exit(1); }

const journal = arg('journal');
const justice = arg('justice');
const treasury = arg('treasury');
const genesis = arg('genesis');
// Must match what the contract was deployed with, or every entry it writes
// is rejected at V5 and the archive silently stays empty.
const protocol = arg('protocol', 'justice-journal');
for (const [k, v] of Object.entries({ journal, justice, treasury, genesis })) {
  if (!v) { console.error(`missing --${k}`); process.exit(1); }
}
for (const [k, v] of Object.entries({ journal, justice, treasury })) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { console.error(`--${k} is not an address: ${v}`); process.exit(1); }
}

// Anchored to the start of a line that is not a comment. Without that, a
// commented-out example higher in the file matches first and the script
// edits the comment while reporting success.
const line = (key, valuePattern) =>
  new RegExp(`^(?!\\s*//)(\\s*${key}: )${valuePattern}`, 'm');

const sub = (s, re, to) => {
  if (!re.test(s)) { console.error(`could not find ${re} — did the config change shape?`); process.exit(1); }
  return s.replace(re, to);
};

const supersede = argv.includes('--supersede');

// --- src/config.mjs (the indexer) ---
const cfgPath = new URL('../src/config.mjs', import.meta.url);
let cfg = readFileSync(cfgPath, 'utf8');

const prior = supersede
  ? [...cfg.matchAll(/\{ address: '(0x[0-9a-fA-F]{40})', fromBlock: (\d+), toBlock: (null|\d+),\s*\n\s*note: '([^']*)' \}/g)]
      .map((m) => ({ address: m[1], fromBlock: Number(m[2]), toBlock: m[3] === 'null' ? null : Number(m[3]), note: m[4] }))
  : [];
// Close the outgoing deployment at the block before the new one starts.
if (prior.length) prior[prior.length - 1].toBlock = Number(genesis) - 1;

const entries = [...prior, { address: journal, fromBlock: Number(genesis), toBlock: null, note: `${net.name} deployment` }];
const rendered = entries.map((c) =>
  `    { address: '${c.address}', fromBlock: ${c.fromBlock}, toBlock: ${c.toBlock ?? 'null'},\n` +
  `      note: '${c.note}' },`).join('\n');
cfg = sub(cfg, /  journalContracts: \[\n[\s\S]*?\n  \],/, `  journalContracts: [\n${rendered}\n  ],`);
cfg = sub(cfg, line('treasury', "'0x[0-9a-fA-F]{40}'[^\\n]*"), `$1'${treasury}', // ${net.name}`);
cfg = sub(cfg, line('justiceToken', "'0x[0-9a-fA-F]{40}'[^\\n]*"), `$1'${justice}', // ${net.name}`);
// The archive still begins at the earliest contract, not the newest.
cfg = sub(cfg, line('genesisBlock', '\\d+'), `$1${entries[0].fromBlock}`);
// Grouped: an ungrouped alternation would escape the anchor and match a
// quoted string anywhere in the file.
cfg = sub(cfg, line('protocol', "(?:PROTOCOL|'[^']*')"),
  protocol === 'justice-journal' ? '$1PROTOCOL' : `$1'${protocol}'`);
writeFileSync(cfgPath, cfg);

// --- web/config.js (the page) ---
const webPath = new URL('../web/config.js', import.meta.url);
let web = readFileSync(webPath, 'utf8');
web = sub(web, line('CHAIN_ID', '\\d+'), `$1${net.chainId}`);
web = sub(web, line('CHAIN_NAME', "'[^']*'"), `$1'${net.name}'`);
web = sub(web, line('EXPLORER', "'[^']*'"), `$1'${net.explorer}'`);
web = sub(web, /  READ_RPCS: \[[\s\S]*?\n  \],/,
  '  READ_RPCS: [\n' + net.rpcs.map((u) => `    '${u}',`).join('\n') + '\n  ],');
web = sub(web, /  JOURNALS: \[[\s\S]*?\n  \],/,
  '  JOURNALS: [\n' + entries.map((c) =>
    `    { address: '${c.address}', fromBlock: ${c.fromBlock}, toBlock: ${c.toBlock ?? 'null'} },`).join('\n') + '\n  ],');
web = sub(web, line('JUSTICE', "'0x[0-9a-fA-F]{40}'"), `$1'${justice}'`);
web = sub(web, line('GENESIS_BLOCK', '\\d+'), `$1${entries[0].fromBlock}`);
web = sub(web, line('FAUCET', '(?:true|false)'), `$1${net.faucet}`);
web = sub(web, /CHAIN_PARAMS: \{[\s\S]*?\n  \},/, `CHAIN_PARAMS: {
    chainId: '0x${net.chainId.toString(16)}',
    chainName: '${net.name}',
    nativeCurrency: ${JSON.stringify(net.currency)},
    rpcUrls: ['${net.rpcs[0]}'],${net.explorer ? `\n    blockExplorerUrls: ['${net.explorer}'],` : ''}
  },`);
writeFileSync(webPath, web);

// Read both files back and confirm what we asked for is what is there. A
// substitution that quietly matched the wrong line reports success
// otherwise — which is exactly how this script edited a commented-out
// example block once and said it was done.
const { PARAMS } = await import(cfgPath.href + '?v=' + Date.now());
const webNow = readFileSync(webPath, 'utf8');
const readWeb = (k) => webNow.match(new RegExp(`^(?!\\s*//)\\s*${k}: '?([^',\\n]*)`, 'm'))?.[1];

const checks = [
  ['indexer journalContracts (newest)', PARAMS.journalContracts.at(-1).address.toLowerCase(), journal.toLowerCase()],
  ['indexer contract count', String(PARAMS.journalContracts.length), String(entries.length)],
  ['indexer justiceToken', PARAMS.justiceToken.toLowerCase(), justice.toLowerCase()],
  ['indexer treasury', PARAMS.treasury.toLowerCase(), treasury.toLowerCase()],
  ['indexer genesisBlock', String(PARAMS.genesisBlock), String(entries[0].fromBlock)],
  ['indexer protocol', PARAMS.protocol, protocol],
  ['page JOURNALS (newest)', (webNow.match(/address: '(0x[0-9a-fA-F]{40})'/g) ?? []).at(-1)?.match(/0x[0-9a-fA-F]{40}/)[0].toLowerCase(), journal.toLowerCase()],
  ['page JUSTICE', readWeb('JUSTICE')?.toLowerCase(), justice.toLowerCase()],
  ['page CHAIN_ID', readWeb('CHAIN_ID'), String(net.chainId)],
  // readWeb reads a scalar; READ_RPCS is a list, so match the first entry.
  ['page READ_RPCS (first)', webNow.match(/READ_RPCS: \[\s*\n\s*'([^']*)'/)?.[1], net.rpcs[0]],
  ['page GENESIS_BLOCK', readWeb('GENESIS_BLOCK'), String(entries[0].fromBlock)],
];
const wrong = checks.filter(([, got, want]) => got !== want);
if (wrong.length) {
  console.error('the edit did not take:');
  for (const [what, got, want] of wrong) console.error(`  ${what}: is ${got}, wanted ${want}`);
  process.exit(1);
}

console.log(`both configs now point at ${net.name} (chain ${net.chainId})
  journal   ${journal}${supersede && entries.length > 1 ? `  (superseding ${entries.length - 1}, archive spans all)` : ''}
  justice   ${justice}
  treasury  ${treasury}
  genesis   ${genesis}
  protocol  ${protocol}${protocol === 'justice-journal' ? '' : '   ← rehearsal; these entries are not the archive'}
  rpc       ${net.rpcs.join(', ')}

next:  npm test  &&  npm run web`);
