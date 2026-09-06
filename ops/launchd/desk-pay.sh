#!/bin/zsh
# Automatic redemption payer, every 5 minutes. Fulfiller passphrase from keychain "zeal-fulfiller"; the float wallet is zingo-cli's own.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
FULFILLER_PASS="$(security find-generic-password -s zeal-fulfiller -w 2>/dev/null || true)"
if [[ -z "$FULFILLER_PASS" ]]; then echo "$(date -u +%FT%TZ) keychain item zeal-fulfiller unavailable" >&2; exit 1; fi
export FULFILLER_PASS
export ZINGO_DATA="${ZINGO_DATA:-$HOME/zeal-ops/.float}"
npm run --silent desk:pay >> launchd/desk-pay.log 2>&1
rc=$?
if [[ $rc -ne 0 ]]; then ./launchd/notify.sh "ZEAL redemption payer" "$(tail -1 launchd/desk-pay.log | cut -c1-180)"; fi
if tail -5 launchd/desk-pay.log | grep -q " paid "; then ./launchd/notify.sh "ZEAL redemption paid" "$(tail -5 launchd/desk-pay.log | grep ' paid ' | tail -1 | cut -c1-160)"; fi
exit 0
