import { existsSync } from 'node:fs'
/** Prevent a retired local signer from running alongside its cloud replacement. */
export function assertLocalSigningActive(role?: string) {
  const marker = role === 'fulfiller' || role === 'burner' ? `cloud-${role}-migrated.json` : 'cloud-migrated.json'
  if (existsSync(new URL('../launchd/' + marker, import.meta.url))) {
    throw new Error('Signing has moved to the ZEAL cloud worker. Stop and verify the cloud worker before restoring local signing.')
  }
}
