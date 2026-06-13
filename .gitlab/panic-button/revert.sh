#!/usr/bin/env bash
# Panic-Button revert generator.
#
# Produces a revert commit on a fresh branch and opens a recovery MR via the
# GitLab API. Designed to run in a pipeline triggered externally (e.g. by a
# Sentry alert hitting GitLab's pipeline trigger API).
#
# Inputs (CI/CD variables):
#   PANIC_REVERT_SHA   - commit SHA to revert. Defaults to HEAD of the default
#                        branch if not provided.
#   PANIC_REASON       - short human description of the incident (optional).
#   PANIC_TOKEN        - access token with 'api' + 'write_repository' scopes.
#                        Falls back to DARK_MATTER_TOKEN if PANIC_TOKEN unset.
#
# Provided automatically by GitLab CI:
#   CI_API_V4_URL, CI_PROJECT_ID, CI_PROJECT_PATH, CI_SERVER_HOST,
#   CI_DEFAULT_BRANCH
set -euo pipefail

TOKEN="${PANIC_TOKEN:-${DARK_MATTER_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: No token. Set PANIC_TOKEN (or DARK_MATTER_TOKEN) as a masked CI/CD variable." >&2
  exit 1
fi

TARGET_BRANCH="${CI_DEFAULT_BRANCH:-main}"
REASON="${PANIC_REASON:-Production incident detected by external alert.}"
DATE_TAG="$(date -u +'%Y%m%d-%H%M%S')"

git config user.email "panic-bot@aegis.local"
git config user.name  "Panic Button Bot"

# Ensure we have full history and are on the target branch tip.
git fetch --quiet origin "$TARGET_BRANCH"
git checkout --quiet "$TARGET_BRANCH"
git reset --hard --quiet "origin/${TARGET_BRANCH}"

# Resolve the commit to revert.
REVERT_SHA="${PANIC_REVERT_SHA:-}"
if [[ -z "$REVERT_SHA" ]]; then
  REVERT_SHA="$(git rev-parse HEAD)"
  echo "PANIC_REVERT_SHA not set; defaulting to HEAD: $REVERT_SHA"
fi

# Validate the SHA exists.
if ! git cat-file -e "${REVERT_SHA}^{commit}" 2>/dev/null; then
  echo "ERROR: commit $REVERT_SHA not found in history." >&2
  exit 1
fi

SHORT_SHA="$(git rev-parse --short "$REVERT_SHA")"
ORIGINAL_SUBJECT="$(git log -1 --format='%s' "$REVERT_SHA")"
BRANCH="panic/revert-${SHORT_SHA}-${DATE_TAG}"

git checkout -b "$BRANCH"

# --no-edit keeps the default revert message; -m 1 handles merge commits safely.
if git rev-list --merges --max-count=1 "${REVERT_SHA}^..${REVERT_SHA}" | grep -q .; then
  REVERT_ARGS=(--no-edit -m 1)
else
  REVERT_ARGS=(--no-edit)
fi

if ! git revert "${REVERT_ARGS[@]}" "$REVERT_SHA"; then
  echo "ERROR: git revert produced conflicts; aborting for manual handling." >&2
  git revert --abort || true
  exit 1
fi

PUSH_URL="https://oauth2:${TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
git remote set-url origin "$PUSH_URL"
git push -u origin "$BRANCH"

DESCRIPTION="## 🚨 Panic-Button automated revert

An external alert triggered an automated revert.

**Reverted commit:** \`${SHORT_SHA}\` - ${ORIGINAL_SUBJECT}
**Reason:** ${REASON}

### What to do
1. Confirm this revert resolves the incident.
2. Merge to restore the last-known-good state.
3. Open a follow-up to fix the root cause forward.

---
_Opened automatically by the Panic-Button pipeline._"

API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/merge_requests"

HTTP_CODE=$(curl -sS -o panic_mr_response.json -w "%{http_code}" \
  --request POST "$API" \
  --header "PRIVATE-TOKEN: ${TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(jq -n \
    --arg source "$BRANCH" \
    --arg target "$TARGET_BRANCH" \
    --arg title "🚨 Panic revert of ${SHORT_SHA}: ${ORIGINAL_SUBJECT}" \
    --arg desc "$DESCRIPTION" \
    '{source_branch:$source, target_branch:$target, title:$title, description:$desc, remove_source_branch:true}')")

echo "GitLab API responded with HTTP $HTTP_CODE"
cat panic_mr_response.json || true

if [[ "$HTTP_CODE" -ge 300 ]]; then
  echo "ERROR: Failed to open panic revert MR." >&2
  exit 1
fi

echo "Panic revert MR opened on branch $BRANCH"
