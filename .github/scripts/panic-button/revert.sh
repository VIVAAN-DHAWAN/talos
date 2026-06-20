#!/usr/bin/env bash
# panic-button/revert.sh — reverts a commit and opens a recovery PR.
#
# Design rules:
#   - SHA is validated via `git cat-file -e` before any destructive op.
#   - HEAD is the default when no SHA is supplied.
#   - Merge commits are rejected — they need `-m <parent>` and that's a
#     human decision.
#   - Branch name is deterministic: panic/revert-<short-sha>.
#   - The revert itself uses `git revert --no-edit` so the commit
#     message is the canonical "Revert <sha> ..." form.
#   - The recovery PR is opened with `gh pr create` after push succeeds.
#   - `git revert --abort` is called if anything fails between revert
#     and push, so the working tree is left clean.
#
# Usage: bash revert.sh [SHA]
# Env:  GH_TOKEN (required)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "ERROR: GH_TOKEN is required." >&2
  exit 65
fi
export GH_TOKEN

SHA_ARG="${1:-}"
if [ -z "$SHA_ARG" ]; then
  SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
else
  # Validate format: 7..40 hex chars.
  if ! printf '%s' "$SHA_ARG" | grep -Eq '^[0-9a-f]{7,40}$'; then
    echo "ERROR: SHA must be 7..40 hex characters. Got: $SHA_ARG" >&2
    exit 64
  fi
  # Resolve to a full SHA and confirm it points at a commit.
  if ! SHA="$(git -C "$REPO_ROOT" rev-parse "$SHA_ARG" 2>/dev/null)"; then
    echo "ERROR: could not resolve SHA: $SHA_ARG" >&2
    exit 64
  fi
  if ! git -C "$REPO_ROOT" cat-file -e "${SHA}^{commit}" 2>/dev/null; then
    echo "ERROR: SHA does not point at a commit: $SHA" >&2
    exit 64
  fi
fi

# Reject merge commits.
PARENTS="$(git -C "$REPO_ROOT" rev-list --parents -n 1 "$SHA" | awk '{ print NF }')"
if [ "$PARENTS" -gt 2 ]; then
  echo "ERROR: $SHA is a merge commit. Reverting a merge requires specifying -m <parent>." >&2
  exit 66
fi

SHORT="${SHA:0:12}"
BRANCH="panic/revert-${SHORT}"

git -C "$REPO_ROOT" checkout -b "$BRANCH" --no-gpg-sign 2>/dev/null || \
  git -C "$REPO_ROOT" switch -c "$BRANCH"

if ! git -C "$REPO_ROOT" revert --no-edit "$SHA"; then
  git -C "$REPO_ROOT" revert --abort 2>/dev/null || true
  echo "ERROR: git revert failed for $SHA" >&2
  exit 70
fi

git -C "$REPO_ROOT" push -u origin "$BRANCH"

PR_URL="$(gh pr create \
  --head "$BRANCH" \
  --title "panic: revert ${SHORT}" \
  --body "Operator-initiated panic revert of \`$SHA\`.

## Why
Reverts commit \`$SHA\`.

## Validation
Reviewer should confirm CI is green before merge and confirm the revert
does not silently re-open a fixed vulnerability.")"

echo "PR_URL=$PR_URL"
echo "BRANCH=$BRANCH"
echo "SHA=$SHA"
