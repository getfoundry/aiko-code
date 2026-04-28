#!/bin/bash
# aiko-code statusline — emits a single line for Claude Code's statusLine.command.
# Reads .aiko/aiko-code.*.local.md in $CLAUDE_PROJECT_DIR (or cwd) to detect
# active harness sessions, and always reports taste as on (it's baked in).
set -euo pipefail

CWD="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_DIR="$CWD/.aiko"

active=()
mode_summary=""
if [[ -d "$STATE_DIR" ]]; then
  for f in "$STATE_DIR"/aiko-code.*.local.md; do
    [[ -f "$f" ]] || continue
    [[ "$f" == *.teachings.local.md ]] && continue
    if grep -q '^active: true' "$f" 2>/dev/null; then
      sess=$(basename "$f" .local.md); sess=${sess#aiko-code.}
      mode=$(awk -F'"' '/^mode:/ {print $2; exit}' "$f" 2>/dev/null || true)
      [[ -n "$mode" ]] || mode="restructure"
      glyph=$([[ "$mode" == "experiment" ]] && echo "✶" || echo "△")
      active+=("$glyph $sess")
    fi
  done
fi

if [[ ${#active[@]} -eq 0 ]]; then
  harness="idle"
else
  harness=$(IFS=,; echo "${active[*]}")
fi

printf 'aiko ◉ taste:on  harness:%s\n' "$harness"
