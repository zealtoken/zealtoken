// Internal child entrypoint; only the replenisher launches this after persisting its budget.
process.argv.push('--execute')
await import('./sweep.js')
export {}
