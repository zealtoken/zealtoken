#!/bin/zsh
# Daily burn: collect LP fees, forward to the Furnace, ignite. Passphrase from keychain "zeal-burner".
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LP_PASS="$(security find-generic-password -s zeal-burner -w 2>/dev/null || true)"
if [[ -z "$LP_PASS" ]]; then echo "$(date -u +%FT%TZ) keychain item zeal-burner unavailable" >&2; ./launchd/notify.sh "ZEAL burn" "keychain item unavailable; burn skipped"; exit 1; fi
export LP_PASS
export LP_KEYSTORE="$PWD/.keys/deployer.json"
export LP_TOKEN_IDS="${LP_TOKEN_IDS:-1909208}"
echo "$(date -u +%FT%TZ) burn run" >> launchd/burn.log
FAIL=0
if npm run --silent burn -- --execute >> launchd/burn.log 2>&1; then
  ./launchd/notify.sh "ZEAL burn" "$(grep -E "DONE|nothing to ignite" launchd/burn.log | tail -1 | cut -c1-160)"
else
  echo "$(date -u +%FT%TZ) burn FAILED; see launchd/burn.log" >&2; ./launchd/notify.sh "ZEAL burn FAILED" "$(tail -1 launchd/burn.log | cut -c1-180)"; FAIL=1
fi
# launchpad, every day whether or not the burn went through: flush booked fees, compound every lock, pay every holder (no-ops until the factory deploys)
npm run --silent compound >> launchd/burn.log 2>&1 || { echo "$(date -u +%FT%TZ) compound FAILED; see launchd/burn.log" >&2; ./launchd/notify.sh "zealz compound FAILED" "$(tail -1 launchd/burn.log | cut -c1-180)"; FAIL=1; }
npm run --silent dividends >> launchd/burn.log 2>&1 || { echo "$(date -u +%FT%TZ) dividends FAILED; see launchd/burn.log" >&2; ./launchd/notify.sh "zealz dividends FAILED" "$(tail -1 launchd/burn.log | cut -c1-180)"; FAIL=1; }
exit $FAIL
