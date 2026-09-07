import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const pending={txid:'12'.repeat(32),amount_zats:200000,at:'2026-09-07T00:00:00Z',status:'signed'}
function check(rows:unknown[]) {
 const dir=mkdtempSync(join(tmpdir(),'zeal-settlement-test-'))
 try {
  writeFileSync(join(dir,'reserve-transfers.json'),JSON.stringify(rows))
  return execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`import {reimbursementCredits} from './src/reserve-settlements.ts'; try { console.log(String(await reimbursementCredits())) } catch(e) { console.log(e.message) }`],{cwd:new URL('../',import.meta.url),env:{...process.env,OPS_STATE_DIR:dir},encoding:'utf8'})
 } finally {rmSync(dir,{recursive:true,force:true})}
}
test('pending signed transfer blocks issuance without any network read',()=>assert.match(check([pending]),/pending or uncertain/))
test('duplicate transfer evidence is rejected before any credit',()=>assert.match(check([pending,pending]),/duplicate/))
test('unknown transfer state cannot grant mint capacity',()=>assert.match(check([{...pending,status:'cancelled'}]),/Invalid/))
test('empty inactive settlement history grants zero reimbursement credit',()=>assert.equal(check([]).trim(),'0'))
