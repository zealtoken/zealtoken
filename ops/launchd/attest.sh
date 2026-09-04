#!/bin/zsh
# Re-attest the reserve every run. Passphrase comes from the macOS keychain
# (service "zeal-attestor"), never from a file. Logs to launchd/attest.log.
# Exits non-zero (visible in attest.err) if the keychain is locked/empty or
# the attestation is refused, so a silent stall is not possible.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ATTESTOR_PASS="$(security find-generic-password -s zeal-attestor -w 2>/dev/null || true)"
if [[ -z "$ATTESTOR_PASS" ]]; then echo "$(date -u +%FT%TZ) keychain item zeal-attestor unavailable (locked or missing)" >&2; exit 1; fi
export ATTESTOR_PASS
echo "$(date -u +%FT%TZ) attest run" >> launchd/attest.log
npm run --silent attest >> launchd/attest.log 2>&1 || { echo "$(date -u +%FT%TZ) attest FAILED; see launchd/attest.log" >&2; exit 1; }
