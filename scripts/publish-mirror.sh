#!/usr/bin/env bash
# Publish an anonymous mirror of this repo to a project-owned org.
# Rewrites EVERY commit author/committer to the project identity first, in a
# throwaway clone, so no personal name or email ever reaches the public remote.
#
#   scripts/publish-mirror.sh git@github.com:<anon-org>/zealtoken.git
set -euo pipefail
REMOTE="${1:?usage: publish-mirror.sh <anonymous remote url>}"
case "$REMOTE" in *kylekmcconnell*|*mcconnell*) echo "refusing: remote is a personal account"; exit 2;; esac
SRC="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
git clone -q "$SRC" "$TMP/mirror"
cd "$TMP/mirror"
git filter-branch -f --env-filter '
  export GIT_AUTHOR_NAME="Zeal" GIT_AUTHOR_EMAIL="dev@zealtoken.com"
  export GIT_COMMITTER_NAME="Zeal" GIT_COMMITTER_EMAIL="dev@zealtoken.com"
' -- --all >/dev/null
if git log --all --format='%an %ae %cn %ce' | grep -qi "mcconnell\|kyle@"; then echo "rewrite failed, aborting"; exit 3; fi
if git grep -qi "mcconnell\|kylekmcconnell" -- . ':!package-lock.json' ; then echo "personal identifier still in tree, aborting"; git grep -il "mcconnell" -- . ':!package-lock.json'; exit 4; fi
git remote add anon "$REMOTE"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i $HOME/.ssh/zeal_deploy -o IdentitiesOnly=yes}"
git push -f anon main
echo "mirror pushed to $REMOTE with all authors rewritten"
