#!/bin/zsh
# Desk watchdog every 5 minutes: open redemptions to pay, funded wraps to mint, low gas. Alerts once per new state.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run --silent watch:desk >> launchd/desk.log 2>&1
rc=$?
LAST="$(grep ALERT launchd/desk.log | tail -20 | sed 's/^[^ ]* //' | sort -u | md5)"
if [[ $rc -eq 2 ]]; then
  if [[ "$(cat launchd/desk-alerted 2>/dev/null)" != "$LAST" ]]; then echo "$LAST" > launchd/desk-alerted; ./launchd/notify.sh "ZEAL desk" "$(grep ALERT launchd/desk.log | tail -1 | cut -c26-200)"; fi
elif [[ $rc -ne 0 ]]; then tail -1 launchd/desk.log >&2
else rm -f launchd/desk-alerted; fi
exit 0
