# Contracts

`src/Indelebile.sol` is the whole on-chain part: it takes the fee, checks the
$JUSTICE holding gate, builds the entry's data URI with the caller's address
in it, and emits the ESIP-3 event that mints it as an ethscription owned by
the author. No storage, no owner, no upgradeability. See [../SPEC.md](../SPEC.md).

`src/testnet/` holds stand-ins for $JUSTICE and a DEX router, for local and
Sepolia use only. The deploy script refuses to put them on mainnet.

## Test

```bash
forge install foundry-rs/forge-std@v1.16.2 --no-git
forge test
```

`GasProbe.t.sol` and `NftCost.t.sol` are measurements rather than checks;
run them with `-vv` to see the numbers the documents quote.

## Deploy

See [../DEPLOY.md](../DEPLOY.md).
