# Deploying to Sepolia

Everything here has been rehearsed against a fork of Sepolia at block
11,659,572. The only step that needs your private key is the one you run.

## Before you start

You need a funded Sepolia account. The deploy costs about **2.27M gas**;
at the 1.09 gwei Sepolia was charging when this was written that is roughly
**0.0025 ETH**. Any Sepolia faucet covers it many times over.

Treasury is set to `0xe54A3CFB2Dbdfb8100c41fbFB04B4E9D4c7c3bA2`.

## 1. Deploy

Run this yourself — it needs your key, and nothing else in this repo ever
touches one.

```bash
cd ~/justicejournal/contracts

export SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
export TREASURY=0xe54A3CFB2Dbdfb8100c41fbFB04B4E9D4c7c3bA2

forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC \
  --broadcast \
  --private-key $YOUR_KEY
```

It deploys three contracts, because Sepolia has no real $JUSTICE and no
router worth trusting:

| contract | why |
|---|---|
| `TestJustice` | stand-in $JUSTICE with an open faucet, so anyone can clear the holding gate |
| `TestRouter` | stand-in DEX at a fixed rate, so the fee sweep can be exercised |
| `JusticeJournal` | the real thing |

The script refuses to put the two stand-ins on mainnet — the faucet is open
to anyone and the router swaps at a fixed rate.

## 2. Apply the addresses

The script prints them. Feed them to this, which updates the indexer config
and the page config together — they must agree on which contract is
canonical or they disagree about what counts as an entry.

```bash
cd ~/justicejournal
node scripts/apply-deployment.mjs --network sepolia \
  --journal  <JusticeJournal address> \
  --justice  <TestJustice address> \
  --treasury 0xe54A3CFB2Dbdfb8100c41fbFB04B4E9D4c7c3bA2 \
  --genesis  <the block number the script printed>
```

Then `npm test` and `npm run web`.

## 3. Publish the three entries

Acceptance needs one English, one Chinese, and one at the 500-character
limit. Either write them through the page at `http://127.0.0.1:8080/web/`,
or build the calldata and send it yourself:

```bash
node src/compose.mjs --author <your address> --seq 0 --tags assange \
  --body "…"
```

It prints a ready `cast send`. Claim test tokens first — the page has a
button, or:

```bash
cast send <TestJustice> "faucet()" --rpc-url $SEPOLIA_RPC --private-key $YOUR_KEY
```

## 4. Verify

```bash
node src/indexer.mjs --rpc $SEPOLIA_RPC --from <genesis>
node src/render.mjs && open out/journal.html
```

Run it twice; the two `out/index.json` must be byte-identical. Then have
someone else run it from a clean checkout and get the same file. That is
PRD §9 step 5, and it is the whole claim.

## What Sepolia cannot tell us

**There is no Ethscriptions indexer on Sepolia.** The canonical one runs on
mainnet only. Our ESIP-3 events will be structurally correct and our own
indexer will read them, but nothing on Sepolia will confirm that the
protocol treats the author as the initial owner, or that `rule=esip6`
behaves as specified.

Those two properties are the reason for the whole architecture, so on
mainnet the first entry must be cross-checked against
`api.ethscriptions.com`: `initial_owner` must be the author rather than the
contract, and `esip6` must be `true`.
