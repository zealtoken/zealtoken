#!/bin/zsh
# Sync the operator to a runtime dir outside ~/Documents (launchd agents are
# blocked from Documents by macOS privacy controls) and (re)load the job.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
RT="$HOME/zeal-ops"
mkdir -p "$RT/launchd"
rsync -a --delete --exclude 'launchd/*.log' --exclude 'launchd/*.out' --exclude 'launchd/*.err' "$SRC/" "$RT/"
chmod 700 "$RT/.keys" 2>/dev/null || true
# The LP/burn job signs with the deployer keystore; launchd cannot read ~/Documents, so keep a copy beside the role keys.
if [ -f "$SRC/../contracts/.keystore.json" ]; then install -m 600 "$SRC/../contracts/.keystore.json" "$RT/.keys/deployer.json"; fi
for job in attest watch-roles ${EXTRA_JOBS:-}; do
  PLIST="$HOME/Library/LaunchAgents/com.zealtoken.$job.plist"
  sed "s#\$HOME/Documents/zealtoken.com/ops#$RT#g; s#$HOME/Documents/zealtoken.com/ops#$RT#g" "$SRC/launchd/com.zealtoken.$job.plist" > "$PLIST"
  launchctl unload -w "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
done
echo "runtime: $RT"; launchctl list | grep zealtoken || true
