import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, openSync, closeSync, fsyncSync } from 'node:fs'
import { join, dirname } from 'node:path'

export const stateDir = (process.env.OPS_STATE_DIR ?? new URL('../launchd/', import.meta.url).pathname).replace(/\/?$/, '/')
export function atomicJson(file: string, value: unknown) {
  const tmp = `${file}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w', 0o600)
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(tmp, file)
  // Flush both content and rename before signing/broadcast callers proceed.
  const directory = openSync(dirname(file), 'r')
  try { fsyncSync(directory) } finally { closeSync(directory) }
}
export function readJson<T>(file: string, fallback: T): T {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : fallback
}
export class Busy extends Error {}
/** Local cooperative process lock. A crashed owner is recovered; ambiguous locks fail closed. */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const path = join(stateDir, `${name}.lock`)
  mkdirSync(stateDir, { recursive: true })
  try { mkdirSync(path) }
  catch {
    const pid = readJson<{ pid: number }>(join(path, 'owner.json'), { pid: 0 }).pid
    if (!Number.isInteger(pid) || pid <= 0) throw new Busy(`${name}: lock needs inspection`)
    let dead = false
    try { process.kill(pid, 0) } catch (e) { dead = (e as NodeJS.ErrnoException).code === 'ESRCH' }
    if (!dead) throw new Busy(`${name}: another operation is running`)
    rmSync(path, { recursive: true }); mkdirSync(path)
  }
  atomicJson(join(path, 'owner.json'), { pid: process.pid })
  try { return await fn() } finally { rmSync(path, { recursive: true }) }
}
