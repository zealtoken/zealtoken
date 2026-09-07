import { setTimeout } from 'node:timers/promises'
/** Never overlaps ticks; stopping drains the current operation before returning. */
export async function runSerialLoop(tick: () => Promise<unknown>, delayMs: number, signal: AbortSignal) {
  while (!signal.aborted) {
    await tick()
    if (signal.aborted) break
    try { await setTimeout(delayMs, undefined, { signal }) }
    catch (error) { if (!signal.aborted) throw error }
  }
}
