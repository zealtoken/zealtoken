#!/bin/zsh
# Peg keeper tick. Passphrase from the keychain item "zeal-keeper". Logs to launchd/keeper.log.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
KEEPER_PASS="$(security find-generic-password -s zeal-keeper -w 2>/dev/null || true)"
if [[ -z "$KEEPER_PASS" ]]; then echo "$(date -u +%FT%TZ) keychain item zeal-keeper unavailable" >&2; ./launchd/notify.sh "zZEC keeper" "keychain item unavailable; tick skipped"; exit 1; fi
export KEEPER_PASS
if npm run --silent keeper -- --execute >> launchd/keeper.log 2>&1; then
  rm -f launchd/keeper-failed
else
  echo "$(date -u +%FT%TZ) keeper tick failed; see launchd/keeper.log" >&2
  if [[ ! -f launchd/keeper-failed ]]; then
    touch launchd/keeper-failed
    ./launchd/notify.sh "zZEC keeper FAILED" "$(tail -1 launchd/keeper.log | cut -c1-180)"
  fi
  exit 1
fi
# Routine trades stay in the log. Faster checks should not send a message per trade.
