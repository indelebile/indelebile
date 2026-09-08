# Mainnet validation deployment

The proposal cannot go to the DAO on Sepolia evidence. Sepolia has no
Ethscriptions indexer, so it cannot confirm the two properties the entire
architecture exists for: that the protocol treats the **author** as the
initial owner, and that `rule=esip6` behaves as specified. Those have to be
demonstrated on mainnet or the proposal has a hole exactly where it matters.

Rehearsed against a fork of mainnet at block 25931593. Everything below
worked there with the real $JUSTICE token.

## Facts established

| | |
|---|---|
| $JUSTICE | `0x59d1e836f7b7210a978b25a855085cc46fd090b5`, 18 decimals, 16.9B supply |
| Price | $0.00002287 — **the 100,000 token holding gate is worth about $2.29** |
| Liquidity | Uniswap V2 pair holds 0.011 WETH (~$26); the real pool is Uniswap V3 1%, 2.9 WETH (~$7,200) |
| Gas | 0.154 gwei at the time of writing — unusually cheap |

## Why the deployment carries no router

`sweepAndBuy` speaks the Uniswap V2 interface, and the V2 pair is
effectively dead: sweeping 0.003 ETH through it costs **22% to slippage**.
The liquidity that exists is on V3, which this interface cannot reach.

So mainnet deploys with `NO_ROUTER=true`: `sweepAndBuy` is inert and
`sweepEth()` — whose destination is immutable — is the only way out. Fees
accumulate as ETH until the DAO decides what to do with them. That is
honest at this liquidity; an automatic swap would not be.

This is worth putting in the proposal on its own: **at current volumes,
converting fees to $JUSTICE automatically is not viable**, which bears
directly on the fee-denomination decision.

## Cost

| | gas | @0.154 gwei |
|---|---|---|
| Deploy JusticeJournal alone | 408,111 | ~$0.15 |
| One 113-character English entry | 41,233 | ~$0.02 |
| One 500-character Chinese entry | 83,950 | ~$0.03 |
| Inscribe the reading rules | 79,800 | ~$0.03 |

Under a dollar for the whole exercise at present gas. This will not last;
if the window closes the numbers rise proportionally, and nothing else
changes.

## The treasury cannot be changed later

Every parameter in the contract is immutable, the treasury included. When
AssangeDAO provides its multisig, **the contract must be deployed again** —
there is no setter and there should not be one.

That has a consequence worth stating plainly: a new deployment is a new
address, and under a single-address rule every entry written before it
would stop being an entry. The archive would end at its own first
governance decision.

So the indexer reads a **list** of canonical deployments, each covering a
block range. Sequence numbers, rate limits and content uniqueness carry
across the boundary, so an author cannot reset their history by migrating,
and a retired contract's later emissions are not entries. Superseding is an
explicit action:

```bash
node scripts/apply-deployment.mjs --network mainnet --supersede \
  --journal <new> --justice 0x59d1e836… --treasury <DAO multisig> --genesis <block>
```

This makes the validation deployment below genuinely useful rather than
throwaway: entries written under it can be carried into the final archive
if the DAO wants them, or left out by simply not listing it.

## Still needed before deploying

| | |
|---|---|
| **Address** | The Sepolia wallet holds 0 ETH and 0 $JUSTICE on mainnet. Which address writes the first entry? It needs ≥100,000 $JUSTICE at the block before it writes. |
| **Treasury** | For the validation deployment, an address you control. The real one must come from AssangeDAO and should be a multisig — and needs a second deployment, which the list above makes safe. |
| **minFee** | 0.001 ETH ≈ $2.48. Reasonable, or lower while validating? Immutable. |
| **minBalance** | 100,000 $JUSTICE ≈ $2.29 is close to no barrier. Keep it as the proposal specifies, or raise it? Immutable. |

## The rehearsal runs under a different protocol tag

Entries written while validating are permanent, real ethscriptions. They
must not be readable as part of the archive — otherwise someone can
reasonably say the archive was started before the DAO decided to start it.

So the rehearsal deploys with `PROTOCOL=justice-journal-test`. The tag is
inside every entry's content, and the production rules require an exact
match (V5), so the two sets can never mix in either direction. Tested both
ways.

Nothing else differs. The contract, the assembly, the fee, the gate, the
event, the calldata shape — all the production code path. Only the string
constant changes, and `headLen` is derived from it rather than written
down twice, so the two cannot drift.

This lets the proposal say something otherwise unavailable: **the archive
is empty. Not one entry exists. It begins when the DAO says it begins.**

Transitioning is a deployment, not a migration: deploy again with the real
tag and the DAO's multisig treasury, list it, and leave the rehearsal
contract off the list. Nothing has to be moved or rewritten.

## Sequence

```bash
cd contracts
export MAINNET_RPC=https://ethereum-rpc.publicnode.com
export TREASURY=<an address you control; the DAO multisig comes later>
export JUSTICE=0x59d1e836f7b7210a978b25a855085cc46fd090b5
export NO_ROUTER=true
export PROTOCOL=justice-journal-test

forge script script/Deploy.s.sol --rpc-url $MAINNET_RPC --broadcast --private-key $YOUR_KEY
```

Then apply the addresses, write one entry, and **before writing any more**,
cross-check it:

```bash
node scripts/verify-mainnet.mjs --tx <the entry's transaction hash>
```

That is the whole point of the exercise. If `initial_owner` is not the
author, or `esip6` is not true, stop and do not write a second entry.
