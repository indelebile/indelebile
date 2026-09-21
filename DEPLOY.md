# Deploying

One runbook for every network. There used to be two — a Sepolia guide and a
mainnet one — which left no way to tell which was current.

Nothing here handles a private key. The one command that needs yours is
yours to run.

---

## The shape of a deployment

Every contract parameter is **immutable**: the token, the treasury, the
fee, the gate, the router, and the protocol tag. Changing any of them means
deploying again, which is why `journalContracts` is a list of deployments
with block ranges rather than one address. Plan for at least one
redeployment — the arrival of a DAO multisig treasury guarantees it.

| variable | |
|---|---|
| `TREASURY` | required; where swept fees land |
| `JUSTICE` | real token, or a `TestJustice` with an open faucet is deployed |
| `ROUTER` | real router, or a `TestRouter` is deployed; `NO_ROUTER=true` deploys with none |
| `PROTOCOL` | `indelebile`, or `indelebile-test` for a rehearsal |
| `MIN_FEE` | wei, default 0.001 ETH |
| `MIN_BALANCE` | wei, default 100,000e18 |

The script refuses to put the test stand-ins on mainnet: the faucet is open
to anyone and the router swaps at a fixed rate.

---

## Locally

```bash
anvil --port 8547 &

cd contracts
TREASURY=0x000000000000000000000000000000000000BEEF \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8547 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Anvil pre-funds only its own built-in accounts, so your wallet address
starts with nothing on the local chain — which looks like a broken page
rather than an empty account. Give it some; the balance is invented:

```bash
cast rpc anvil_setBalance <your address> 0x21e19e0c9bab2400000 --rpc-url http://127.0.0.1:8547
```

## Sepolia

Sepolia has no real $JUSTICE and no router worth trusting, so the script
deploys stand-ins for both.

```bash
cd contracts
TREASURY=<yours> forge script script/Deploy.s.sol \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast --private-key $YOUR_KEY
```

**Sepolia cannot verify the two properties this architecture exists for.**
The canonical Ethscriptions indexer runs on mainnet only, so nothing on a
testnet can confirm that the protocol treats the author as the initial
owner, or that `rule=esip6` took effect. Those need mainnet.

## Mainnet

```bash
cd contracts
TREASURY=<yours> \
JUSTICE=0x59d1e836f7b7210a978b25a855085cc46fd090b5 \
NO_ROUTER=true \
PROTOCOL=indelebile-test \
  forge script script/Deploy.s.sol --rpc-url https://ethereum-rpc.publicnode.com \
  --broadcast --private-key $YOUR_KEY
```

Use `-i` instead of `--private-key` to be prompted rather than leaving the
key in shell history.

### Why those settings

**`PROTOCOL=indelebile-test` for anything but the real launch.**
Entries written while validating are permanent. Under the archive's own tag
they would be indistinguishable from it, and someone could fairly say the
archive had been started before the DAO decided to start it. V5 demands an
exact match, so the two sets are mutually invisible.

**`NO_ROUTER=true`.** `sweepAndBuy` speaks the Uniswap V2 interface, and
$JUSTICE's V2 pair holds about 0.011 WETH — sweeping 0.003 ETH through it
loses 22% to slippage. The liquidity that exists sits in a V3 1% pool this
interface cannot reach. With no router, `sweepAndBuy` is inert and
`sweepEth()` — permissionless, immutable destination — is the way out. Fees
accumulate as ETH until the DAO decides.

At current volumes, converting fees to $JUSTICE automatically is not
honest, and that bears directly on the fee-denomination decision.

---

## After deploying

```bash
node scripts/apply-deployment.mjs --network mainnet --protocol indelebile-test \
  --journal <address> --justice <address> --treasury <address> --genesis <block>
```

Add `--supersede` when entries already exist under a previous contract: it
closes the outgoing range and appends rather than replacing, so the archive
spans both. Without it those entries silently stop being entries.

The script reads both configs back and refuses if what it asked for is not
what landed.

Then write **one** entry and, before writing another:

```bash
node scripts/verify-mainnet.mjs --tx <the entry's transaction hash>
```

It checks the six things only the canonical indexer can answer. **If
`initial_owner` is not the author, or `esip6` is not true, stop.** That is
the whole point of deploying at all.

---

## What the mainnet rehearsal established

Contract `0x3F06F46Fd1ff8B0f4ec6F2022568C8F660ee035a`, block 25932137,
deployed for 0.00021 ETH, under the project's working name and the tag
`justice-journal-test`. One entry, `0xdf4f13fb…`, reported by the
canonical indexer as **ethscription #16251113**:

```
creator        0x3f06f46f…   the contract, as ESIP-3 specifies
initial_owner  0xeb4745c5…   the author — not the contract, not the treasury
esip6          true
```

Facts worth carrying forward:

| | |
|---|---|
| $JUSTICE | `0x59d1e836f7b7210a978b25a855085cc46fd090b5`, 18 decimals |
| the holding gate | 100,000 $JUSTICE was worth about **$2.29** — close to no barrier |
| liquidity | V2 pair ~$26; the real pool is Uniswap V3 1%, ~$7,200 |
| an entry | 41,233 gas for 113 English characters, 83,950 for 500 Chinese |
| gas at the time | 0.154 gwei, which put the whole exercise under a dollar |

Entries written through an **EIP-7702 smart-account wallet** still resolve
ownership correctly — `msg.sender` remains the author — but carry roughly
90,000 gas of account-abstraction overhead. That is the wallet's cost, not
the Journal's, but it makes measurements taken through one useless.

---

## Still to come, for the real deployment

- The treasury is AssangeDAO's own: `assangedao.eth` =
  `0x7BE99ca4E6893ef57cf349ab56307628100feA00`, a Safe with a 3-of-9
  threshold. It is immutable, so that means deploying again.
- The rehearsal wrote under a different tag, so its entries are invalid
  under the new one whatever the list says. Start a fresh archive: list
  the new contract alone, with its own genesis block, and no `--supersede`.
- Inscribe the reading rules (`node scripts/inscribe-rules.mjs`), so the
  instructions for rebuilding the archive stop living only in this
  repository.
