#!/usr/bin/env bash
# Commits any changes produced by run.sh to a fresh branch and opens an MR
# via the GitLab API. Requires a project access token in DARK_MATTER_TOKEN
# with 'api' + 'write_repository' scopes.
set -euo pipefail

OUT_DIR=".dark-matter"
CHANGES_FILE="$OUT_DIR/changes_made"

if [[ ! -f "$CHANGES_FILE" ]] || [[ "$(cat "$CHANGES_FILE")" != "1" ]]; then
  echo "No changes to commit. Skipping MR."
  exit 0
fi

if [[ -z "${DARK_MATTER_TOKEN:-}" ]]; then
  echo "ERROR: DARK_MATTER_TOKEN is not set. Add it as a masked CI/CD variable." >&2
  exit 1
fi

TARGET_BRANCH="${CI_DEFAULT_BRANCH:-main}"
DATE_TAG="$(date -u +'%Y%m%d-%H%M%S')"
BRANCH="chore/dark-matter-${DATE_TAG}"

git config user.email "dark-matter-bot@aegis.local"
git config user.name  "Dark Matter Bot"

# Use a token-authenticated remote so we can push.
PUSH_URL="https://oauth2:${DARK_MATTER_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
git remote set-url origin "$PUSH_URL"

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

API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests"

HTTP_CODE=$(curl -sS -o "$OUT_DIR/mr_response.json" -w "%{http_code}" \
  --request POST "$API" \
  --header "PRIVATE-TOKEN: ${DARK_MATTER_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(jq -n \
    --arg source "$BRANCH" \
    --arg target "$TARGET_BRANCH" \
    --arg title "chore(dark-matter): automated cleanup ${DATE_TAG}" \
    --arg desc "$DESCRIPTION" \
    '{source_branch:$source, target_branch:$target, title:$title, description:$desc, remove_source_branch:true, squash:true}')")

echo "GitLab API responded with HTTP $HTTP_CODE"
cat "$OUT_DIR/mr_response.json" || true

if [[ "$HTTP_CODE" -ge 300 ]]; then
  echo "ERROR: Failed to open MR." >&2
  exit 1
fi

echo "Dark Matter MR opened on branch $BRANCH"
