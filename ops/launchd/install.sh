#!/bin/zsh
# Sync the operator to a runtime dir outside ~/Documents (launchd agents are
# blocked from Documents by macOS privacy controls) and (re)load the job.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
RT="$HOME/zeal-ops"
mkdir -p "$RT/launchd"
rsync -a --delete --exclude '.float' --exclude 'desk-ledger.json' --exclude 'redemptions.json' --exclude 'launchd/*.log' --exclude 'launchd/*.out' --exclude 'launchd/*.err' --exclude 'launchd/*.json' --exclude 'launchd/desk-alerted' --exclude 'launchd/keeper-pricefail' "$SRC/" "$RT/"
chmod 700 "$RT/.keys" 2>/dev/null || true
# The LP/burn job signs with the deployer keystore; launchd cannot read ~/Documents, so keep a copy beside the role keys.
if [ -f "$SRC/../contracts/.keystore.json" ]; then install -m 600 "$SRC/../contracts/.keystore.json" "$RT/.keys/deployer.json"; fi
for job in attest watch-roles keeper burn desk-watch desk-pay ${EXTRA_JOBS:-}; do
  PLIST="$HOME/Library/LaunchAgents/com.zealtoken.$job.plist"
  NEW="$(sed "s#__OPS__#$RT#g" "$SRC/launchd/com.zealtoken.$job.plist")"
  # Reload only when the job definition changed or it is not loaded: every reload triggers a macOS
  # "App Background Activity" notification, and the scripts themselves are picked up fresh on each run anyway.
  if [ -f "$PLIST" ] && [ "$NEW" = "$(cat "$PLIST")" ] && launchctl list | grep -q "com.zealtoken.$job"; then continue; fi
  printf '%s\n' "$NEW" > "$PLIST"
  launchctl unload -w "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
done
echo "runtime: $RT"; launchctl list | grep zealtoken || true
