#!/usr/bin/env bash
# Publish an anonymous mirror of this repo to a project-owned org.
# Rewrites EVERY commit author/committer to the project identity first, in a
# throwaway clone, so no personal name or email ever reaches the public remote.
#
#   scripts/publish-mirror.sh git@github.com:<anon-org>/zealtoken.git
set -euo pipefail
REMOTE="${1:?usage: publish-mirror.sh <anonymous remote url>}"
case "$REMOTE" in *github.com[:/]zealtoken/*) ;; *) echo "refusing: only the zealtoken org may be a public remote"; exit 2;; esac
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
git clone -q "$SRC" "$TMP/mirror"
cd "$TMP/mirror"
git filter-branch -f --env-filter '
  export GIT_AUTHOR_NAME="Zeal" GIT_AUTHOR_EMAIL="dev@zealtoken.com"
  export GIT_COMMITTER_NAME="Zeal" GIT_COMMITTER_EMAIL="dev@zealtoken.com"
' -- --all >/dev/null
if git log --all --format='%an %ae %cn %ce' | grep -vq "^Zeal dev@zealtoken.com Zeal dev@zealtoken.com$"; then echo "rewrite failed, aborting"; exit 3; fi
PERSONAL="${PERSONAL_PATTERN:-}"  # optional, e.g. a real name; never commit it
if [ -n "$PERSONAL" ] && git grep -qi "$PERSONAL" -- . ':!package-lock.json'; then echo "personal identifier still in tree, aborting"; exit 4; fi
git remote add anon "$REMOTE"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i $HOME/.ssh/zeal_deploy -o IdentitiesOnly=yes}"
git push -f anon main
echo "mirror pushed to $REMOTE with all authors rewritten"
