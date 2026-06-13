#!/usr/bin/env bash
# Panic-Button revert generator.
#
# Produces a revert commit on a fresh branch and opens a recovery PR via the
# GitHub CLI.
#
# Inputs (from env):
#   PANIC_REVERT_SHA   - commit SHA to revert. Defaults to HEAD.
#   PANIC_REASON       - short human description of the incident.
#   GITHUB_TOKEN       - GitHub token.
set -euo pipefail

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: No token. Set GITHUB_TOKEN." >&2
  exit 1
fi

TARGET_BRANCH="main"
REASON="${PANIC_REASON:-Production incident detected by external alert.}"
DATE_TAG="$(date -u +'%Y%m%d-%H%M%S')"

git config user.email "panic-bot@aegis.local"
git config user.name  "Panic Button Bot"

# Resolve the commit to revert.
REVERT_SHA="${PANIC_REVERT_SHA:-}"
if [[ -z "$REVERT_SHA" ]]; then
  REVERT_SHA="$(git rev-parse HEAD)"
  echo "PANIC_REVERT_SHA not set; defaulting to HEAD: $REVERT_SHA"
fi

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

gh pr create \
  --title "🚨 Panic revert of ${SHORT_SHA}: ${ORIGINAL_SUBJECT}" \
  --body "$DESCRIPTION" \
  --base main \
  --head "$BRANCH"

echo "Panic revert PR opened on branch $BRANCH"
