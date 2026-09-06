import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { mineSalt } from '../scripts/deploy-hook'

/**
 * Full zealz.fun lifecycle on a fork of Robinhood Chain: deploy hook + factory + locker,
 * launch a capital-free token, buy and sell it through the real Universal Router,
 * confirm the hook's cuts land, then compound the locked position's fees.
 *   FORK=1 FORK_URL=https://rpc.mainnet.chain.robinhood.com npx hardhat test test/ZealzFork.test.ts
 */
const ON = process.env.FORK === '1'
const CREATE2 = '0x4e59b44847b379578588920cA78FbF26c0B4956C'
const POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951', POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7', STATE_VIEW = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const UR = '0x8876789976decbfcbbbe364623c63652db8c0904', PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402', FURNACE = '0x72C2f71dC3c0058974fd59039F9A79397bf87E70'
const DEPLOYER = '0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03', TRADER = '0x19cece80126b79F76D8b8297B876310a56349738' // keeper: holds zZEC
const abi = ethers.AbiCoder.defaultAbiCoder()
const KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
const tickFor = (price: number, spacing: number) => { const t = Math.floor(Math.log(price) / Math.log(1.0001)); return Math.floor(t / spacing) * spacing }

;(ON ? describe : describe.skip)('zealz.fun on a Robinhood Chain fork', function () {
  this.timeout(600_000)
  it('launches with no capital, trades through the router with the hook taking its cut, and compounds the lock', async () => {
    const imp = async (a: string) => { await network.provider.send('hardhat_impersonateAccount', [a]); await network.provider.send('hardhat_setBalance', [a, '0x56bc75e2d63100000']); return ethers.getSigner(a) }
    const deployer = await imp(DEPLOYER), trader = await imp(TRADER)
    const [treasury, creator] = await ethers.getSigners()
    // opening market cap 0.1 zZEC for the whole supply, expressed as a tick for both currency orderings
    const openPrice0 = 0.1e8 / 1e27, openTick0 = tickFor(openPrice0, 60), openTick1 = tickFor(1 / openPrice0, 60)
    // hook needs the factory address: predict it (deploy hook first via CREATE2, then the factory is the next CREATE)
    const Hook = await ethers.getContractFactory('ZealzHook')
    const nonce = await ethers.provider.getTransactionCount(DEPLOYER)
    const factoryAddr = ethers.getCreateAddress({ from: DEPLOYER, nonce: nonce + 1 })
    const initCode = ethers.concat([Hook.bytecode, abi.encode(['address', 'address', 'address', 'address', 'address'], [POOL_MANAGER, factoryAddr, FURNACE, treasury.address, ZZEC])])
    const { salt, address: hookAddr } = mineSalt(ethers.keccak256(initCode), 0x00ccn) // beforeSwap + afterSwap, both returning deltas
    await (await deployer.sendTransaction({ to: CREATE2, data: ethers.concat([salt, initCode]) })).wait()
    expect(await ethers.provider.getCode(hookAddr)).to.not.equal('0x')
    const factory = await (await ethers.getContractFactory('ZealzFactory', deployer)).deploy(POSM, PERMIT2, POOL_MANAGER, ZZEC, hookAddr, treasury.address, 500_000n, openTick0, openTick1) // launch fee 0.005 zZEC
    expect(await factory.getAddress()).to.equal(factoryAddr)
    const locker = await (await ethers.getContractFactory('ZealzLocker', deployer)).deploy(POSM, POOL_MANAGER, PERMIT2, factoryAddr)
    await factory.setLocker(await locker.getAddress())
    // the creator pays the launch fee in zZEC: fund them from the trader wallet and approve the factory
    const zzecW = new ethers.Contract(ZZEC, ['function transfer(address,uint256) returns (bool)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'], trader)
    await (await zzecW.transfer(creator.address, 2_000_000n)).wait()
    await (await zzecW.connect(creator).approve(factoryAddr, 2_000_000n)).wait()
    const treasuryZzec0 = await zzecW.balanceOf(treasury.address)

    // ---- launch, capital free
    const tx = await factory.connect(creator).launch('Zebra Foundry', 'ZBRA', 'ipfs://zbra', 0, 0, 200, 75, 50) // Gentle, Batch, 2% total: 0.75% burn / 0.5% creator / 0.5% platform / 0.25% to holders
    expect((await zzecW.balanceOf(treasury.address)) - treasuryZzec0).to.equal(500_000n) // launch fee landed in treasury as zZEC
    const rc = await tx.wait()
    const ev = rc!.logs.map((l) => { try { return factory.interface.parseLog(l) } catch { return null } }).find((e) => e?.name === 'Launched')!
    const token = ev.args.token as string, positionId = ev.args.positionId as bigint, poolId = ev.args.poolId as string
    const posm = new ethers.Contract(POSM, ['function ownerOf(uint256) view returns (address)', 'function getPositionLiquidity(uint256) view returns (uint128)'], ethers.provider)
    expect(await posm.ownerOf(positionId)).to.equal(await locker.getAddress())
    const L0 = await posm.getPositionLiquidity(positionId); expect(L0).to.be.gt(0n)
    const erc = (a: string) => new ethers.Contract(a, ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function totalSupply() view returns (uint256)'], ethers.provider)
    expect(await erc(token).balanceOf(creator.address)).to.equal(0n) // no creator bag
    expect(await erc(token).balanceOf(factoryAddr)).to.equal(0n)
    const sv = new ethers.Contract(STATE_VIEW, ['function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)', 'function getLiquidity(bytes32) view returns (uint128)'], ethers.provider)
    const s0 = await sv.getSlot0(poolId)
    const tokenIs0 = token.toLowerCase() < ZZEC.toLowerCase()
    console.log(`      token ${token} is currency${tokenIs0 ? 0 : 1} · open tick ${s0[1]} · liquidity ${L0}`)

    // ---- the batch opening: buys in the first 10 minutes are bids, sells are refused
    const key = { currency0: tokenIs0 ? token : ZZEC, currency1: tokenIs0 ? ZZEC : token, fee: 3000, tickSpacing: 60, hooks: hookAddr }
    const hook = await ethers.getContractAt('ZealzHook', hookAddr)
    const swap = async (zeroForOne: boolean, amountIn: bigint, hookData = '0x', minOut = 0n) => {
      const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f])
      const input = zeroForOne ? key.currency0 : key.currency1, output = zeroForOne ? key.currency1 : key.currency0
      // Robinhood Chain's Universal Router is a modified v4-periphery build: ExactInputSingleParams carries a
      // uint256 minHopPriceX36 before hookData. Without it the struct only decodes by luck when currency0 is ETH.
      const params = [abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`], [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minOut, minHopPriceX36: 0n, hookData }]), abi.encode(['address', 'uint256'], [input, amountIn]), abi.encode(['address', 'uint256'], [output, minOut])]
      const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600 * 24 * 365])
      await (await (erc(input).connect(trader) as ethers.Contract).approve(PERMIT2, ethers.MaxUint256)).wait()
      await (await new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)'], trader).approve(input, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 86400 * 365)).wait()
      await (await trader.sendTransaction({ to: UR, data })).wait()
    }
    expect(await hook.inOpening(poolId)).to.equal(true)
    const bidderB = ethers.Wallet.createRandom().address
    await swap(!tokenIs0, 300_000n) // bid 1: attributed to tx.origin (the trader)
    await swap(!tokenIs0, 100_000n, abi.encode(['address'], [bidderB])) // bid 2: attributed via hookData
    expect(await erc(token).balanceOf(TRADER)).to.equal(0n) // nothing bought yet: it is a bid
    expect((await hook.openings(poolId)).totalBids).to.equal(400_000n)
    expect(await erc(ZZEC).balanceOf(hookAddr)).to.equal(400_000n)
    const s0b = await sv.getSlot0(poolId); expect(s0b[1]).to.equal(s0[1]) // pool untouched during the opening
    await expect(hook.settle(poolId)).to.be.revertedWithCustomError(hook, 'OpeningNotOver')
    await network.provider.send('evm_increaseTime', [601]); await network.provider.send('evm_mine', [])
    const furnaceBeforeSettle = await erc(ZZEC).balanceOf(FURNACE)
    expect(await hook.inOpening(poolId)).to.equal(false)
    await (await hook.settle(poolId)).wait()
    const tokensOut = (await hook.openings(poolId)).tokensOut; expect(tokensOut).to.be.gt(0n)
    await (await hook.connect(trader).claim(poolId)).wait()
    const claimedA = await erc(token).balanceOf(TRADER)
    expect(claimedA).to.equal((tokensOut * 300_000n) / 400_000n) // same price for everyone, pro rata
    await expect(hook.connect(trader).claim(poolId)).to.be.revertedWithCustomError(hook, 'NothingToClaim')
    console.log(`      opening: 2 bids (0.003 + 0.001 zZEC) settled in one swap -> ${ethers.formatEther(tokensOut)} ZBRA; trader claimed ${ethers.formatEther(claimedA)}`)

    expect((await erc(ZZEC).balanceOf(FURNACE)) - furnaceBeforeSettle).to.equal(3_000n) // the settlement swap paid 0.75% of the 0.004 zZEC batch to the Furnace

    // ---- after the opening: normal trades through the Universal Router
    const buyIn = 1_000_000n // 0.01 zZEC
    const tokBefore = await erc(token).balanceOf(TRADER), creatorZ0 = await erc(ZZEC).balanceOf(creator.address), furnaceZ0 = await erc(ZZEC).balanceOf(FURNACE)
    const sOpen = await sv.getSlot0(poolId)
    await swap(!tokenIs0, buyIn)
    const got = (await erc(token).balanceOf(TRADER)) - tokBefore
    expect(got).to.be.gt(0n)
    const creatorCut = (await erc(ZZEC).balanceOf(creator.address)) - creatorZ0, furnaceCutBuy = (await erc(ZZEC).balanceOf(FURNACE)) - furnaceZ0
    expect(creatorCut).to.equal(buyIn / 200n) // 0.5% of the zZEC paid on a buy goes to the creator, in zZEC
    expect(furnaceCutBuy).to.equal((buyIn * 75n) / 10_000n) // and 0.75% to the Furnace: buys burn too
    const s1 = await sv.getSlot0(poolId)
    console.log(`      bought ${ethers.formatEther(got)} ZBRA for 0.01 zZEC · creator got ${Number(creatorCut) / 1e8} zZEC · Furnace ${Number(furnaceCutBuy) / 1e8} zZEC · tick ${sOpen[1]} -> ${s1[1]}`)
    expect(tokenIs0 ? s1[1] > sOpen[1] : s1[1] < sOpen[1]).to.equal(true) // price of the token rose

    // ---- sell half back: the zZEC output pays the Furnace 1%
    const furnaceBefore = await erc(ZZEC).balanceOf(FURNACE)
    await swap(tokenIs0, got / 2n)
    const furnaceGot = (await erc(ZZEC).balanceOf(FURNACE)) - furnaceBefore
    expect(furnaceGot).to.be.gt(0n)
    console.log(`      sold half · Furnace received ${Number(furnaceGot) / 1e8} zZEC`)

    // ---- dividends: the trader holds the token, so the sell's to holders zZEC is theirs to claim
    const rtok = new ethers.Contract(token, ['function dividendsOf(address) view returns (uint256)', 'function claimDividends() returns (uint256)', 'function distributedTotal() view returns (uint256)', 'function eligibleSupply() view returns (uint256)'], trader)
    const owed = await rtok.dividendsOf(TRADER)
    expect(owed).to.be.gt(0n)
    expect(await rtok.dividendsOf(POOL_MANAGER)).to.equal(0n) // the pool never earns dividends
    const zBefore = await erc(ZZEC).balanceOf(TRADER)
    await (await rtok.claimDividends()).wait()
    expect((await erc(ZZEC).balanceOf(TRADER)) - zBefore).to.equal(owed)
    console.log(`      dividends · ${Number(await rtok.distributedTotal()) / 1e8} zZEC distributed, trader claimed ${Number(owed) / 1e8} zZEC`)

    // ---- exact-OUTPUT swaps, both directions, through a bare v4 router: the fee still comes off the zZEC leg
    const tr = await (await ethers.getContractFactory('TestSwapRouter', trader)).deploy(POOL_MANAGER)
    const trAddr = await tr.getAddress()
    const zzecT = new ethers.Contract(ZZEC, ['function approve(address,uint256) returns (bool)'], trader)
    await (await zzecT.approve(trAddr, 10_000_000n)).wait()
    await (await new ethers.Contract(token, ['function approve(address,uint256) returns (bool)'], trader).approve(trAddr, ethers.parseEther('1000000000'))).wait()
    const MIN_P = 4295128739n + 1n, MAX_P = 1461446703485210103287273052203988822378723970342n - 1n
    // exact-out BUY: ask for exactly 1,000,000 ZBRA; zZEC is the unspecified input, afterSwap takes the fee from it
    { const f0 = await erc(ZZEC).balanceOf(FURNACE), z0 = await erc(ZZEC).balanceOf(TRADER), t0 = await erc(token).balanceOf(TRADER)
      await (await tr.swap(key, !tokenIs0, ethers.parseEther('1000000'), !tokenIs0 ? MIN_P : MAX_P)).wait()
      const paid = z0 - (await erc(ZZEC).balanceOf(TRADER)), fGot = (await erc(ZZEC).balanceOf(FURNACE)) - f0
      expect((await erc(token).balanceOf(TRADER)) - t0).to.equal(ethers.parseEther('1000000'))
      expect((fGot * 10_000n) / 75n).to.be.within((paid * 97n) / 100n, paid) // the Furnace's 0.75% is of the zZEC the pool reports as input, a hair under what the trader paid with the LP fee
      console.log(`      exact-out buy · paid ${paid} zats for 1,000,000 ZBRA · Furnace ${fGot}`) }
    // exact-out SELL: ask for exactly 50,000 zats out; zZEC is the specified output, beforeSwap takes the fee on top
    { const f0 = await erc(ZZEC).balanceOf(FURNACE), z0 = await erc(ZZEC).balanceOf(TRADER)
      await (await tr.swap(key, tokenIs0, 50_000n, tokenIs0 ? MIN_P : MAX_P)).wait()
      expect((await erc(ZZEC).balanceOf(TRADER)) - z0).to.equal(50_000n) // the trader gets exactly what they asked for
      expect((await erc(ZZEC).balanceOf(FURNACE)) - f0).to.equal(375n) // and the Furnace its 0.75% of it
      console.log(`      exact-out sell · trader received exactly 50,000 zats · Furnace 375`) }

    // ---- compound: fees back into the lock, liquidity only rises
    await (await locker.compound(positionId)).wait()
    const L1 = await posm.getPositionLiquidity(positionId)
    expect(L1).to.be.gt(L0)
    console.log(`      compounded · liquidity ${L0} -> ${L1} (+${((Number(L1 - L0) / Number(L0)) * 100).toFixed(4)}%)`)

    // ---- an INSTANT launch trades from the first block, no bids, no settlement
    const rc2 = await (await factory.connect(creator).launch('Halo', 'HALO', 'ipfs://halo', 1, 1, 500, 50, 0)).wait() // Steep, Instant, 5% total: 0.5% burn / 0 creator / 0.5% platform / 4% to holders // Steep, Instant
    const ev2 = rc2!.logs.map((l) => { try { return factory.interface.parseLog(l) } catch { return null } }).find((e) => e?.name === 'Launched')!
    const token2 = ev2.args.token as string, poolId2 = ev2.args.poolId as string, t2Is0 = token2.toLowerCase() < ZZEC.toLowerCase()
    expect(await hook.inOpening(poolId2)).to.equal(false)
    const key2 = { currency0: t2Is0 ? token2 : ZZEC, currency1: t2Is0 ? ZZEC : token2, fee: 3000, tickSpacing: 60, hooks: hookAddr }
    const swap2 = async (zeroForOne: boolean, amountIn: bigint) => {
      const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f]); const input = zeroForOne ? key2.currency0 : key2.currency1, output = zeroForOne ? key2.currency1 : key2.currency0
      const params = [abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`], [{ poolKey: key2, zeroForOne, amountIn, amountOutMinimum: 0n, minHopPriceX36: 0n, hookData: '0x' }]), abi.encode(['address', 'uint256'], [input, amountIn]), abi.encode(['address', 'uint256'], [output, 0n])]
      const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600 * 24 * 365])
      await (await trader.sendTransaction({ to: UR, data })).wait()
    }
    const fz0 = await erc(ZZEC).balanceOf(FURNACE), tz0 = await erc(ZZEC).balanceOf(treasury.address)
    await swap2(!t2Is0, 200_000n)
    expect(await erc(token2).balanceOf(TRADER)).to.be.gt(0n) // bought straight away
    expect((await erc(ZZEC).balanceOf(FURNACE)) - fz0).to.equal(1_000n) // 0.5% of 200,000 on a 5% token
    expect((await erc(ZZEC).balanceOf(treasury.address)) - tz0).to.equal(1_000n) // platform 0.5%, fixed whatever the total
    const rt2 = new ethers.Contract(token2, ['function pending() view returns (uint256)', 'function distributedTotal() view returns (uint256)'], ethers.provider)
    expect((await rt2.pending()) + (await rt2.distributedTotal())).to.equal(8_000n) // 4% to holders // 4.5% to holders (held as pending until holders exist, since the fee is taken before the buyer holds anything)
    console.log(`      instant launch: bought ${ethers.formatEther(await erc(token2).balanceOf(TRADER))} HALO in the first block`)

    // ---- APE WITH ETH: one transaction, ETH -> zZEC (our market, burn hook) -> token (zealz hook), through the Universal Router
    const BURN_HOOK = '0x16642362837e2FDC02fF1ECF71f5629c094B0044'
    const PATH_T = 'tuple(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)'
    const twoHop = async (tokenOut: string, ethIn: bigint) => {
      const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x07, 0x0c, 0x0f]) // SWAP_EXACT_IN, SETTLE_ALL, TAKE_ALL
      const params = [
        abi.encode([`tuple(address currencyIn,${PATH_T}[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)`], [{ currencyIn: ethers.ZeroAddress, path: [
          { intermediateCurrency: ZZEC, fee: 3000, tickSpacing: 60, hooks: BURN_HOOK, hookData: '0x' },
          { intermediateCurrency: tokenOut, fee: 3000, tickSpacing: 60, hooks: hookAddr, hookData: '0x' },
        ], minHopPriceX36: [], amountIn: ethIn, amountOutMinimum: 0n }]),
        abi.encode(['address', 'uint256'], [ethers.ZeroAddress, ethIn]),
        abi.encode(['address', 'uint256'], [tokenOut, 0n]),
      ]
      const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600 * 24 * 365])
      await (await trader.sendTransaction({ to: UR, data, value: ethIn })).wait()
    }
    { const h0 = await erc(token2).balanceOf(TRADER), f0 = await erc(ZZEC).balanceOf(FURNACE)
      await twoHop(token2, ethers.parseEther('0.005'))
      const got = (await erc(token2).balanceOf(TRADER)) - h0, fGot = (await erc(ZZEC).balanceOf(FURNACE)) - f0
      expect(got).to.be.gt(0n); expect(fGot).to.be.gt(0n) // both hooks paid the Furnace on the way through
      console.log(`      ape with ETH · 0.005 ETH -> zZEC -> ${ethers.formatEther(got)} HALO in one tx · Furnace +${Number(fGot) / 1e8} zZEC`) }
    // and during a batch opening the same route becomes a bid, credited to the sender
    const rc3 = await (await factory.connect(creator).launch('Orchard', 'ORCH', 'ipfs://orch', 0, 0, 200, 75, 50)).wait()
    const ev3 = rc3!.logs.map((l) => { try { return factory.interface.parseLog(l) } catch { return null } }).find((e) => e?.name === 'Launched')!
    const token3 = ev3.args.token as string, poolId3 = ev3.args.poolId as string
    expect(await hook.inOpening(poolId3)).to.equal(true)
    await twoHop(token3, ethers.parseEther('0.002'))
    const bid3 = await hook.bids(poolId3, TRADER)
    expect(bid3).to.be.gt(0n)
    expect(await erc(token3).balanceOf(TRADER)).to.equal(0n) // nothing bought yet: it is a bid
    console.log(`      ape with ETH into an opening · 0.002 ETH became a bid of ${Number(bid3) / 1e8} zZEC`)
  })
})
