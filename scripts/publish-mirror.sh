#!/usr/bin/env bash
# Publish an anonymous mirror of this repo to the project org.
#
# In a throwaway clone it rewrites the ENTIRE history: every author and
# committer becomes the project identity, EXCLUDE_PATHS (space-separated) are
# dropped from every commit, co-author trailers are stripped, and any strings in
# the file named by REPLACEMENTS (git-filter-repo --replace-text format, kept
# outside the repo) are replaced in all file contents. It then greps the whole
# rewritten history for PERSONAL_PATTERN and refuses to push if anything is left.
#
#   REPLACEMENTS=~/private/replacements.txt MSG_REPLACEMENTS=~/private/msg.txt \
#   EXCLUDE_PATHS='.localdir' PERSONAL_PATTERN='name\|handle' \
#     scripts/publish-mirror.sh git@github.com:zealtoken/zealtoken.git
set -euo pipefail
REMOTE="${1:?usage: publish-mirror.sh <remote>}"
case "$REMOTE" in *github.com[:/]zealtoken/*) ;; *) echo "refusing: only the zealtoken org may be a public remote"; exit 2;; esac
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
git clone -q --no-local "$SRC" "$TMP/mirror"
cd "$TMP/mirror"
git remote remove origin
# mailmap: every existing identity becomes the project identity
git log --all --format='%an <%ae>%n%cn <%ce>' | sort -u | sed 's/^/Zeal <dev@zealtoken.com> /' > "$TMP/mailmap"
printf 'regex:(?m)^Co-Authored-By:.*\n?==>\n' > "$TMP/msgmap"
[ -n "${MSG_REPLACEMENTS:-}" ] && cat "$MSG_REPLACEMENTS" >> "$TMP/msgmap"
ARGS=(--force --mailmap "$TMP/mailmap" --replace-message "$TMP/msgmap")
for d in ${EXCLUDE_PATHS:-}; do ARGS+=(--path "$d"); done
[ -n "${EXCLUDE_PATHS:-}" ] && ARGS+=(--invert-paths)
[ -n "${REPLACEMENTS:-}" ] && ARGS+=(--replace-text "$REPLACEMENTS")
git filter-repo "${ARGS[@]}"
if git log --all --format='%an %ae %cn %ce' | grep -vq '^Zeal dev@zealtoken.com Zeal dev@zealtoken.com$'; then echo "author rewrite failed"; exit 3; fi
if git log --all --format='%B' | grep -qi 'co-authored-by'; then echo "trailer strip failed"; exit 3; fi
for d in ${EXCLUDE_PATHS:-}; do if git log --all --name-only --format= | grep -q "^$d/"; then echo "$d still in history"; exit 3; fi; done
if [ -n "${PERSONAL_PATTERN:-}" ] && git log --all -p | grep -qi "$PERSONAL_PATTERN"; then echo "personal identifier still in HISTORY, aborting"; exit 4; fi
git remote add anon "$REMOTE"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i $HOME/.ssh/zeal_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new}"
git push -f anon HEAD:main
echo "mirror pushed: $(git rev-list --count HEAD) commits, all history rewritten"
