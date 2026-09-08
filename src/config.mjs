import { TAG_PATTERN } from './canonical.mjs';

// Justice Journal — protocol parameters.
// Everything the DAO votes on lives here. Changing any value changes the
// resulting index, so a change must be a governance action with an
// effective-from block, never a silent edit. See SPEC.md §6.

export const PARAMS = {
  // The JusticeJournal contract. Entries are ESIP-3 logs emitted by this
  // address and nothing else; a log from anywhere else is not an entry.
  journalContract: '0x68B1D87F95878fE05B998F19b66F4baba5De1aed', // Anvil (local)

  // Where swept fees land. The contract holds it immutably, so this is
  // recorded here for verifiers, not used to decide validity.
  treasury: '0xe54A3CFB2Dbdfb8100c41fbFB04B4E9D4c7c3bA2', // Anvil (local)

  // Per-entry write fee, in wei. This is the real anti-spam cost.
  minFeeWei: 1_000_000_000_000_000n, // 0.001 ETH

  // Holding gate, enforced inside write(). A holding gate is per wallet
  // while writing is per entry, so it filters non-holders and nothing
  // more — minFeeWei is the actual per-entry spam cost.
  justiceToken: '0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1', // Anvil (local)
  minJusticeBalance: 100_000n * 10n ** 18n,

  // Rate limit, enforced by the indexer over a trailing window of blocks.
  // Closes the gap that a per-wallet holding gate leaves open.
  maxEntriesPerAuthorPerWindow: 3,
  rateLimitWindowBlocks: 50_400, // ~7 days at 12s blocks

  // Content limits. bodyMaxChars counts Unicode code points, not bytes, so
  // a Chinese entry gets the same allowance as an English one.
  bodyMaxChars: 500,
  maxTags: 5,
  tagMaxChars: 32,
  tagPattern: TAG_PATTERN,

  // Block before which no entry is valid. Set at launch.
  genesisBlock: 0,
};

export { PROTOCOL, VERSION, MIME, DATA_URI_PREFIX } from './canonical.mjs';
