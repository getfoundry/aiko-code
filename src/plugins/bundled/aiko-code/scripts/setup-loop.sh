#!/bin/bash
# aiko-code — 9-phase development loop (1 survey, 2 boundaries, 3 skeleton, 4 signals, 5 edges, 6 integration, 7 verdict, 8 audit, 9 ship).
# Multi-session aware: pass --session NAME to run multiple loops in one repo.
set -euo pipefail

PROMPT_PARTS=()
COMPLETION_PROMISE="SHIPPED"
SESSION="default"
NORTH_STAR=""
STATE_DIR=".aiko"

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat <<'HELP_EOF'
aiko-code — 9 phase steps with multi-session + live steering.

USAGE:
  /loop [TASK...] [OPTIONS]

OPTIONS:
  --session NAME                 Session id (default: "default"). Each session
                                 has its own state file and runs independently.
  --north-star "<text>"          Initial north star (re-injected each step).
  --completion-promise '<text>'  Phrase to output as <promise>TEXT</promise>
                                 when Step 9 (Ship) verdict is PROMOTE. Default: SHIPPED.
  --state-dir DIR                Where to write state (default: .aiko;
                                 use .codex or .opencode for those harnesses).
  -h, --help                     Show this help

EXAMPLES:
  /loop Build a markdown blog generator
  /loop --session refactor "Pull auth out of routes" --north-star "no behavior change"
HELP_EOF
      exit 0;;
    --completion-promise) COMPLETION_PROMISE="$2"; shift 2;;
    --session)            SESSION="$2"; shift 2;;
    --north-star)         NORTH_STAR="$2"; shift 2;;
    --state-dir)          STATE_DIR="$2"; shift 2;;
    *) PROMPT_PARTS+=("$1"); shift;;
  esac
done

PROMPT="${PROMPT_PARTS[*]}"
[[ -n "$PROMPT" ]] || { echo "Error: no task provided." >&2; exit 1; }

mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/aiko-code.$SESSION.local.md"
TEACHINGS_FILE="$STATE_DIR/aiko-code.$SESSION.teachings.local.md"

{
  printf -- '---\n'
  printf 'active: true\n'
  printf 'step: 0\n'
  printf 'harness_ws:\n'
  printf 'completion_promise: "%s"\n' "$COMPLETION_PROMISE"
  [[ -n "$NORTH_STAR" ]] && printf 'north_star: "%s"\n' "$NORTH_STAR"
  printf 'started_at: "%s"\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf -- '---\n\n'
  printf '%s\n' "$PROMPT"
} > "$STATE_FILE"

if [[ ! -f "$TEACHINGS_FILE" ]]; then
  cat > "$TEACHINGS_FILE" <<EOF
# aiko-code — Teachings Log [$SESSION]

Task: $PROMPT
Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
fi

cat <<EOF
◆  aiko-code active [session: $SESSION]. Nine phases.

Task:              $PROMPT
Session:           $SESSION   (state: $STATE_FILE)
Step:              1/9 (Survey)
Completion phrase: $COMPLETION_PROMISE (output only when PROMOTE is TRUE)
North star:        ${NORTH_STAR:-<unset — set with /steer or scripts/steer.sh>}

Steer mid-flight:
  bash \${aiko_PLUGIN_ROOT}/scripts/steer.sh --session $SESSION "<new north star>"

Stop early:        /cancel --session $SESSION
Read the log:   /log --session $SESSION

TASK:
$PROMPT
EOF
