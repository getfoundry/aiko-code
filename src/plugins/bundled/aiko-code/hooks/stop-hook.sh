#!/bin/bash
# aiko Code Stop hook — thin adapter over core/loop.sh.
# Discovers active sessions in .aiko/aiko-code.*.local.md and runs the
# core for each. If multiple sessions exist, only the most-recently-modified
# one drives this turn (aiko Code's hook contract emits a single response).
set -euo pipefail

PLUGIN_ROOT="${aiko_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STATE_DIR=".aiko"

# Capture stdin once; replay to core.
INPUT=$(cat || true)

shopt -s nullglob

# Backward compat: migrate legacy single-state path → .default session.
if [[ ! -f "$STATE_DIR/aiko-code.default.local.md" && -f "$STATE_DIR/aiko-code.local.md" ]]; then
  mv "$STATE_DIR/aiko-code.local.md" "$STATE_DIR/aiko-code.default.local.md"
  [[ -f "$STATE_DIR/aiko-code.teachings.local.md" ]] && \
    mv "$STATE_DIR/aiko-code.teachings.local.md" "$STATE_DIR/aiko-code.default.teachings.local.md"
fi

# Pick the most-recently-modified session state file (excluding teachings.*).
# Use an explicit glob-expansion array so `ls` is never invoked with zero args
# (which would fall back to listing cwd and pick an unrelated file).
CANDIDATES=( "$STATE_DIR"/aiko-code.*.local.md )
[[ ${#CANDIDATES[@]} -gt 0 ]] || exit 0
FILTERED=()
for f in "${CANDIDATES[@]}"; do
  [[ "$f" == *.teachings.local.md ]] && continue
  FILTERED+=("$f")
done
[[ ${#FILTERED[@]} -gt 0 ]] || exit 0
PICK=$(ls -t "${FILTERED[@]}" | head -1)
[[ -n "$PICK" ]] || exit 0

# Derive session id from filename: aiko-code.<SESSION>.local.md
base=$(basename "$PICK")
SESSION="${base#aiko-code.}"; SESSION="${SESSION%.local.md}"

export FC_PLUGIN_ROOT="$PLUGIN_ROOT"
export FC_STATE_DIR="$STATE_DIR"
export FC_SESSION="$SESSION"
export FC_OUTPUT_FORMAT="aiko-code"
echo "$INPUT" | exec bash "$PLUGIN_ROOT/core/loop.sh"
