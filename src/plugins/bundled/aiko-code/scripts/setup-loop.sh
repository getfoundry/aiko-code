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
MODE="restructure"
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
  --mode restructure|experiment  Harness mode (default: restructure).
                                  - restructure: judge dimensions, recurse on
                                    blocking failures (Old Testament — law).
                                  - experiment: spawn divergent variants, keep
                                    what bears fruit, log the rest (New
                                    Testament — grace). Modes can hand off:
                                    experiment → restructure to consolidate;
                                    restructure → experiment when stuck with
                                    no clear repair.
  --north-star "<text>"          Optional steering directive.
  --completion-promise '<text>'  Phrase emitted as <promise>TEXT</promise>
                                 when fib-harness verdict=promote. Default: SHIPPED.
  --state-dir DIR                Where to write state (default: .aiko).
  -h, --help                     Show this help.

EXAMPLES:
  /auto Build a markdown blog generator
  /auto --mode experiment "Try three caching strategies for the API client"
  /auto --session refactor "Pull auth out of routes" --north-star "no behavior change"
HELP_EOF
      exit 0;;
    --completion-promise) COMPLETION_PROMISE="$2"; shift 2;;
    --session)            SESSION="$2"; shift 2;;
    --mode)               MODE="$2"; shift 2;;
    --north-star)         NORTH_STAR="$2"; shift 2;;
    --state-dir)          STATE_DIR="$2"; shift 2;;
    *) PROMPT_PARTS+=("$1"); shift;;
  esac
done

case "$MODE" in
  restructure|experiment) ;;
  *) echo "Error: --mode must be 'restructure' or 'experiment' (got: $MODE)" >&2; exit 1;;
esac

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
  printf 'mode: "%s"\n' "$MODE"
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
Mode:        $MODE  ($([ "$MODE" = "experiment" ] && echo "NT/grace — divergent variants, keep what bears fruit" || echo "OT/law — judge dimensions, recurse on failure"))

═══════════════════════════════════════════════════════════════════
SELF-DRIVING PLAYBOOK — run this entire flow now, in one conversation.
Do not stop between phases. Spawn subagents in parallel.
═══════════════════════════════════════════════════════════════════

PHASE -1 — TASTE GATE (mandatory, before PHASE 0)
Decide whether this task touches UI, frontend, design, visual output, or
any user-facing surface. This is a judgement call — not a keyword match.
Examples that qualify: building a page/component, restyling, redesigning a
flow, choosing a layout, adding microcopy, picking colors/fonts, even
auditing existing UI. Examples that do NOT qualify: pure backend logic,
data pipelines, infra, CLI-only tools without TTY rendering.

If the task qualifies, BEFORE writing dims.json, invoke ONE of:
  /taste     — apply the senior UI/UX design laws to the work
  /audit     — review existing UI against the laws (no code changes)
  /critique  — second-opinion review (Nielsen + AI-slop heuristics)
  /craft     — start from a hi-fi reference under the design laws
Pick by intent verb: build/start -> /craft, review/inspect -> /audit,
critique/feedback -> /critique, otherwise -> /taste. Treat the skill's
output as a binding constraint when declaring dimensions in PHASE 0.

If the task does NOT qualify, write a one-line note in $TEACHINGS_FILE:
  "taste-gate: skipped — task is non-UI ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
and proceed directly to PHASE 0.

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

Statusline:    add this to ~/.claude/settings.json to surface live harness state:
  "statusLine": { "type": "command",
                  "command": "$PLUGIN_ROOT/scripts/statusline.sh" }

TASK:
$PROMPT
EOF

if [[ "$MODE" == "experiment" ]]; then
cat <<EOF

═══════════════════════════════════════════════════════════════════
EXPERIMENT MODE OVERRIDE — read AFTER the playbook above.
The structure of the cycle stays identical (6 dimensions, fib fan-out,
judge, recurse, verdict). The SEMANTICS of judging shift from law to
grace. Apply these overrides on top of the base playbook.
═══════════════════════════════════════════════════════════════════

PHASE 0 (override) — DECLARE 6 DIMENSIONS AS VARIANT-SPACES
Each dimension is no longer "what must be true" but "what could we try."
In dims.json, set:
  - "phase" stays the same (survey..integration)
  - "success_criteria" expressed as a FRUIT TEST, not a pass/fail gate
    (e.g. "produces working output under conditions X" not "function
    returns true")
  - add "variant_axis": "<what is varied across attempts>"
    (e.g. "caching strategy", "prompt scaffold", "data layout")

PHASE 1..6 (override) — FAN-OUT AS DIVERGENT VARIANTS
Each subagent at level L builds ONE genuine variant of its dimension —
distinct enough to be falsified by the others. Subagent artifact shape
becomes:
  {
    "level": <L>, "agent_id": "L<L>-a<n>",
    "dimension": "<dim name>",
    "variant": "<one-line label of what this attempt did>",
    "observation": "<what happened when it ran>",
    "fruit": "kept | logged | killed",
    "fruit_score": 0..1,
    "why": "<reason for the fruit verdict>"
  }
Collect via the same \`fib-harness collect\` command; the harness does not
distinguish — the fruit field rides in the artifact body.

PHASE 7 (override) — DISCERN, DON'T CONDEMN
Run \`fib-harness judge\` as usual to get the structural verdict, but
INTERPRET it through grace:
  - Variants with fruit=kept compose the keeper set.
  - Variants with fruit=logged are recorded in $TEACHINGS_FILE for
    later use, NOT condemned.
  - Variants with fruit=killed are dropped silently.
  - "Failure" only fires if NO dimension produced a kept variant.

PHASE 8 (override) — GRAFT, DON'T REPAIR
Instead of spawn-child on each blocking failure, GRAFT the keeper set:
  - Compose the kept variants into a single integrated artifact
    (the "fruit-bearing branch").
  - If a dimension has no keeper, that is the only signal that demands
    a child harness. When it does, spawn the child in RESTRUCTURE mode:
       /auto --mode restructure --session ${SESSION}-graft "<missing dim>"
    Restructure consolidates; experiment generates. They hand off here.

PHASE 9 (override) — VERDICT THROUGH FRUIT
  - verdict=promote -> the grafted whole bears fruit; emit
    <promise>$COMPLETION_PROMISE</promise> and append the kept variants
    + reasoning to $TEACHINGS_FILE.
  - verdict=hold -> some dimensions need more variants; re-fan with
    cycle++ on those dims only.
  - verdict=reject -> no dimension produced a keeper. Hand off to
    RESTRUCTURE mode for diagnosis (it asks "what law was violated").

CROSS-MODE HANDOFFS
  - experiment -> restructure: when a dimension has no keeper after
    cycle 2, restructure judges the constraints to find what law is
    blocking fruit.
  - restructure -> experiment: when judge returns
    needs_investigation with no clear repair_hint, the next /auto call
    should switch to --mode experiment to try variants instead of
    enforcing rules.

The two modes are the same loop seen from two sides:
  restructure prunes toward a known shape;
  experiment grows toward an unknown one.
EOF
fi
