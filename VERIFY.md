# Run the indexer yourself

The archive is only worth what an outsider can rebuild from the chain
without us. This is how to do that, and how to tell whether what you get
agrees with what this site publishes.

You need **Node 22 or later**, git, and an Ethereum RPC endpoint that
serves historical `eth_getLogs`. Nothing else: no key, no account, no
wallet.

```bash
git clone https://github.com/indelebile/indelebile
cd indelebile
npm ci
node src/indexer.mjs --rpc https://rpc.mevblocker.io
```

It prints the hash of the entries it derived:

```
entries sha256 0xb27e62d9e5d49097ba6e39a43d8d7f5e9ff15ff90ccb4f481e833162a60494fd
wrote out/index.json
```

**Compare that hash with the one under "The archive" on
https://indelebile.xyz**, and with the summary of any run of
[the publishing job](../../actions/workflows/publish.yml). All three are
derived the same way from the same chain; if they differ, one of them is
wrong, and the next section is about finding out which.

## Which RPC endpoints work

Public endpoints differ in what they will serve, and several refuse the
historical queries this needs. Tested 3 October 2026:

| endpoint | |
|---|---|
| `https://rpc.mevblocker.io` | works |
| `https://ethereum-rpc.publicnode.com` | works |
| `https://eth.drpc.org` | refuses ranges over 10,000 blocks on the free plan |
| `https://1rpc.io/eth` | usage limit |
| `https://rpc.ankr.com/eth` | needs an API key |
| `https://eth.merkle.io` | does not implement `eth_getLogs` |
| `https://eth.llamarpc.com` | returned an error page, not JSON |

Pass several, comma-separated, and each request falls through to the next
endpoint that will answer:

```bash
node src/indexer.mjs --rpc https://rpc.mevblocker.io,https://ethereum-rpc.publicnode.com
```

Your own node works too, and is the only version of this that depends on
nobody. `ETH_RPC_URL` is read if `--rpc` is absent.

## If your hash differs

In order of likelihood:

1. **You scanned to a different block.** The hash covers the entries, not
   the range — but an entry written since the other build will change it.
   Compare `builtAtBlock` in `out/index.json`, and rebuild both at the
   same height if they differ.
2. **Your endpoint silently truncated a range.** Some providers cap
   `eth_getLogs` and return a short result rather than an error, which
   looks exactly like "there were no entries in those blocks". This is
   the failure that is worth checking first, because nothing announces
   it. Re-run against a second endpoint; two independent endpoints
   agreeing is good evidence, one endpoint is not.
3. **You are pointed at a different deployment.** `src/config.mjs` lists
   the contracts, each with the block range it was canonical for, the
   genesis block, and the protocol tag. All three decide what counts.
4. **You are on a different commit.** `git rev-parse HEAD`, and compare.

A difference you cannot explain is worth reporting as an issue. The point
of publishing the rules is that disagreement is detectable.

## Keeping a copy current

```bash
node src/indexer.mjs --rpc <rpc> --watch 30
```

Watch mode fetches only new blocks but **re-derives the whole archive on
every tick**, so a long-running build cannot drift away from one built
from scratch. It stays five blocks behind the head, so a reorg at the tip
does not enter the archive.

## Reading what you built

```bash
npm run web        # http://127.0.0.1:8080, reads out/index.json
```

The page never queries the chain for entries. It reads the file the
indexer produced, which is the only way a reader can be sure the page
and the index agree.

## Writing a second implementation

**[`src/rules.mjs`](src/rules.mjs) is the protocol.** It is one predicate
over one event; everything else in this repository is plumbing around it.
Nothing on chain marks an entry apart from any other calldata — these
rules do.

`conformance/vectors.json` holds 28 cases, each an event and the verdict
the rules must reach, including two deployments with a deliberate gap
between them so that range handling is exercised rather than assumed.

```bash
npm test     # runs the vectors against this implementation
```

An implementation in another language agrees if it reaches the same
verdict on all 28 and the same `entriesHash` on the live archive. Us
writing a second one would not prove anything; somebody else writing one
is the only thing that shows the specification is complete.
