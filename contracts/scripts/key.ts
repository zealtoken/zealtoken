import { createKeystore } from './lib/secure'

createKeystore().catch((e) => {
  console.error(`\n${(e as Error).message}\n`)
  process.exitCode = 1
})
