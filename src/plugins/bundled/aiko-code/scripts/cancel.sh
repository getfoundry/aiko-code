#!/bin/bash
# cancel.sh — cancel one or all Aiko Code sessions in this repo.
set -euo pipefail
SESSION=""; ALL=0; STATE_DIR=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --session) SESSION="$2"; shift 2;;
    --all) ALL=1; shift;;
    --state-dir) STATE_DIR="$2"; shift 2;;
    -h|--help) echo "cancel.sh [--session NAME | --all] [--state-dir DIR]"; exit 0;;
    *) shift;;
  esac
done
[[ -z "$STATE_DIR" ]] && for d in .aiko .codex .opencode; do [[ -d "$d" ]] && STATE_DIR="$d" && break; done
[[ -n "$STATE_DIR" ]] || { echo "no state dir found"; exit 0; }

shopt -s nullglob
if [[ "$ALL" == "1" ]]; then
  files=("$STATE_DIR"/aiko-code.*.local.md)
else
  SESSION="${SESSION:-default}"
  files=("$STATE_DIR/aiko-code.$SESSION.local.md")
fi

n=0
for f in "${files[@]}"; do
  case "$f" in *.teachings.local.md) continue;; esac
  [[ -f "$f" ]] || continue
  base=$(basename "$f"); s="${base#aiko-code.}"; s="${s%.local.md}"
  step=$(sed -n 's/^step: //p' "$f" | head -1)
  rm -f "$f"
  echo "◆ Canceled [$s] on Step ${step:-?}/9. Teachings kept at $STATE_DIR/aiko-code.$s.teachings.local.md"
  n=$((n+1))
done
if [[ "$n" == "0" ]]; then echo "No active session to cancel."; fi
exit 0
