// Deployment addresses. `forge script script/Deploy.s.sol` prints these.
// Keep them in step with src/config.mjs — the indexer and this page must
// agree on which contract is canonical or they will disagree about what
// counts as an entry.
window.JJ_CONFIG = {
  // --- Sepolia ---
  // CHAIN_ID: 11155111,
  // CHAIN_NAME: 'Sepolia',
  // EXPLORER: 'https://sepolia.etherscan.io',
  // READ_RPC: 'https://ethereum-sepolia-rpc.publicnode.com',
  // FAUCET: true,

  CHAIN_ID: 31337,
  CHAIN_NAME: 'Anvil (local)',
  EXPLORER: '',

  // Read-only endpoint. The archive must be readable without connecting a
  // wallet — requiring one to read a public record would be absurd.
  READ_RPC: 'http://127.0.0.1:8547',

  JOURNAL: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
  JUSTICE: '0x0165878A594ca255338adfa4d48449f69242Eb8F',

  MIN_FEE_WEI: 1000000000000000n,        // 0.001 ETH
  MIN_BALANCE: 100000n * 10n ** 18n,     // 100,000 $JUSTICE
  BODY_MAX_CHARS: 500,
  MAX_TAGS: 5,
  GENESIS_BLOCK: 0,

  // Testnet only. Hides the faucet button when false.
  FAUCET: true,
};
