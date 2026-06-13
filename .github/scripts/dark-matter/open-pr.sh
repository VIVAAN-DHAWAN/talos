#!/usr/bin/env bash
# Commits any changes produced by run.sh to a fresh branch and opens a PR
# via the GitHub CLI. Requires GITHUB_TOKEN in environment.
set -euo pipefail

OUT_DIR=".dark-matter"
CHANGES_FILE="$OUT_DIR/changes_made"

if [[ ! -f "$CHANGES_FILE" ]] || [[ "$(cat "$CHANGES_FILE")" != "1" ]]; then
  echo "No changes to commit. Skipping PR."
  exit 0
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_TOKEN is not set." >&2
  exit 1
fi

DATE_TAG="$(date -u +'%Y%m%d-%H%M%S')"
BRANCH="chore/dark-matter-${DATE_TAG}"

git config user.email "dark-matter-bot@aegis.local"
git config user.name  "Dark Matter Bot"

git checkout -b "$BRANCH"
git add -A
if git diff --cached --quiet; then
  echo "Working tree clean after staging. Nothing to commit."
  exit 0
fi

git commit -m "chore(dark-matter): remove unused files, exports, and dependencies"
git push -u origin "$BRANCH"

SUMMARY_FILE="$OUT_DIR/summary.md"
DESCRIPTION="$(cat "$SUMMARY_FILE" 2>/dev/null || echo 'Automated Dark Matter cleanup.')"
DESCRIPTION="${DESCRIPTION}

---
_Opened automatically by the Dark Matter scheduled pipeline._"

gh pr create \
  --title "chore(dark-matter): automated cleanup ${DATE_TAG}" \
  --body "$DESCRIPTION" \
  --base main \
  --head "$BRANCH"

echo "Dark Matter PR opened on branch $BRANCH"
