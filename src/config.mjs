import { TAG_PATTERN } from './canonical.mjs';

// Justice Journal — protocol parameters.
// Everything the DAO votes on lives here. Changing any value changes the
// resulting index, so a change must be a governance action with an
// effective-from block, never a silent edit. See SPEC.md §6.

export const PARAMS = {
  // The canonical contracts, in deployment order. A log from anywhere else
  // is not an entry.
  //
  // This is a list, not one address, because every parameter in the
  // contract is immutable: changing the fee, the gate, or the treasury
  // means deploying again. With a single address the archive would end at
  // its own first governance decision and every entry written before it
  // would fall outside the rules. Instead each deployment covers a block
  // range, and the archive spans all of them — sequence numbers, rate
  // limits and content uniqueness carry across the boundary, so an author
  // cannot reset their history by migrating.
  //
  // `toBlock: null` means "still current". Set it when superseding.
  journalContracts: [
    { address: '0xb196fCfC583F0B3770F05d94B17cfAe70f4edf4E', fromBlock: 11659670, toBlock: null,
      note: 'Sepolia validation deployment' },
  ],

  // Where swept fees land. The contract holds it immutably, so this is
  // recorded here for verifiers, not used to decide validity.
  treasury: '0xe54A3CFB2Dbdfb8100c41fbFB04B4E9D4c7c3bA2', // Sepolia

  // Per-entry write fee, in wei. This is the real anti-spam cost.
  minFeeWei: 1_000_000_000_000_000n, // 0.001 ETH

  // Holding gate, enforced inside write(). A holding gate is per wallet
  // while writing is per entry, so it filters non-holders and nothing
  // more — minFeeWei is the actual per-entry spam cost.
  justiceToken: '0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a', // Sepolia
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

  // Block before which no entry is valid — the first contract's start.
  genesisBlock: 11659670,
};

export { PROTOCOL, VERSION, MIME, DATA_URI_PREFIX } from './canonical.mjs';
