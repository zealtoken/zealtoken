/** Unlock once locally, then hand off to a detached process over private IPC.
 * No passphrase is placed in arguments, logs, environment variables or files.
 */
import { assertLocalSigningActive } from './local-signing.js'
import { spawn, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { openSync, closeSync } from 'node:fs'
import { atomicJson, readJson, stateDir, withLock } from './ops-lock.js'
const ROOT = new URL('../', import.meta.url).pathname
const PID = `${stateDir}refill-background.json`
function command(pid: number): string {
  if (!Number.isInteger(pid) || pid <= 0) return ''
  try { return execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }) } catch { return '' }
}
async function main() {
  assertLocalSigningActive()
  const previous = readJson<{ pid?: number }>(PID, {})
  if (previous.pid && command(previous.pid).includes('src/replenish.ts --execute --daemon --ipc-unlock')) {
    console.log(`Background replenisher already running (PID ${previous.pid}). You can close this terminal.`); return
  }
  if (!process.stdin.isTTY) throw new Error('Run this command in your local terminal to unlock the minter')
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  process.stdout.write('Minter passphrase (background session only): ')
  const original = process.stdout.write.bind(process.stdout)
  let pass: string
  process.stdout.write = (() => true) as typeof process.stdout.write
  try { pass = await new Promise<string>(resolve => rl.question('', resolve)) }
  finally { process.stdout.write = original; rl.close(); process.stdout.write('\n') }
  const fd = openSync(`${stateDir}refill-background.log`, 'a', 0o600)
  const env: NodeJS.ProcessEnv = { ...process.env, REFILL_ENABLED: '1' }
  delete env.MINTER_PASS
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/replenish.ts', '--execute', '--daemon', '--ipc-unlock'], {
    cwd: ROOT, env, detached: true, stdio: ['ignore', fd, fd, 'ipc'],
  })
  closeSync(fd)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('background signer did not become ready')), 20000)
      child.once('error', e => { clearTimeout(timeout); reject(e) })
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('background signer exited; inspect refill-background.log')) })
      child.once('message', (m: { ready?: boolean; error?: string }) => {
        clearTimeout(timeout); m.ready ? resolve() : reject(new Error(m.error ?? 'unlock failed'))
      })
      child.send({ pass })
      pass = ''
    })
    // Only stop the old terminal session while no refill transaction is in progress.
    await withLock('refill', async () => {
      const rows = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n')
      for (const row of rows) {
        if (!row.includes(`${ROOT}node_modules/`) || !row.includes('src/replenish.ts') || !row.includes('--session')) continue
        const pid = Number(row.trim().split(/\s+/)[0])
        if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || pid === child.pid) continue
        try { process.kill(pid, 'SIGTERM') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e }
      }
      atomicJson(PID, { pid: child.pid, startedAt: new Date().toISOString(), mode: 'memory-only' })
      await new Promise<void>((resolve, reject) => child.send({ start: true }, e => e ? reject(e) : resolve()))
    })
    child.disconnect(); child.unref()
    console.log(`Background replenisher started (PID ${child.pid}). You can close this terminal.`)
    console.log('Logs: ~/zeal-ops/launchd/refill-background.log')
    console.log('After a restart, run npm run replenish:background again to unlock it.')
  } catch (e) { child.kill('SIGTERM'); throw e }
}
main().catch(e => { console.error((e as Error).message); process.exitCode = 1 })
