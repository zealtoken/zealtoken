#!/bin/zsh
# Sync the operator to a runtime dir outside ~/Documents (launchd agents are
# blocked from Documents by macOS privacy controls) and (re)load the job.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
RT="$HOME/zeal-ops"
mkdir -p "$RT/launchd"
rsync -a --delete --exclude 'launchd/*.log' --exclude 'launchd/*.out' --exclude 'launchd/*.err' "$SRC/" "$RT/"
chmod 700 "$RT/.keys" 2>/dev/null || true
PLIST="$HOME/Library/LaunchAgents/com.zealtoken.attest.plist"
sed "s#\$HOME/Documents/zealtoken.com/ops#$RT#g; s#$HOME/Documents/zealtoken.com/ops#$RT#g" "$SRC/launchd/com.zealtoken.attest.plist" > "$PLIST"
launchctl unload -w "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"
echo "runtime: $RT"; echo "plist:   $PLIST"; launchctl list | grep zealtoken || true
