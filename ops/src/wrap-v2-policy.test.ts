import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ethers} from 'ethers'
import {deriveDepositAddress,verifyRoute,eligibleOutput,addDeposit,pendingV2Zats,creditReady} from './wrap-v2-policy.js'
// Public deterministic test fixture, never used for custody.
const wallet=ethers.HDNodeWallet.fromSeed(new Uint8Array(32).fill(7)),xpub=wallet.neuter().extendedKey
const route={id:0,recipient:'0x1C083F2f85aCadae452C7512C45cD7c8a3ddbF03',depositAddress:deriveDepositAddress(xpub,0),requestedAt:100}
const output={txid:'0x'+'ab'.repeat(32),index:0,valueZat:107001n,height:200}
test('deposit public derivation is deterministic, unique and matches private derivation',()=>{assert.equal(deriveDepositAddress(xpub,0),deriveDepositAddress(wallet.neuter().extendedKey,0));assert.notEqual(deriveDepositAddress(xpub,0),deriveDepositAddress(xpub,1));assert.throws(()=>deriveDepositAddress(wallet.extendedKey,0),/public/);assert.throws(()=>deriveDepositAddress(xpub,2**31),/index/);verifyRoute(xpub,route);assert.throws(()=>verifyRoute(xpub,{...route,depositAddress:deriveDepositAddress(xpub,1)}),/match/)})
test('credits confirmed actual amounts regardless of trailing digits',()=>{assert.equal(eligibleOutput(output,output,202,202,100,110,110),107001n);assert.throws(()=>eligibleOutput(output,output,201,201,100,110,110),/confirmed/);assert.throws(()=>eligibleOutput(output,{...output,valueZat:100001n},202,202,100,110,110),/disagree/)})
test('rejects historical, over-limit and ambiguous evidence',()=>{assert.throws(()=>eligibleOutput(output,output,202,202,120,110,110),/confirmed/);assert.throws(()=>eligibleOutput({...output,valueZat:1n},{...output,valueZat:1n},202,202,100,110,110),/limits/)})
test('repeated observations cannot duplicate or reassign payments',()=>{const r=addDeposit([],route,output);assert.equal(addDeposit(r,route,output).length,1);assert.throws(()=>addDeposit(r,{...route,id:1},output),/changed/);assert.equal(addDeposit(r,route,{...output,index:1}).length,2)})
test('pending deposits reserve full gross value until mint, never just net sweep proceeds',()=>{const r=addDeposit([],route,output);assert.equal(pendingV2Zats(r),107001n);assert.equal(pendingV2Zats([{...r[0],state:'mint-signed'}]),107001n);assert.equal(pendingV2Zats([{...r[0],state:'minted'}]),0n);assert.throws(()=>pendingV2Zats([...r,...r]),/Duplicate/)})
test('mint requires confirmed consolidation and full actual-amount backing',()=>{const d=addDeposit([],route,output)[0],sweep='0x'+'cd'.repeat(32);assert.throws(()=>creditReady(d,sweep,107001n),/Consolidation/);const ready={...d,state:'sweep-confirmed' as const,sweepTxid:sweep};assert.throws(()=>creditReady(ready,sweep,107000n),/backing/);assert.equal(creditReady(ready,sweep,107001n),107001n)})
