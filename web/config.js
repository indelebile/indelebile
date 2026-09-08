// Deployment addresses. `forge script script/Deploy.s.sol` prints these.
// Keep them in step with src/config.mjs — the indexer and this page must
// agree on which contract is canonical or they will disagree about what
// counts as an entry.
window.JJ_CONFIG = {
  // Set by scripts/apply-deployment.mjs — edit through that, not by hand,
  // so src/config.mjs stays in step.
  CHAIN_ID: 11155111,
  CHAIN_NAME: 'Sepolia',
  EXPLORER: 'https://sepolia.etherscan.io',

  // Read-only endpoint. The archive must be readable without connecting a
  // wallet — requiring one to read a public record would be absurd.
  READ_RPC: 'https://ethereum-sepolia-rpc.publicnode.com',

  // Passed to wallet_addEthereumChain when the wallet does not know this
  // network yet, so a mismatch is one click to fix rather than a dead end.
  CHAIN_PARAMS: {
    chainId: '0xaa36a7',
    chainName: 'Sepolia',
    nativeCurrency: {"name":"Sepolia Ether","symbol":"ETH","decimals":18},
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },

  // Every canonical deployment, oldest first. A parameter change means a
  // new contract, and the archive has to span them or it ends at its own
  // first governance decision.
  JOURNALS: [
    { address: '0xb196fCfC583F0B3770F05d94B17cfAe70f4edf4E', fromBlock: 11659670, toBlock: null },
  ],
  JUSTICE: '0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a',

  MIN_FEE_WEI: 1000000000000000n,        // 0.001 ETH
  MIN_BALANCE: 100000n * 10n ** 18n,     // 100,000 $JUSTICE
  BODY_MAX_CHARS: 500,
  MAX_TAGS: 5,
  GENESIS_BLOCK: 11659670,

  // Testnet only. Hides the faucet button when false.
  FAUCET: true,
};
