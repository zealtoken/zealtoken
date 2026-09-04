#!/bin/zsh
# Re-attest the reserve every run. Passphrase comes from the macOS keychain
# (service "zeal-attestor"), never from a file. Logs to ops/launchd/attest.log.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export ATTESTOR_PASS="$(security find-generic-password -s zeal-attestor -w)"
exec npm run --silent attest >> launchd/attest.log 2>&1
