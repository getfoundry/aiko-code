#!/bin/bash
# aiko-code — fractal harness driver.
# Initializes a fib-harness workspace for the task and emits a self-driving
# playbook. The agent runs the full harness cycle (init -> dimensions -> 20
# agents fan-out -> judge -> spawn-child on fail -> verdict) within one
# conversation, recursively, until verdict=promote.
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
aiko-code — fractal subagent harness.

USAGE:
  /auto [TASK...] [OPTIONS]

OPTIONS:
  --session NAME                 Session id (default: "default").
  --north-star "<text>"          Optional steering directive.
  --completion-promise '<text>'  Phrase emitted as <promise>TEXT</promise>
                                 when fib-harness verdict=promote. Default: SHIPPED.
  --state-dir DIR                Where to write state (default: .aiko).
  -h, --help                     Show this help.

EXAMPLES:
  /auto Build a markdown blog generator
  /auto --session refactor "Pull auth out of routes" --north-star "no behavior change"
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

# Init fib-harness workspace for the project root.
WS_JSON=$("$PLUGIN_ROOT/scripts/fib-harness" init "$(pwd)")
WS=$(printf '%s' "$WS_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace'])")
[[ -n "$WS" ]] || { echo "Error: fib-harness init failed." >&2; exit 1; }

{
  printf -- '---\n'
  printf 'active: true\n'
  printf 'session: "%s"\n' "$SESSION"
  printf 'workspace: "%s"\n' "$WS"
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
aiko-code [session: $SESSION] — fractal harness initialized.

Task:        $PROMPT
Workspace:   $WS
Session:     $SESSION   (state: $STATE_FILE)
North star:  ${NORTH_STAR:-<unset — set via /steer>}
Promise:     $COMPLETION_PROMISE  (emit only when verdict=promote)

═══════════════════════════════════════════════════════════════════
SELF-DRIVING PLAYBOOK — run this entire flow now, in one conversation.
Do not stop between phases. Spawn subagents in parallel.
═══════════════════════════════════════════════════════════════════

PHASE 0 — DECLARE 6 DIMENSIONS
Write a JSON file at $WS/state/dims.json with this shape:
  {
    "domain": "<one of: code, content, sales, fundraising, research,
                operations, product, ml, growth>",
    "problem": "<one-line restatement of the task>",
    "dimensions": [
      { "name": "<L1 dim>", "phase": "survey",       "question": "...",
        "primitive_type": "code|skill|hybrid", "primitive_name": "...",
        "success_criteria": "...", "commands": [...] OR "skill_invocation": {...} },
      { ..., "phase": "boundaries", ... },
      { ..., "phase": "skeleton", ... },
      { ..., "phase": "signals", ... },
      { ..., "phase": "edges", ... },
      { ..., "phase": "integration", ... }
    ]
  }
Then register:
  $PLUGIN_ROOT/scripts/fib-harness dimensions $WS @$WS/state/dims.json
  $PLUGIN_ROOT/scripts/fib-harness plan $WS

PHASE 1..6 — PARALLEL FAN-OUT (Fibonacci budget: 1,1,2,3,5,8 = 20 agents)
For each level L in 1..6, spawn fib[L-1] subagents IN PARALLEL via the Agent
tool (single message, multiple tool_use blocks). Each subagent owns one slice
of that level's dimension and returns a JSON artifact:
  {
    "level": <L>,
    "agent_id": "L<L>-a<n>",
    "dimension": "<dim name>",
    "summary": "<1-2 sentences>",
    "hypotheses": [
      { "id": "h1", "claim": "...", "evidence": "...",
        "status": "pass|fail|unknown",
        "blocking": true|false,
        "repair_hint": "<if fail>" }
    ]
  }
Collect each artifact:
  $PLUGIN_ROOT/scripts/fib-harness collect $WS <L> <agent_id> @<artifact.json>
After all fib[L-1] agents at level L return, run:
  $PLUGIN_ROOT/scripts/fib-harness level-check $WS <L>
Proceed to next level only when level-check shows COMPLETE.

PHASE 7 — JUDGE
  $PLUGIN_ROOT/scripts/fib-harness judge $WS

  - verdict=pass -> go to PHASE 9.
  - verdict=needs_repair -> for each blocking_failure, run PHASE 8 (fractal).
  - verdict=needs_investigation -> spawn investigator subagents to resolve
    unknowns, then re-judge.

PHASE 8 — FRACTAL CHILD HARNESS (recurse, max depth 3)
For each blocking failure F:
  CHILD=\$($PLUGIN_ROOT/scripts/fib-harness spawn-child $WS <F.id> "<F.claim>")
  # Re-enter PHASE 0 against CHILD workspace, recursively.
  # When child verdict lands:
  $PLUGIN_ROOT/scripts/fib-harness link-child $WS \$CHILD
After all children resolved, re-judge the parent ($WS).

PHASE 9 — VERDICT + SHIP
  $PLUGIN_ROOT/scripts/fib-harness verdict $WS
  - verdict=promote -> emit <promise>$COMPLETION_PROMISE</promise> and append a
    final lesson line to $TEACHINGS_FILE.
  - verdict=hold     -> re-investigate the unresolved children.
  - verdict=reject   -> repair blocking failures, re-spawn agents at affected
    levels (cycle++), re-judge.

RULES
  - Spawn subagents IN PARALLEL where the budget is >1 (a single message
    with multiple Agent tool calls).
  - Do not return to the user between phases. Drive the cycle through to
    verdict=promote (or genuine reject).
  - If you hit max depth (3), record the unresolved scope and reject with
    a precise repair list.
  - Re-read the north star at the start of every level.

Stop early:    /cancel --session $SESSION
Read the log:  /log    --session $SESSION
Re-aim:        /steer  --session $SESSION "<new north star>"

TASK:
$PROMPT
EOF
