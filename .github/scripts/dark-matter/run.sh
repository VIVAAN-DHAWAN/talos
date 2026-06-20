#!/usr/bin/env bash
# dark-matter/run.sh — runs Knip + Depcheck, applies cleanup, reports changes.
#
# Design rules:
#   - Every step `set -e`'s on failure; no silent fall-through.
#   - No `cd` outside the repo root; the caller pins the cwd.
#   - Branch / PR creation lives in open-pr.sh, not here.
#   - Output is line-oriented so the Talos backend can parse a small
#     well-known marker (`CHANGES_MADE=YES|NO`) without regex on prose.
#
# Usage: bash run.sh
# Env:  none required. Caller should set PATH to include node/npx.

set -euo pipefail

# Resolve repo root from script location so the script is location-independent.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DM_DIR="$REPO_ROOT/.dark-matter"

mkdir -p "$DM_DIR"
SUMMARY="$DM_DIR/summary.md"
CHANGES_FLAG="$DM_DIR/changes_made"

: > "$SUMMARY"
echo "NO" > "$CHANGES_FLAG"

log() { printf '[dark-matter] %s\n' "$*" >&2; }

# Knip — unused files, exports, dependencies. JSON reporter for parsing.
log "running knip"
KNIP_JSON="$DM_DIR/knip.json"
if npx --no-install knip --reporter json > "$KNIP_JSON" 2> "$DM_DIR/knip.err"; then
  log "knip ok"
else
  log "knip failed (continuing — its output is still parsed)"
fi

# Parse unused files out of the Knip JSON via node (jq not guaranteed).
UNUSED_FILES_JSON="$(node -e '
  const fs = require("fs");
  try {
    const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const files = (j.files || []).map(f => f.path).filter(Boolean);
    console.log(JSON.stringify(files));
  } catch {
    console.log("[]");
  }
' "$KNIP_JSON" 2>/dev/null || echo '[]')"

mapfile -t UNUSED_FILES < <(node -e 'console.log(JSON.parse(process.argv[1]).join("\n"))' "$UNUSED_FILES_JSON")

if [ "${#UNUSED_FILES[@]}" -gt 0 ] && [ -n "${UNUSED_FILES[0]:-}" ]; then
  log "removing ${#UNUSED_FILES[@]} unused file(s)"
  for f in "${UNUSED_FILES[@]}"; do
    if [ -n "$f" ] && [ -f "$REPO_ROOT/$f" ]; then
      rm -f "$REPO_ROOT/$f"
      echo "rm $f" >> "$SUMMARY"
    fi
  done
  echo "YES" > "$CHANGES_FLAG"
fi

# Depcheck — unused deps. JSON output.
log "running depcheck"
DEPCHECK_JSON="$DM_DIR/depcheck.json"
if npx --no-install depcheck --json > "$DEPCHECK_JSON" 2> "$DM_DIR/depcheck.err"; then
  log "depcheck ok"
else
  log "depcheck failed (continuing)"
fi

UNUSED_DEPS="$(node -e '
  const fs = require("fs");
  try {
    const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const deps = (j.dependencies || []);
    console.log(deps.join("\n"));
  } catch {
    console.log("");
  }
' "$DEPCHECK_JSON" 2>/dev/null || echo '')"

if [ -n "$UNUSED_DEPS" ]; then
  mapfile -t DEP_ARRAY <<< "$UNUSED_DEPS"
  # Filter empty lines.
  DEP_ARRAY=("${DEP_ARRAY[@]/#/}")
  DEP_ARRAY=("${DEP_ARRAY[@]}" )
  REAL_DEPS=()
  for d in "${DEP_ARRAY[@]}"; do
    [ -n "$d" ] && REAL_DEPS+=("$d")
  done
  if [ "${#REAL_DEPS[@]}" -gt 0 ]; then
    log "uninstalling ${#REAL_DEPS[@]} unused dep(s)"
    # npm uninstall with explicit names — no shell expansion surprises.
    npm uninstall --no-save "${REAL_DEPS[@]}" >&2 || log "npm uninstall failed (continuing)"
    for d in "${REAL_DEPS[@]}"; do
      echo "uninstall $d" >> "$SUMMARY"
    done
    echo "YES" > "$CHANGES_FLAG"
  fi
fi

# Surface result for the backend.
if [ "$(cat "$CHANGES_FLAG")" = "YES" ]; then
  echo "CHANGES_MADE=YES"
  log "done with changes"
else
  echo "CHANGES_MADE=NO"
  log "done without changes"
fi
