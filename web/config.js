// Deployment addresses. `forge script script/Deploy.s.sol` prints these.
// Keep them in step with src/config.mjs — the indexer and this page must
// agree on which contract is canonical or they will disagree about what
// counts as an entry.
window.JJ_CONFIG = {
  // Set by scripts/apply-deployment.mjs — edit through that, not by hand,
  // so src/config.mjs stays in step.
  CHAIN_ID: 1,
  CHAIN_NAME: 'Ethereum',
  EXPLORER: 'https://etherscan.io',

  // Read-only endpoint. The archive must be readable without connecting a
  // wallet — requiring one to read a public record would be absurd.
  // Tried in order until one answers. A list rather than one endpoint
  // because rebuilding the archive needs historical eth_getLogs, and most
  // free public nodes now refuse it — some outright, some past a ten-block
  // range. Depending on a single endpoint would mean the archive stops
  // being readable the day that endpoint changes its policy.
  READ_RPCS: [
    'https://rpc.mevblocker.io',
    'https://eth.api.onfinality.io/public',
    'https://ethereum-rpc.publicnode.com',
  ],

  // Passed to wallet_addEthereumChain when the wallet does not know this
  // network yet, so a mismatch is one click to fix rather than a dead end.
  CHAIN_PARAMS: {
    chainId: '0x1',
    chainName: 'Ethereum',
    nativeCurrency: {"name":"Ether","symbol":"ETH","decimals":18},
    rpcUrls: ['https://rpc.mevblocker.io'],
    blockExplorerUrls: ['https://etherscan.io'],
  },

  // Every canonical deployment, oldest first. A parameter change means a
  // new contract, and the archive has to span them or it ends at its own
  // first governance decision.
  JOURNALS: [
    { address: '0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a', fromBlock: 25932136, toBlock: null },
  ],
  JUSTICE: '0x59d1e836F7b7210A978b25a855085cc46fd090B5',

  // Must match what the contract was deployed with. The page previews
  // "the exact bytes that will be recorded", and without this it previewed
  // the default tag while the contract wrote another.
  PROTOCOL: 'justice-journal-test',

  MIN_FEE_WEI: 1000000000000000n,        // 0.001 ETH
  MIN_BALANCE: 100000n * 10n ** 18n,     // 100,000 $JUSTICE
  BODY_MAX_CHARS: 500,
  MAX_TAGS: 5,
  GENESIS_BLOCK: 25932136,

  // Testnet only. Hides the faucet button when false.
  FAUCET: false,
};
