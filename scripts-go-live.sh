#!/usr/bin/env bash
# Post-launch, one shot: wire the $ZEAL token into the site and ship it.
#   ./scripts-go-live.sh 0xTOKEN
set -euo pipefail
TOK="${1:?usage: scripts-go-live.sh 0xTOKEN}"
[[ "$TOK" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "not an address: $TOK"; exit 1; }
cd "$(dirname "$0")"
python3 - "$TOK" <<'PY'
import pathlib, re, sys
tok = sys.argv[1]
p = pathlib.Path('src/config.ts'); s = p.read_text()
s, n1 = re.subn(r"address: null as string \| null,", f"address: '{tok}' as string | null,", s, count=1)
s, n2 = re.subn(r"pons: 'https://www\.ponsfamily\.com'", f"pons: 'https://www.ponsfamily.com/{tok}'", s, count=1)
s = s.replace("/** TODO: paste the real address once the Pons launch is live. */", "/** $ZEAL on Robinhood Chain, launched via Pons. */")
assert n1 == 1 and n2 == 1, (n1, n2)
p.write_text(s)
print(f"config: TOKEN.address = {tok}; LINKS.pons -> token page")
PY
npx tsc -b --pretty false >/dev/null
npm run build >/dev/null
git add -A
git -c user.name="Zeal" -c user.email="dev@zealtoken.com" commit -q -m "$(printf '$ZEAL is live: %s\n\nToken address wired into the site; the buy buttons now open the Pons\ntoken page instead of the launchpad homepage.\n\nCo-Authored-By: Zeal' "$TOK")"
git push -q origin main
npx vercel --prod --yes 2>&1 | grep -E '"readyState"' | head -1
echo "site updated and deployed for $TOK"
