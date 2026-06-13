#!/usr/bin/env bash
# Dark Matter scanner: detects stack, runs the matching tools,
# and writes a normalized report + applies safe removals to the working tree.
#
# Currently implements Node/TypeScript via knip + depcheck.
# Other stacks (Python, Go, ...) can be added by following the same pattern.
set -euo pipefail

OUT_DIR=".dark-matter"
mkdir -p "$OUT_DIR"

SUMMARY="$OUT_DIR/summary.md"
CHANGES_MADE=0

: > "$SUMMARY"
echo "# Dark Matter report" >> "$SUMMARY"
echo "" >> "$SUMMARY"
echo "_Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')_" >> "$SUMMARY"
echo "" >> "$SUMMARY"

#------------------------------------------------------------------------------
# Node / TypeScript
#------------------------------------------------------------------------------
if [[ -f package.json ]]; then
  echo "## Node / TypeScript" >> "$SUMMARY"
  echo "" >> "$SUMMARY"

  # --- knip: unused files + exports -------------------------------------------
  echo "==> Running knip"
  npx --yes knip --reporter json > "$OUT_DIR/knip.json" || true

  # Delete fully-unused files reported by knip.
  UNUSED_FILES=$(jq -r '.files // [] | .[]' "$OUT_DIR/knip.json" 2>/dev/null || true)
  if [[ -n "${UNUSED_FILES:-}" ]]; then
    echo "" >> "$SUMMARY"
    echo "### Removed unused files" >> "$SUMMARY"
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      if [[ -f "$f" ]]; then
        echo "  - removing $f"
        git rm -f "$f" >/dev/null
        echo "- \`$f\`" >> "$SUMMARY"
        CHANGES_MADE=1
      fi
    done <<< "$UNUSED_FILES"
  fi

  # Record (but do not auto-remove) individual unused exports.
  UNUSED_EXPORTS=$(jq -r '
    (.issues // []) | .[] |
    .file as $f |
    ((.exports // [])[] | "  - \($f): \(.name)")
  ' "$OUT_DIR/knip.json" 2>/dev/null || true)
  if [[ -n "${UNUSED_EXPORTS:-}" ]]; then
    echo "" >> "$SUMMARY"
    echo "### Unused exports (manual review)" >> "$SUMMARY"
    echo '```' >> "$SUMMARY"
    echo "$UNUSED_EXPORTS" >> "$SUMMARY"
    echo '```' >> "$SUMMARY"
  fi

  # --- depcheck: unused dependencies ------------------------------------------
  echo "==> Running depcheck"
  npx --yes depcheck --json > "$OUT_DIR/depcheck.json" || true

  UNUSED_DEPS=$(jq -r '.dependencies // [] | .[]' "$OUT_DIR/depcheck.json" 2>/dev/null || true)
  if [[ -n "${UNUSED_DEPS:-}" ]]; then
    echo "" >> "$SUMMARY"
    echo "### Removed unused dependencies" >> "$SUMMARY"
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      echo "  - uninstalling $dep"
      npm uninstall "$dep" >/dev/null 2>&1 || true
      echo "- \`$dep\`" >> "$SUMMARY"
      CHANGES_MADE=1
    done <<< "$UNUSED_DEPS"
  fi
fi

#------------------------------------------------------------------------------
# Future: Python (vulture, deptry), Go (deadcode, go mod tidy), ...
#------------------------------------------------------------------------------

if [[ "$CHANGES_MADE" -eq 0 ]]; then
  echo "" >> "$SUMMARY"
  echo "_No safe removals found this run._" >> "$SUMMARY"
fi

echo "$CHANGES_MADE" > "$OUT_DIR/changes_made"
echo "==> Dark Matter scan complete (changes_made=$CHANGES_MADE)"
