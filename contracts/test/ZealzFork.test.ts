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
    const initCode = ethers.concat([Hook.bytecode, abi.encode(['address', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256'], [POOL_MANAGER, factoryAddr, FURNACE, treasury.address, ZZEC, 100, 50, 50])])
    const { salt, address: hookAddr } = mineSalt(ethers.keccak256(initCode))
    await (await deployer.sendTransaction({ to: CREATE2, data: ethers.concat([salt, initCode]) })).wait()
    expect(await ethers.provider.getCode(hookAddr)).to.not.equal('0x')
    const factory = await (await ethers.getContractFactory('ZealzFactory', deployer)).deploy(POSM, PERMIT2, ZZEC, hookAddr, treasury.address, ethers.parseEther('0.001'), openTick0, openTick1)
    expect(await factory.getAddress()).to.equal(factoryAddr)
    const locker = await (await ethers.getContractFactory('ZealzLocker', deployer)).deploy(POSM, POOL_MANAGER, PERMIT2, factoryAddr)
    await factory.setLocker(await locker.getAddress())

    // ---- launch, capital free
    const tx = await factory.connect(creator).launch('Zebra Foundry', 'ZBRA', 'ipfs://zbra', 0, { value: ethers.parseEther('0.001') })
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

    // ---- buy 0.01 zZEC of it through the Universal Router
    const key = { currency0: tokenIs0 ? token : ZZEC, currency1: tokenIs0 ? ZZEC : token, fee: 3000, tickSpacing: 60, hooks: hookAddr }
    const swap = async (zeroForOne: boolean, amountIn: bigint) => {
      const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f])
      const input = zeroForOne ? key.currency0 : key.currency1, output = zeroForOne ? key.currency1 : key.currency0
      // Robinhood Chain's Universal Router is a modified v4-periphery build: ExactInputSingleParams carries a
      // uint256 minHopPriceX36 before hookData. Without it the struct only decodes by luck when currency0 is ETH.
      const params = [abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)`], [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: 0n, minHopPriceX36: 0n, hookData: '0x' }]), abi.encode(['address', 'uint256'], [input, amountIn]), abi.encode(['address', 'uint256'], [output, 0n])]
      const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600])
      await (await (erc(input).connect(trader) as ethers.Contract).approve(PERMIT2, ethers.MaxUint256)).wait()
      await (await new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)'], trader).approve(input, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 86400)).wait()
      await (await trader.sendTransaction({ to: UR, data })).wait()
    }
    const buyIn = 1_000_000n // 0.01 zZEC
    const tokBefore = await erc(token).balanceOf(TRADER), creatorTokBefore = await erc(token).balanceOf(creator.address)
    await swap(!tokenIs0, buyIn)
    const got = (await erc(token).balanceOf(TRADER)) - tokBefore
    expect(got).to.be.gt(0n)
    const creatorCut = (await erc(token).balanceOf(creator.address)) - creatorTokBefore
    expect(creatorCut).to.be.gt(0n) // 0.5% of a buy's token output goes to the creator
    const s1 = await sv.getSlot0(poolId)
    console.log(`      bought ${ethers.formatEther(got)} ZBRA for 0.01 zZEC · creator got ${ethers.formatEther(creatorCut)} · tick ${s0[1]} -> ${s1[1]}`)
    expect(tokenIs0 ? s1[1] > s0[1] : s1[1] < s0[1]).to.equal(true) // price of the token rose

    // ---- sell half back: the zZEC output pays the Furnace 1%
    const furnaceBefore = await erc(ZZEC).balanceOf(FURNACE)
    await swap(tokenIs0, got / 2n)
    const furnaceGot = (await erc(ZZEC).balanceOf(FURNACE)) - furnaceBefore
    expect(furnaceGot).to.be.gt(0n)
    console.log(`      sold half · Furnace received ${Number(furnaceGot) / 1e8} zZEC`)

    // ---- compound: fees back into the lock, liquidity only rises
    await (await locker.compound(positionId)).wait()
    const L1 = await posm.getPositionLiquidity(positionId)
    expect(L1).to.be.gt(L0)
    console.log(`      compounded · liquidity ${L0} -> ${L1} (+${((Number(L1 - L0) / Number(L0)) * 100).toFixed(4)}%)`)
  })
})
