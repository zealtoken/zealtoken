#!/bin/zsh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
npm run --silent watch:roles >> launchd/roles.log 2>&1
rc=$?
if [[ $rc -ne 0 ]]; then tail -1 launchd/roles.log >&2; fi
exit $rc
