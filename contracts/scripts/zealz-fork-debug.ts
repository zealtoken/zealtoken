import { ethers, network } from 'hardhat'
import { mineSalt } from './deploy-hook'
const CREATE2 = '0x4e59b44847b379578588920cA78FbF26c0B4956C', POOL_MANAGER = '0x8366a39cc670b4001a1121b8f6a443a643e40951', POSM = '0x58daec3116aae6d93017baaea7749052e8a04fa7', UR = '0x8876789976decbfcbbbe364623c63652db8c0904', PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3', ZZEC = '0x0b151Ff7a7c5250130EC16C275790961d558E402', FURNACE = '0x72C2f71dC3c0058974fd59039F9A79397bf87E70', DEPLOYER = '0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03', TRADER = '0x19cece80126b79F76D8b8297B876310a56349738', SV = '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b'
const abi = ethers.AbiCoder.defaultAbiCoder(), KEY_T = 'tuple(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'
const tickFor = (p: number, s: number) => Math.floor(Math.floor(Math.log(p) / Math.log(1.0001)) / s) * s
async function main() {
  const imp = async (a: string) => { await network.provider.send('hardhat_impersonateAccount', [a]); await network.provider.send('hardhat_setBalance', [a, '0x56bc75e2d63100000']); return ethers.getSigner(a) }
  const deployer = await imp(DEPLOYER), trader = await imp(TRADER); const [treasury, creator] = await ethers.getSigners()
  const p0 = 0.1e8 / 1e27, t0 = tickFor(p0, 60), t1 = tickFor(1 / p0, 60)
  const Hook = await ethers.getContractFactory('ZealzHook'); const nonce = await ethers.provider.getTransactionCount(DEPLOYER); const factoryAddr = ethers.getCreateAddress({ from: DEPLOYER, nonce: nonce + 1 })
  const initCode = ethers.concat([Hook.bytecode, abi.encode(['address', 'address', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256'], [POOL_MANAGER, factoryAddr, FURNACE, treasury.address, ZZEC, 100, 50, 50])])
  const { salt, address: hookAddr } = mineSalt(ethers.keccak256(initCode)); await (await deployer.sendTransaction({ to: CREATE2, data: ethers.concat([salt, initCode]) })).wait()
  const factory = await (await ethers.getContractFactory('ZealzFactory', deployer)).deploy(POSM, PERMIT2, ZZEC, hookAddr, treasury.address, ethers.parseEther('0.001'), t0, t1)
  const locker = await (await ethers.getContractFactory('ZealzLocker', deployer)).deploy(POSM, POOL_MANAGER, PERMIT2, factoryAddr); await factory.setLocker(await locker.getAddress())
  const rc = await (await factory.connect(creator).launch('Zebra', 'ZBRA', 'ipfs://x', 0, { value: ethers.parseEther('0.001') })).wait()
  const ev = rc!.logs.map((l) => { try { return factory.interface.parseLog(l) } catch { return null } }).find((e) => e?.name === 'Launched')!
  const token = ev.args.token as string, poolId = ev.args.poolId as string, tokenIs0 = token.toLowerCase() < ZZEC.toLowerCase()
  const key = { currency0: tokenIs0 ? token : ZZEC, currency1: tokenIs0 ? ZZEC : token, fee: 3000, tickSpacing: 60, hooks: hookAddr }
  const sv = new ethers.Contract(SV, ['function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)', 'function getLiquidity(bytes32) view returns (uint128)', 'function getTickInfo(bytes32,int24) view returns (uint128,int128,uint256,uint256)'], ethers.provider)
  const s = await sv.getSlot0(poolId); console.log('tokenIs0', tokenIs0, 'slot0 sqrt', s[0].toString(), 'tick', s[1].toString(), 'active liquidity', (await sv.getLiquidity(poolId)).toString())
  const [tl, tu] = tokenIs0 ? [t0, t0 + 138000] : [t1 - 138000, t1]; console.log('range', tl, tu, 'tickInfo upper', (await sv.getTickInfo(poolId, tu)).map(String).join(' '), 'lower', (await sv.getTickInfo(poolId, tl)).map(String).join(' '))
  // A. the same router encoding on the LIVE zZEC/ETH pool: does the UR path work on this fork at all?
  const liveKey = { currency0: ethers.ZeroAddress, currency1: ZZEC, fee: 3000, tickSpacing: 60, hooks: '0x16642362837e2FDC02fF1ECF71f5629c094B0044' }
  const encUR = (k: typeof liveKey, zeroForOne: boolean, amountIn: bigint) => {
    const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f])
    const inp = zeroForOne ? k.currency0 : k.currency1, out = zeroForOne ? k.currency1 : k.currency0
    const params = [abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`], [{ poolKey: k, zeroForOne, amountIn, amountOutMinimum: 0n, hookData: '0x' }]), abi.encode(['address', 'uint256'], [inp, amountIn]), abi.encode(['address', 'uint256'], [out, 0n])]
    return new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600])
  }
  const zz = new ethers.Contract(ZZEC, ['function approve(address,uint256) returns (bool)'], trader); await (await zz.approve(PERMIT2, ethers.MaxUint256)).wait()
  await (await new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)'], trader).approve(ZZEC, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 86400)).wait()
  try { await network.provider.send('eth_call', [{ from: TRADER, to: UR, data: encUR(liveKey, false, 100_000n) }, 'latest']); console.log('A. live pool via UR: OK') } catch (e: any) { console.log('A. live pool via UR: REVERT', (e.message ?? '').slice(0, 120)) }
  // B. direct PoolManager swap on the NEW pool through a minimal router
  const tr = await (await ethers.getContractFactory('TestSwapRouter', trader)).deploy(POOL_MANAGER)
  await (await zz.approve(await tr.getAddress(), ethers.MaxUint256)).wait()
  const MIN = 4295128739n + 1n, MAX = 1461446703485210103287273052203988822378723970342n - 1n
  try {
    const d = await tr.swapExactIn.staticCall(key, !tokenIs0, 1_000_000n, !tokenIs0 ? MIN : MAX)
    console.log('B. new pool via direct swap: OK delta', d.toString())
  } catch (e: any) { console.log('B. new pool via direct swap: REVERT', (e.data ?? e.message ?? '').toString().slice(0, 200)) }
  for (const [label, k, amt] of [['C. new pool via UR (same encoder), 0.01', key, 1_000_000n], ['D. new pool via UR, 0.001', key, 100_000n], ['E. new pool via UR, hooks=0 key (wrong key, expect PoolNotInitialized)', { ...key, hooks: ethers.ZeroAddress }, 100_000n]] as const) {
    try { await network.provider.send('eth_call', [{ from: TRADER, to: UR, data: encUR(k as typeof liveKey, !tokenIs0, amt as bigint) }, 'latest']); console.log(label, 'OK') } catch (e: any) { console.log(label, 'REVERT', (e.data ?? e.message ?? '').toString().slice(0, 100)) }
  }
  for (const [label, k, z4o] of [['F. new pool via UR, other direction (sell token, no balance: expect a DATA revert)', key, tokenIs0], ['G. live pool via UR zeroForOne=true (ETH in, no value: expect data revert)', liveKey, true]] as const) {
    try { await network.provider.send('eth_call', [{ from: TRADER, to: UR, data: encUR(k as typeof liveKey, z4o as boolean, 100_000n) }, 'latest']); console.log(label, 'OK') } catch (e: any) { console.log(label, 'REVERT', (e.data ?? e.message ?? '').toString().slice(0, 100)) }
  }
  console.log('hook flags of', hookAddr, '=', '0x' + (BigInt(hookAddr) & 0x3fffn).toString(16))
  // I. empirical: which params[0] layout does this router accept for a token/token key?
  const structEnc = abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`], [{ poolKey: key, zeroForOne: !tokenIs0, amountIn: 100_000n, amountOutMinimum: 0n, hookData: '0x' }])
  const variants: [string, string][] = [
    ['V1 ethers [0x20][fields]', structEnc],
    ['V2 fields only', '0x' + structEnc.slice(66)],
    ['V3 [0x20][0x20][fields]', '0x' + '0'.repeat(62) + '20' + structEnc.slice(2)],
  ]
  for (const [label, p0] of variants) {
    const inp = !tokenIs0 ? key.currency0 : key.currency1, out = !tokenIs0 ? key.currency1 : key.currency0
    const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f])
    const params = [p0, abi.encode(['address', 'uint256'], [inp, 100_000n]), abi.encode(['address', 'uint256'], [out, 0n])]
    const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600])
    try { await network.provider.send('eth_call', [{ from: TRADER, to: UR, data }, 'latest']); console.log('I.', label, 'OK') } catch (e: any) { console.log('I.', label, 'REVERT', (e.data ?? e.message ?? '').toString().slice(0, 80)) }
  }
  // H. trace both callbacks and find where the op sequences diverge
  const traceOf = async (data: string) => { try { await network.provider.send('eth_sendTransaction', [{ from: TRADER, to: UR, data, gas: '0x2dc6c0' }]) } catch {} const blk = await network.provider.send('eth_getBlockByNumber', ['latest', false]); const hash = blk.transactions[blk.transactions.length - 1]; const tr = await network.provider.send('debug_traceTransaction', [hash, { disableMemory: true, disableStorage: true }]); return tr.structLogs as { op: string; depth: number; pc: number; stack: string[] }[] }
  const good = await traceOf(encUR(liveKey, false, 100_000n)), bad = await traceOf(encUR(key, !tokenIs0, 100_000n))
  const frame = (logs: typeof good) => { const st = logs.findIndex((l) => l.depth === 3); return logs.slice(st).filter((l) => l.depth === 3) }
  const g = frame(good), b = frame(bad)
  let k = 0; while (k < g.length && k < b.length && g[k].pc === b[k].pc) k++
  console.log('H. callback frames: good', g.length, 'ops, bad', b.length, 'ops; diverge at op', k, 'pc', b[k]?.pc)
  console.log('   good next:', g.slice(k, k + 14).map((l) => l.op).join(' '))
  console.log('   bad  next:', b.slice(k, k + 14).map((l) => l.op).join(' '))
  const top = (l: { stack: string[] }, n: number) => l.stack.slice(-n).map((x) => '0x' + x.replace(/^0+/, '')).join(' ')
  console.log('   stack at divergence (good):', top(g[k - 1], 4)); console.log('   stack at divergence (bad): ', top(b[k - 1], 4))
  for (let j = Math.max(0, k - 16); j < k; j++) console.log('   ', j, 'pc', b[j].pc, b[j].op, '|', top(b[j], 5))
  // also: what the UR's calldata looks like at 0x144..0x2c4
  const cd = encUR(key, !tokenIs0, 100_000n); const inner = abi.decode(['bytes', 'bytes[]'], abi.decode(['bytes'], '0x' + '0'.repeat(62) + '20' + abi.encode(['bytes'], [cd]).slice(66))[0]) ; void inner
  // swap via UR with call to capture data
  const zeroForOne = !tokenIs0, amountIn = 1_000_000n, input = zeroForOne ? key.currency0 : key.currency1, output = zeroForOne ? key.currency1 : key.currency0
  const erc = new ethers.Contract(input, ['function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'], trader)
  await (await erc.approve(PERMIT2, ethers.MaxUint256)).wait(); await (await new ethers.Contract(PERMIT2, ['function approve(address,address,uint160,uint48)'], trader).approve(input, UR, (1n << 160n) - 1n, Math.floor(Date.now() / 1000) + 86400)).wait()
  console.log('trader input balance', (await erc.balanceOf(TRADER)).toString())
  const acts = ethers.solidityPacked(['uint8', 'uint8', 'uint8'], [0x06, 0x0c, 0x0f])
  const params = [abi.encode([`tuple(${KEY_T} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`], [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: 0n, hookData: '0x' }]), abi.encode(['address', 'uint256'], [input, amountIn]), abi.encode(['address', 'uint256'], [output, 0n])]
  const data = new ethers.Interface(['function execute(bytes,bytes[],uint256) payable']).encodeFunctionData('execute', [ethers.solidityPacked(['uint8'], [0x10]), [abi.encode(['bytes', 'bytes[]'], [acts, params])], Math.floor(Date.now() / 1000) + 3600])
  try { await network.provider.send('eth_sendTransaction', [{ from: TRADER, to: UR, data, gas: '0x2dc6c0' }]); console.log('tx ok?!') } catch (e: any) {
    const blk = await network.provider.send('eth_getBlockByNumber', ['latest', false]); const hash = blk.transactions[blk.transactions.length - 1]
    const tr = await network.provider.send('debug_traceTransaction', [hash, { disableMemory: true, disableStorage: true, disableStack: false }])
    const logs = tr.structLogs as { op: string; depth: number; pc: number; stack: string[] }[]
    const reverts = logs.map((l, i) => ({ ...l, i })).filter((l) => l.op === 'REVERT' || l.op === 'INVALID')
    console.log('total ops', logs.length, 'reverts at', reverts.map((r) => `${r.i}:depth${r.depth}`).join(' '))
    const first = reverts[0]; const ctx = logs.slice(Math.max(0, first.i - 12), first.i + 1).map((l) => `${l.depth}:${l.op}`).join(' ')
    console.log('before first revert:', ctx)
    // walk back to find the CALL frames entered at that depth
    let prev = 0
    for (let i = 0; i < logs.length; i++) { if (logs[i].depth !== prev) { const l = logs[i - 1]; console.log('depth change at', i, 'to', logs[i].depth, 'via', l?.op, l?.stack ? 'target 0x' + BigInt('0x' + l.stack[l.stack.length - 2]).toString(16).padStart(40, '0') : '') ; prev = logs[i].depth } }
    console.log('keys of a log:', Object.keys(logs[0]).join(','))
    const d: string = e.data ?? e.error?.data ?? e.info?.error?.data ?? ''; console.log('revert data', typeof d === 'string' ? d.slice(0, 200) : JSON.stringify(d).slice(0, 200))
    const cands = ['V4TooLittleReceived(uint256,uint256)', 'HookCallFailed()', 'Wrap__FailedHookCall(address,bytes)', 'PriceLimitAlreadyExceeded(uint160,uint160)', 'PriceLimitOutOfBounds(uint160)', 'SwapAmountCannotBeZero()', 'CurrencyNotSettled()', 'InvalidHookResponse()', 'HookDeltaExceedsSwapAmount()', 'ManagerLocked()', 'PoolNotInitialized()', 'TransactionDeadlinePassed()', 'InsufficientBalance()', 'ExecutionFailed(uint256,bytes)', 'SafeERC20FailedOperation(address)', 'AllowanceExpired(uint256)', 'InsufficientAllowance(uint256)', 'TickLiquidityOverflow(int24)', 'InvalidSqrtPrice(uint160)']
    for (const c of cands) if (typeof d === 'string' && d.startsWith(ethers.id(c).slice(0, 10))) console.log('=>', c, d.length > 10 ? d.slice(10, 200) : '')
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
