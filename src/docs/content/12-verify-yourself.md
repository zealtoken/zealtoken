---
title: Verify it yourself
group: Start here
---
# Verify it yourself

> **In one breath.** Every number on the site is a public view on a contract or a public Zcash address. This page gives you the addresses, the explorer links, and the raw calls so you can check them without trusting the site, the docs, or us.

## Source code

| Contract | Explorer |
|---|---|
| ZealFoundry | [Blockscout](https://robinhoodchain.blockscout.com/address/0xa1C1Fb281cCC47C587565a01700bF61a03D885a6?tab=contract) |
| ZealTapV2 | [Blockscout](https://robinhoodchain.blockscout.com/address/0x9F5b105d0DBee12376aC972Ec2207772c5EDbB47?tab=contract) |
| ZZEC | [Blockscout](https://robinhoodchain.blockscout.com/address/0x0b151Ff7a7c5250130EC16C275790961d558E402?tab=contract) |
| ZealFurnaceV4 | [Blockscout](https://robinhoodchain.blockscout.com/address/0x72C2f71dC3c0058974fd59039F9A79397bf87E70?tab=contract) |
| ZealBurnHook | [Blockscout](https://robinhoodchain.blockscout.com/address/0x16642362837e2FDC02fF1ECF71f5629c094B0044?tab=contract) |
| RedemptionDesk | [Blockscout](https://robinhoodchain.blockscout.com/address/0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a?tab=contract) · [Sourcify](https://repo.sourcify.dev/4663/0x9A1f622C2267fCdBD664D259A27b057B53E9cA1a) |
| WrapDesk | [Blockscout](https://robinhoodchain.blockscout.com/address/0xb53E3CD58668D1fC9082b51a7d74879733e9E118?tab=contract) · [Sourcify](https://repo.sourcify.dev/4663/0xb53E3CD58668D1fC9082b51a7d74879733e9E118) |
| Everything | [github.com/zealtoken/zealtoken](https://github.com/zealtoken/zealtoken) |

## The reserve

{{viz:coverage}}

[t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw on the Zcash explorer](https://mainnet.zcashexplorer.app/address/t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw). Compare its balance to `reserveZats()` on ZZEC and to `zZEC` `totalSupply()`. Coverage is the first divided by the second.

## Raw calls

Robinhood Chain RPC: `https://rpc.mainnet.chain.robinhood.com` (chain id 4663). Any of these can be sent as `eth_call` with `to` set to the contract and `data` set to the selector.

| Read | Contract | Selector |
|---|---|---|
| `reserveZats()` | ZZEC | `0xb63374ee` |
| `totalSupply()` | ZZEC | `0x18160ddd` |
| `coverageBps()` | ZZEC | `0x48ebfe9c` |
| `lastAttestationAt()` | ZZEC | `0x8e353f4c` |
| `totalZealBurned()` | Furnace | `0xa0024092` |
| `burnCount()` | Furnace | `0x524773ce` |
| `totalEthConsumed()` | Furnace | `0x59ff3df5` |
| `totalZzecConsumed()` | Furnace | `0x3dff8184` |
| `balanceOf(address)` | Pons escrow | `0x70a08231` + address |
| `pendingFees(bytes32,address)` | Pons hook | `0x359b4f30` |
| `requestCount()` | either desk | `0x5badbe4c` |
| `summary(uint256)` | either desk | `0x6152e655` + id |

Example, the attested reserve:

```
curl -s https://rpc.mainnet.chain.robinhood.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x0b151Ff7a7c5250130EC16C275790961d558E402","data":"0xb63374ee"},"latest"]}'
```

The result is a hex integer in zatoshi. Divide by 100,000,000 for ZEC.

## The pool

Pool id `0xa6d41767e205c89fe05d7ad78354af7bb98cbe9b0c3c60f8371b05e7087fdb84` is `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))` with `(0x0, zZEC, 3000, 60, hook)`. `getSlot0(poolId)` on StateView `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b` returns the square-root price; `getLiquidity(poolId)` the active liquidity.

## The live reserve endpoint

`GET https://zealtoken.com/api/reserve` returns `{address, zats, zec, height, hash, source, at}`, read from lightwalletd when called. It holds no keys and accepts no parameters. Compare `hash` to the Zcash explorer's block at `height`.

## Build log

Every deploy, migration, and first-of-its-kind transaction is listed with its hash in the site's build log, in the Roadmap section.
