import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {ethers}=createRequire(new URL('../contracts/package.json',import.meta.url))('ethers')
import {decodeRoute,canDeposit,parseZec,historyVerified,activeDeposit,depositProgress,WRAP_REGISTRY,WRAP_MINTER} from '../src/lib/wrapPublic.ts'
const account='0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03',address='t1RtmsoPs9d9SZpXKmJJpDH3g6qNmBegN98'
const iface=new ethers.Interface(['function route(uint256) view returns(tuple(address recipient,uint64 requestedAt,string depositAddress,uint256 creditedZats))'])
const encoded=iface.encodeFunctionResult('route',[[account,1788812201,address,0]])
const r=decodeRoute(encoded,0)
const s={version:1,at:new Date().toISOString(),workerReady:true,accepting:true,feeCapacity:true,requestsPaused:false,registry:WRAP_REGISTRY,minter:WRAP_MINTER,chainId:4663,route:r,deposits:[],review:[]}
test('decode real contract ABI including dynamic deposit address',()=>{assert.equal(r.depositAddress,address);assert.equal(r.recipient.toLowerCase(),account.toLowerCase());assert.equal(r.requestedAt,1788812201)})
test('unassigned route has no funding instructions',()=>{const empty=decodeRoute(iface.encodeFunctionResult('route',[[account,1788812201,'',0]]),0);assert.equal(empty.depositAddress,'');assert.equal(canDeposit({...s,route:empty},account,empty),false)})
test('stale, wrong-account, changed-address and unavailable status cannot expose funding instructions',()=>{assert.equal(canDeposit(s,account,r),true);for(const bad of [{...s,at:new Date(Date.now()-121000).toISOString()},{...s,workerReady:false},{...s,accepting:false},{...s,route:{...r,depositAddress:'t1Wrong'}},{...s,chainId:1},{...s,at:'invalid'}])assert.equal(canDeposit(bad,account,r),false);assert.equal(canDeposit(s,'0x1111111111111111111111111111111111111111',r),false)})
test('amount estimates preserve all eight decimals without float arithmetic',()=>{assert.equal(parseZec('0.00207001'),207001n);assert.equal(parseZec('1'),100000000n);for(const n of ['1e-3','-1','0.001000001','NaN'])assert.equal(parseZec(n),0n)})

test('progress prioritizes unfinished deposits and only marks a confirmed mint complete',()=>{
 const old={txid:'old',index:0,amountZats:'207000',state:'minted'}
 const recent={txid:'new',index:0,amountZats:'1007000',state:'sweep-signed'}
 assert.equal(activeDeposit([old,recent]),recent)
 assert.equal(activeDeposit([recent,old]),recent)
 assert.equal(activeDeposit([old,{...recent,state:'minted'}])?.txid,'new')
 assert.equal(activeDeposit([]),undefined)
 for(const state of ['observed','sweep-signed','sweep-confirmed','mint-signed'])assert.ok(depositProgress(state).stage<3)
 assert.equal(depositProgress('minted').stage,3)
})

test('empty history requires fresh successful checks for the connected wallet and route',()=>{
 assert.equal(historyVerified(s,account,r),true)
 for(const bad of [{...s,workerReady:false},{...s,at:new Date(Date.now()-121000).toISOString()},{...s,route:null},{...s,route:{...r,recipient:'0x1111111111111111111111111111111111111111'}},{...s,deposits:undefined}])assert.equal(historyVerified(bad as typeof s,account,r),false)
 assert.equal(historyVerified({...s,route:null},account,null),true)
 assert.equal(historyVerified(s,account,null),false)
})
