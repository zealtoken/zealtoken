#!/bin/zsh
# Peg keeper tick. Passphrase from the keychain item "zeal-keeper". Logs to launchd/keeper.log.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
KEEPER_PASS="$(security find-generic-password -s zeal-keeper -w 2>/dev/null || true)"
if [[ -z "$KEEPER_PASS" ]]; then echo "$(date -u +%FT%TZ) keychain item zeal-keeper unavailable" >&2; ./launchd/notify.sh "zZEC keeper" "keychain item unavailable; tick skipped"; exit 1; fi
export KEEPER_PASS
npm run --silent keeper -- --execute >> launchd/keeper.log 2>&1 || { echo "$(date -u +%FT%TZ) keeper tick failed; see launchd/keeper.log" >&2; ./launchd/notify.sh "zZEC keeper FAILED" "$(tail -1 launchd/keeper.log | cut -c1-180)"; exit 1; }
# alert when a trade actually happened (the log line with the tx hash)
if tail -3 launchd/keeper.log | grep -q " tx 0x"; then ./launchd/notify.sh "zZEC keeper traded" "$(tail -3 launchd/keeper.log | grep " tx 0x" | tail -1 | cut -c1-160)"; fi
