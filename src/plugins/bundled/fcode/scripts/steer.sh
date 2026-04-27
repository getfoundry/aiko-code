#!/bin/bash
# steer.sh — rewrite the north_star: line in a session's state file at any time.
# Usage: steer.sh [--session NAME] [--state-dir DIR] "<new north star>"
set -euo pipefail

SESSION="default"
STATE_DIR=""
PARTS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --session) SESSION="$2"; shift 2;;
    --state-dir) STATE_DIR="$2"; shift 2;;
    -h|--help)
      cat <<EOF
steer.sh — change the north star of a running aiko-code session.
Usage: steer.sh [--session NAME] [--state-dir DIR] "<new north star>"
Auto-detects state-dir from .aiko/, .codex/, .opencode/ if not given.
EOF
      exit 0;;
    *) PARTS+=("$1"); shift;;
  esac
done

NORTH_STAR="${PARTS[*]:-}"
[[ -n "$NORTH_STAR" ]] || { echo "steer: provide a north-star string" >&2; exit 1; }

if [[ -z "$STATE_DIR" ]]; then
  for d in .aiko .codex .opencode; do
    if [[ -f "$d/aiko-code.$SESSION.local.md" ]]; then STATE_DIR="$d"; break; fi
  done
fi
[[ -n "$STATE_DIR" ]] || { echo "steer: no state dir found for session '$SESSION'" >&2; exit 1; }

STATE_FILE="$STATE_DIR/aiko-code.$SESSION.local.md"
[[ -f "$STATE_FILE" ]] || { echo "steer: no state file at $STATE_FILE" >&2; exit 1; }

# Escape for sed replacement.
ESCAPED=$(printf '%s' "$NORTH_STAR" | sed 's/[\&/]/\\&/g')

if grep -q '^north_star:' "$STATE_FILE"; then
  TMP="${STATE_FILE}.tmp.$$"
  sed "s/^north_star: .*/north_star: \"$ESCAPED\"/" "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"
else
  TMP="${STATE_FILE}.tmp.$$"
  awk -v ns="north_star: \"$NORTH_STAR\"" '
    /^---$/ { c++; print; if (c==1) print ns; next }
    { print }
  ' "$STATE_FILE" > "$TMP"
  mv "$TMP" "$STATE_FILE"
fi

echo "🧭 north_star [$SESSION] → $NORTH_STAR"
