#!/usr/bin/env node
// Point both configs at a deployment. The indexer and the page must agree
// on which contract is canonical or they disagree about what an entry is,
// and keeping two files in sync by hand is how that goes wrong.
//
//   node scripts/apply-deployment.mjs --network sepolia \
//     --journal 0x.. --justice 0x.. --treasury 0x.. --genesis 12345678

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };

const NETWORKS = {
  sepolia: {
    chainId: 11155111, name: 'Sepolia',
    explorer: 'https://sepolia.etherscan.io',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    currency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    faucet: true,
  },
  anvil: {
    chainId: 31337, name: 'Anvil (local)',
    explorer: '', rpc: 'http://127.0.0.1:8547',
    currency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    faucet: true,
  },
  mainnet: {
    chainId: 1, name: 'Ethereum',
    explorer: 'https://etherscan.io',
    rpc: 'https://ethereum-rpc.publicnode.com',
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

// --- src/config.mjs (the indexer) ---
const cfgPath = new URL('../src/config.mjs', import.meta.url);
let cfg = readFileSync(cfgPath, 'utf8');
cfg = sub(cfg, line('journalContract', "'0x[0-9a-fA-F]{40}'[^\\n]*"), `$1'${journal}', // ${net.name}`);
cfg = sub(cfg, line('treasury', "'0x[0-9a-fA-F]{40}'[^\\n]*"), `$1'${treasury}', // ${net.name}`);
cfg = sub(cfg, line('justiceToken', "'0x[0-9a-fA-F]{40}'[^\\n]*"), `$1'${justice}', // ${net.name}`);
cfg = sub(cfg, line('genesisBlock', '\\d+'), `$1${genesis}`);
writeFileSync(cfgPath, cfg);

// --- web/config.js (the page) ---
const webPath = new URL('../web/config.js', import.meta.url);
let web = readFileSync(webPath, 'utf8');
web = sub(web, line('CHAIN_ID', '\\d+'), `$1${net.chainId}`);
web = sub(web, line('CHAIN_NAME', "'[^']*'"), `$1'${net.name}'`);
web = sub(web, line('EXPLORER', "'[^']*'"), `$1'${net.explorer}'`);
web = sub(web, line('READ_RPC', "'[^']*'"), `$1'${net.rpc}'`);
web = sub(web, line('JOURNAL', "'0x[0-9a-fA-F]{40}'"), `$1'${journal}'`);
web = sub(web, line('JUSTICE', "'0x[0-9a-fA-F]{40}'"), `$1'${justice}'`);
web = sub(web, line('GENESIS_BLOCK', '\\d+'), `$1${genesis}`);
web = sub(web, line('FAUCET', '(?:true|false)'), `$1${net.faucet}`);
web = sub(web, /CHAIN_PARAMS: \{[\s\S]*?\n  \},/, `CHAIN_PARAMS: {
    chainId: '0x${net.chainId.toString(16)}',
    chainName: '${net.name}',
    nativeCurrency: ${JSON.stringify(net.currency)},
    rpcUrls: ['${net.rpc}'],${net.explorer ? `\n    blockExplorerUrls: ['${net.explorer}'],` : ''}
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
  ['indexer journalContract', PARAMS.journalContract.toLowerCase(), journal.toLowerCase()],
  ['indexer justiceToken', PARAMS.justiceToken.toLowerCase(), justice.toLowerCase()],
  ['indexer treasury', PARAMS.treasury.toLowerCase(), treasury.toLowerCase()],
  ['indexer genesisBlock', String(PARAMS.genesisBlock), String(genesis)],
  ['page JOURNAL', readWeb('JOURNAL')?.toLowerCase(), journal.toLowerCase()],
  ['page JUSTICE', readWeb('JUSTICE')?.toLowerCase(), justice.toLowerCase()],
  ['page CHAIN_ID', readWeb('CHAIN_ID'), String(net.chainId)],
  ['page READ_RPC', readWeb('READ_RPC'), net.rpc],
  ['page GENESIS_BLOCK', readWeb('GENESIS_BLOCK'), String(genesis)],
];
const wrong = checks.filter(([, got, want]) => got !== want);
if (wrong.length) {
  console.error('the edit did not take:');
  for (const [what, got, want] of wrong) console.error(`  ${what}: is ${got}, wanted ${want}`);
  process.exit(1);
}

console.log(`both configs now point at ${net.name} (chain ${net.chainId})
  journal   ${journal}
  justice   ${justice}
  treasury  ${treasury}
  genesis   ${genesis}
  rpc       ${net.rpc}

next:  npm test  &&  npm run web`);
