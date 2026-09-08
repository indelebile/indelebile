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

const sub = (s, re, to) => {
  if (!re.test(s)) { console.error(`could not find ${re} — did the config change shape?`); process.exit(1); }
  return s.replace(re, to);
};

// --- src/config.mjs (the indexer) ---
const cfgPath = new URL('../src/config.mjs', import.meta.url);
let cfg = readFileSync(cfgPath, 'utf8');
cfg = sub(cfg, /(journalContract: ')0x[0-9a-fA-F]{40}(')[^\n]*/, `$1${journal}$2, // ${net.name}`);
cfg = sub(cfg, /(treasury: ')0x[0-9a-fA-F]{40}(')[^\n]*/, `$1${treasury}$2, // ${net.name}`);
cfg = sub(cfg, /(justiceToken: ')0x[0-9a-fA-F]{40}(')[^\n]*/, `$1${justice}$2, // ${net.name}`);
cfg = sub(cfg, /(genesisBlock: )\d+/, `$1${genesis}`);
writeFileSync(cfgPath, cfg);

// --- web/config.js (the page) ---
const webPath = new URL('../web/config.js', import.meta.url);
let web = readFileSync(webPath, 'utf8');
web = sub(web, /(CHAIN_ID: )\d+/, `$1${net.chainId}`);
web = sub(web, /(CHAIN_NAME: ')[^']*/, `$1${net.name}`);
web = sub(web, /(EXPLORER: ')[^']*/, `$1${net.explorer}`);
web = sub(web, /(READ_RPC: ')[^']*/, `$1${net.rpc}`);
web = sub(web, /(JOURNAL: ')0x[0-9a-fA-F]{40}/, `$1${journal}`);
web = sub(web, /(JUSTICE: ')0x[0-9a-fA-F]{40}/, `$1${justice}`);
web = sub(web, /(GENESIS_BLOCK: )\d+/, `$1${genesis}`);
web = sub(web, /(FAUCET: )(?:true|false)/, `$1${net.faucet}`);
web = sub(web, /CHAIN_PARAMS: \{[\s\S]*?\n  \},/, `CHAIN_PARAMS: {
    chainId: '0x${net.chainId.toString(16)}',
    chainName: '${net.name}',
    nativeCurrency: ${JSON.stringify(net.currency)},
    rpcUrls: ['${net.rpc}'],${net.explorer ? `\n    blockExplorerUrls: ['${net.explorer}'],` : ''}
  },`);
writeFileSync(webPath, web);

console.log(`both configs now point at ${net.name} (chain ${net.chainId})
  journal   ${journal}
  justice   ${justice}
  treasury  ${treasury}
  genesis   ${genesis}
  rpc       ${net.rpc}

next:  npm test  &&  npm run web`);
