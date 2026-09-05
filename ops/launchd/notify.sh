#!/bin/zsh
# notify.sh "<title>" "<message>" — Telegram (keychain item zeal-telegram holding "BOT_TOKEN|CHAT_ID") plus a macOS notification.
TITLE="$1"; MSG="$2"
osascript -e "display notification \"${MSG//\"/\\\"}\" with title \"${TITLE//\"/\\\"}\"" >/dev/null 2>&1 || true
TG="$(security find-generic-password -s zeal-telegram -w 2>/dev/null || true)"
if [[ -n "$TG" ]]; then
  TOKEN="${TG%%|*}"; CHAT="${TG##*|}"
  curl -s -m 15 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" --data-urlencode "chat_id=${CHAT}" --data-urlencode "text=${TITLE}: ${MSG}" >/dev/null 2>&1 || true
fi
