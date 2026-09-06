#!/bin/zsh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run --silent watch:roles >> launchd/roles.log 2>&1
rc=$?
# alert once per new state, not every five minutes
LAST="$(grep ALERT launchd/roles.log | tail -20 | sed 's/^[^ ]* //' | sort -u | md5)"
if [[ $rc -eq 2 ]]; then
  if [[ "$(cat launchd/roles-alerted 2>/dev/null)" != "$LAST" ]]; then echo "$LAST" > launchd/roles-alerted; ./launchd/notify.sh "ZEAL role watchdog" "$(grep ALERT launchd/roles.log | tail -1 | cut -c26-200)"; fi
elif [[ $rc -ne 0 ]]; then tail -1 launchd/roles.log >&2; ./launchd/notify.sh "ZEAL role watchdog" "$(tail -1 launchd/roles.log | cut -c1-180)"
else rm -f launchd/roles-alerted; fi
exit $rc
