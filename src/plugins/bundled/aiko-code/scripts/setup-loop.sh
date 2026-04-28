#!/bin/bash
# aiko-code — 9-step harness driver.
#
# Same architecture as jstack: writes a state file with step=0, then the
# native Stop hook (core/loop.sh) reads the state, advances the step, and
# injects step N's playbook on every assistant Stop until step 9 emits the
# completion promise. Per-step Fibonacci parallelism budget. Optional
# fib-harness break for stuck steps.
#
# Multi-session aware: pass --session NAME to run multiple loops in one repo.
set -euo pipefail

PROMPT_PARTS=()
COMPLETION_PROMISE="SHIPPED"
SESSION="default"
NORTH_STAR=""
STATE_DIR=".aiko"
PLUGIN_ROOT="${aiko_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat <<'HELP_EOF'
aiko-code — 9-step harness with multi-session and live steering.

USAGE:
  /guide [TASK...] [OPTIONS]

OPTIONS:
  --session NAME                 Session id (default: "default"). Each session
                                 has its own state file and runs independently.
  --north-star "<text>"          Initial north star (re-injected each step).
  --completion-promise '<text>'  Phrase to output as <promise>TEXT</promise>
                                 when step 9 (Ship) lands.
                                 Default: SHIPPED.
  --state-dir DIR                Where to write state (default: .aiko).
  -h, --help                     Show this help.

NINE STEPS (Fibonacci parallelism per step):
  1 Survey       inventory — read, search, enumerate. No building.    (1)
  2 Boundaries   architecture — layers, contracts, separations.       (1)
  3 Skeleton     first artifacts — stub, draft, walking skeleton.     (2)
  4 Signals      tests, types, metrics — three independent axes.      (3)
  5 Edges        adversarial, concurrency, partial failure.           (5)
  6 Integration  end-to-end flows.                                    (8)
  7 Verdict      single-threaded promote / hold / reject.             (1)
  8 Audit        adversarial cold review by 13 independent slices.   (13)
  9 Ship         publish, tag, hand off; emit <promise>.             (21)

If a step cannot close in one pass, break into a fib-harness child:
  bash <PLUGIN_ROOT>/scripts/break-harness.sh --step <N> --session <S> --scope "<stuck>"

EXAMPLES:
  /guide Build a markdown blog generator
  /guide --session refactor "Pull auth out of routes" --north-star "no behavior change"
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
  printf 'session: "%s"\n' "$SESSION"
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
<harness-directive priority="absolute">
You are inside an active aiko-code 9-step harness session. The text below
is your operating contract — not a description for the user. Do not
paraphrase. Do not ask for confirmation.

This is a STOP-DRIVEN loop. Setup just wrote $STATE_FILE with step=0. At
the end of every assistant turn, the native Stop hook fires core/loop.sh,
which reads the state file, advances to step N+1, and injects that step's
playbook (principle, problem map, fib budget, work). Do the current step's
work, append a one-line teachings entry, then stop normally — the hook
delivers the next step. Do not pre-empt. Do not skip ahead.

If a step cannot close in one pass, run:
  bash $PLUGIN_ROOT/scripts/break-harness.sh --step <N> --session $SESSION --scope "<what is stuck>"
That populates harness_ws in the state file and the next Stop fires the
fib-harness child cycle scoped to the stuck sub-problem.
</harness-directive>

aiko-code [session: $SESSION] — 9-step harness armed.

Task:              $PROMPT
Session:           $SESSION   (state: $STATE_FILE)
Step:              about to enter 1/9 (Survey)
Completion phrase: $COMPLETION_PROMISE   (output only at step 9 PROMOTE)
North star:        ${NORTH_STAR:-<unset — set with /steer>}
Plugin root:       $PLUGIN_ROOT

Your immediate next action: produce a brief one-paragraph acknowledgement
and stop. The Stop hook will then inject step 1 (Survey).

Stop early:        /cancel --session $SESSION
Read the log:      /log    --session $SESSION
Re-aim mid-flight: /steer  --session $SESSION "<new north star>"

TASK:
$PROMPT
EOF
