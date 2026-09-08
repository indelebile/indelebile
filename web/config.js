// Deployment addresses. `forge script script/Deploy.s.sol` prints these.
// Keep them in step with src/config.mjs — the indexer and this page must
// agree on which contract is canonical or they will disagree about what
// counts as an entry.
window.JJ_CONFIG = {
  // --- Sepolia ---
  // CHAIN_ID: 31337,
  // CHAIN_NAME: 'Anvil (local)',
  // EXPLORER: '',
  // READ_RPC: 'http://127.0.0.1:8547',
  // FAUCET: true,

  CHAIN_ID: 31337,
  CHAIN_NAME: 'Anvil (local)',
  EXPLORER: '',

  // Read-only endpoint. The archive must be readable without connecting a
  // wallet — requiring one to read a public record would be absurd.
  READ_RPC: 'http://127.0.0.1:8547',

  // Passed to wallet_addEthereumChain when the wallet does not know this
  // network yet, so a mismatch is one click to fix rather than a dead end.
  CHAIN_PARAMS: {
    chainId: '0x7a69',
    chainName: 'Anvil (local)',
    nativeCurrency: {"name":"Ether","symbol":"ETH","decimals":18},
    rpcUrls: ['http://127.0.0.1:8547'],
  },

  JOURNAL: '0x68B1D87F95878fE05B998F19b66F4baba5De1aed',
  JUSTICE: '0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1',

  MIN_FEE_WEI: 1000000000000000n,        // 0.001 ETH
  MIN_BALANCE: 100000n * 10n ** 18n,     // 100,000 $JUSTICE
  BODY_MAX_CHARS: 500,
  MAX_TAGS: 5,
  GENESIS_BLOCK: 0,

  // Testnet only. Hides the faucet button when false.
  FAUCET: true,
};
