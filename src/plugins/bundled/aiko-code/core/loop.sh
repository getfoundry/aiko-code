#!/bin/bash
# aiko-code — harness-agnostic core.
#
# Inputs (env):
#   FC_PLUGIN_ROOT      — root of the aiko-code install (data/, scripts/)
#   FC_STATE_DIR        — dir holding state files (.aiko | .codex | .opencode)
#   FC_SESSION          — session id; allows multiple concurrent loops per repo
#                         (default: "default"). State path = $FC_STATE_DIR/aiko-code.$FC_SESSION.local.md
#   FC_OUTPUT_FORMAT    — aiko-code | codex | raw     (default: raw)
#   FC_SYSMSG_FD        — fd to write the system-message line on (raw mode; default 3)
#
# Inputs (stdin): harness hook envelope JSON (must contain .transcript_path, may be {}).
#
# Outputs:
#   raw          — prompt to stdout, sysmsg to fd $FC_SYSMSG_FD if open
#   aiko-code  — JSON {decision:"block", reason, systemMessage} to stdout
#   codex        — same JSON shape (codex uses the same decision/reason contract)
#
# Exit: 0 keep going · 1 no state / canceled.

set -euo pipefail

FC_STATE_DIR="${FC_STATE_DIR:-.aiko}"
FC_SESSION="${FC_SESSION:-default}"
FC_OUTPUT_FORMAT="${FC_OUTPUT_FORMAT:-raw}"
FC_SYSMSG_FD="${FC_SYSMSG_FD:-3}"
PLUGIN_ROOT="${FC_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

STATE_FILE="$FC_STATE_DIR/aiko-code.$FC_SESSION.local.md"
TEACHINGS_FILE="$FC_STATE_DIR/aiko-code.$FC_SESSION.teachings.local.md"
CREATION_FILE="$PLUGIN_ROOT/data/creation-teachings.json"
TACTICAL_FILE="$PLUGIN_ROOT/data/teachings.json"
BREAK_SCRIPT="bash $PLUGIN_ROOT/scripts/break-harness.sh"
STEER_SCRIPT="bash $PLUGIN_ROOT/scripts/steer.sh"

[[ -f "$STATE_FILE" ]] || exit 1

HOOK_INPUT=$(cat || true)

FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
fm_get() { echo "$FRONTMATTER" | { grep "^$1:" || true; } | head -1 | sed "s/^$1: *//" | sed 's/^"\(.*\)"$/\1/'; }
STEP=$(fm_get step)
HARNESS_WS=$(fm_get harness_ws)
COMPLETION_PROMISE=$(fm_get completion_promise)
NORTH_STAR=$(fm_get north_star)

if [[ ! "$STEP" =~ ^[0-9]+$ ]]; then
  echo "aiko-code: state file corrupted ($STATE_FILE)." >&2
  rm -f "$STATE_FILE"
  exit 1
fi

TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
LAST_OUTPUT=""
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]] && grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
  LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '.message.content | map(select(.type == "text")) | map(.text) | join("\n")' 2>/dev/null || echo "")
fi

if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$LAST_OUTPUT" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "Aiko Code [$FC_SESSION]: promise fulfilled. Canceling." >&2
    rm -f "$STATE_FILE"
    exit 1
  fi
fi

if [[ -n "$HARNESS_WS" ]] && [[ "$HARNESS_WS" != "null" ]]; then
  NEXT_STEP="$STEP"; PHASE="harness"
else
  NEXT_STEP=$((STEP + 1))
  if [[ $NEXT_STEP -gt 9 ]]; then NEXT_STEP=9; PHASE="ship-hold"; else PHASE="step"; fi
fi

TASK_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")
if [[ -z "$TASK_TEXT" ]]; then
  echo "aiko-code: no task in state file." >&2
  rm -f "$STATE_FILE"
  exit 1
fi

if [[ "$PHASE" == "harness" ]]; then
  STRUCT_REF="Principle: precept upon precept"
  STRUCT_QUOTE="Repair is fractal. Each stuck step earns its own full cycle — line by line, piece by piece."
  COMPANION_REF="Corollary: do not weary"
  COMPANION_QUOTE="Steady work in due season produces the result. Resume after the child cycle, do not abandon."
  PHASE_NAME="repair"
  LABEL="line by line"
  PATTERN="Repair is fractal. Each stuck step earns its own full cycle."
  PROBLEM_MAP="Your step $STEP is stuck and a fib-harness is running in $HARNESS_WS."
  APPLY="Work the harness. When verdict=promote, blank harness_ws in $STATE_FILE."
else
  IDX=$((NEXT_STEP - 1))
  STRUCT_REF=$(jq -r --argjson i "$IDX" '.[$i].primary_ref' "$CREATION_FILE")
  STRUCT_QUOTE=$(jq -r --argjson i "$IDX" '.[$i].primary_quote' "$CREATION_FILE")
  COMPANION_REF=$(jq -r --argjson i "$IDX" '.[$i].companion_ref' "$CREATION_FILE")
  COMPANION_QUOTE=$(jq -r --argjson i "$IDX" '.[$i].companion_quote' "$CREATION_FILE")
  PHASE_NAME=$(jq -r --argjson i "$IDX" '.[$i].phase' "$CREATION_FILE")
  LABEL=$(jq -r --argjson i "$IDX" '.[$i].label' "$CREATION_FILE")
  PATTERN=$(jq -r --argjson i "$IDX" '.[$i].pattern' "$CREATION_FILE")
  PROBLEM_MAP=$(jq -r --argjson i "$IDX" '.[$i].problem_map_template' "$CREATION_FILE")
  APPLY=$(jq -r --argjson i "$IDX" '.[$i].apply' "$CREATION_FILE")
fi

TACTICAL_COUNT=0
[[ -f "$TACTICAL_FILE" ]] && TACTICAL_COUNT=$(jq 'length' "$TACTICAL_FILE" 2>/dev/null || echo 0)
TACT_REF=""; TACT_QUOTE=""; TACT_PATTERN=""; TACT_APPLY=""
if [[ "$TACTICAL_COUNT" =~ ^[0-9]+$ ]] && [[ $TACTICAL_COUNT -gt 0 ]]; then
  T_IDX=$(( NEXT_STEP % TACTICAL_COUNT ))
  TACT_REF=$(jq -r --argjson i "$T_IDX" '.[$i].ref'     "$TACTICAL_FILE")
  TACT_QUOTE=$(jq -r --argjson i "$T_IDX" '.[$i].quote' "$TACTICAL_FILE")
  TACT_PATTERN=$(jq -r --argjson i "$T_IDX" '.[$i].pattern' "$TACTICAL_FILE")
  TACT_APPLY=$(jq -r --argjson i "$T_IDX" '.[$i].apply'     "$TACTICAL_FILE")
fi

EFFECTIVE_PROMISE="${COMPLETION_PROMISE:-SHIPPED}"
[[ "$EFFECTIVE_PROMISE" == "null" ]] && EFFECTIVE_PROMISE="SHIPPED"

# Fibonacci parallelism budget per phase:
#   Step 1 → 1 worker   (survey: solo inventory)
#   Step 2 → 1 worker   (boundaries: single architect, can't sub-divide vision)
#   Step 3 → 2 workers  (skeleton: two parallel skeletons)
#   Step 4 → 3 workers  (signals: three independent signal axes)
#   Step 5 → 5 workers  (edges: five adversarial probes in parallel)
#   Step 6 → 8 workers  (integration: eight integration paths in parallel)
#   Step 7 → 1 worker   (verdict: SINGLE-THREAD verdict)
#   Step 8 → 13 workers (audit: many adversarial cold readers)
#   Step 9 → 21 workers (ship: many publish/handoff paths)
FIB_BUDGET=(1 1 2 3 5 8 1 13 21)
PARALLEL_N="${FIB_BUDGET[$((NEXT_STEP - 1))]:-1}"

case "${FC_OUTPUT_FORMAT:-raw}" in
  aiko-code) FANOUT_HINT="Use the Agent tool to spawn $PARALLEL_N sub-agents in a single message (parallel tool calls). Each sub-agent owns one slice of this phase's work. Synthesize results before logging the lesson.";;
  codex)       FANOUT_HINT="Run $PARALLEL_N parallel workers via background jobs (\`( task1 ) & ( task2 ) & wait\`) or your harness's parallel primitive. Each worker owns one slice. Aggregate before logging.";;
  *)           FANOUT_HINT="Spawn $PARALLEL_N parallel workers via the harness's native primitive (Bun \`Promise.all\`, opencode \`client.session.prompt\` fan-out, etc.). Each worker owns one slice.";;
esac
[[ "$NEXT_STEP" -eq 7 ]] && FANOUT_HINT="VERDICT — render the verdict single-threaded first (PROMOTE / HOLD / REJECT). If PROMOTE, proceed to Step 8 (Audit) where the record is opened. If HOLD or REJECT, you MAY spawn workers to repair, then re-render next firing."
[[ "$NEXT_STEP" -eq 8 ]] && FANOUT_HINT="AUDIT — open the record. Spawn $PARALLEL_N adversarial auditors in parallel (each re-reads a slice of the artifact cold, no builder bias). Aggregate findings. Any artifact that cannot survive audit loops back before Step 9."
[[ "$NEXT_STEP" -eq 9 ]] && FANOUT_HINT="SHIP — deliver. Spawn $PARALLEL_N publishers in parallel (commit, tag, changelog, README, hand-off message, notify caller). Only then output <promise>$EFFECTIVE_PROMISE</promise> if the artifact is genuinely reachable by its intended user."


PROMPT=$( {
  printf 'aiko-code [session: %s] — Step %s of 9 (Phase: %s — %s)\n\n' "$FC_SESSION" "$NEXT_STEP" "$PHASE_NAME" "$LABEL"
  if [[ -n "$NORTH_STAR" ]] && [[ "$NORTH_STAR" != "null" ]]; then
    printf 'CURRENT NORTH STAR (set by user, may have changed since last step):\n  %s\n\n' "$NORTH_STAR"
  fi
  printf 'CORE PRINCIPLE:\n'
  printf '  %s\n  "%s"\n' "$STRUCT_REF"    "$STRUCT_QUOTE"
  printf '  %s\n  "%s"\n\n' "$COMPANION_REF" "$COMPANION_QUOTE"
  printf 'Pattern: %s\n\n' "$PATTERN"
  if [[ -n "$TACT_REF" ]]; then
    printf 'TACTICAL PRINCIPLE:\n'
    printf '  %s — "%s"\n' "$TACT_REF" "$TACT_QUOTE"
    printf '  Pattern: %s\n  Apply:   %s\n\n' "$TACT_PATTERN" "$TACT_APPLY"
  fi
  printf 'PARALLEL TO YOUR PROBLEM:\n  %s\n\n' "$PROBLEM_MAP"
  printf 'REQUIRED REPLY STRUCTURE:\n'
  printf '  1. State the core + tactical principles in your own words (one sentence each).\n'
  printf '  2. Element-by-element mapping: how the principle maps onto this step of this task.\n'
  printf '  3. Append one line to %s:\n' "$TEACHINGS_FILE"
  printf '     - [step %s / %s] %s — %s — <one-line lesson>\n' "$NEXT_STEP" "$PHASE_NAME" "$STRUCT_REF" "$LABEL"
  printf '  4. Do the step work: %s\n' "$APPLY"
  printf '\nFIB PARALLELISM (Phase %s of 9 → %s worker%s):\n  %s\n' \
    "$NEXT_STEP" "$PARALLEL_N" "$([[ "$PARALLEL_N" -eq 1 ]] && echo "" || echo "s")" "$FANOUT_HINT"
  printf '\nUSER STEERING:\n  The user can re-aim the north star at any time with:\n'
  printf '    %s --session %s "<new north star>"\n' "$STEER_SCRIPT" "$FC_SESSION"
  printf '  Re-read the CURRENT NORTH STAR section above each step before doing work.\n'
  if [[ "$PHASE" != "harness" ]]; then
    printf '\nIF STEP CANNOT CLOSE IN ONE PASS:\n'
    printf '    %s --step %s --session %s --scope "<what is stuck>"\n' "$BREAK_SCRIPT" "$NEXT_STEP" "$FC_SESSION"
  fi
  if [[ "$NEXT_STEP" -eq 9 ]] && [[ "$PHASE" != "harness" ]]; then
    printf '\nCOMPLETION PROMISE:\n  When PROMOTE is genuinely true, output exactly: <promise>%s</promise>\n' "$EFFECTIVE_PROMISE"
  fi
  printf '\nTASK (unchanged since Step 1):\n%s\n' "$TASK_TEXT"
} )

if [[ "$PHASE" != "harness" ]]; then
  TEMP_STATE="${STATE_FILE}.tmp.$$"
  sed "s/^step: .*/step: $NEXT_STEP/" "$STATE_FILE" > "$TEMP_STATE"
  mv "$TEMP_STATE" "$STATE_FILE"
fi

if [[ "$PHASE" == "harness" ]]; then
  SYSMSG="◆ [$FC_SESSION] Step $STEP · harness ($HARNESS_WS)"
elif [[ "$NEXT_STEP" -eq 9 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 9/9 Ship · <promise>$EFFECTIVE_PROMISE</promise> when handed off"
elif [[ "$NEXT_STEP" -eq 8 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 8/9 Audit · the record is opened"
elif [[ "$NEXT_STEP" -eq 7 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 7/9 Verdict · stop work, render verdict"
else
  SYSMSG="◆ [$FC_SESSION] Step $NEXT_STEP/9 · $PHASE_NAME ($LABEL)"
fi

case "$FC_OUTPUT_FORMAT" in
  aiko-code|codex)
    jq -n --arg prompt "$PROMPT" --arg msg "$SYSMSG" \
      '{decision: "block", reason: $prompt, systemMessage: $msg}'
    ;;
  raw|*)
    printf '%s\n' "$PROMPT"
    if { true >&"$FC_SYSMSG_FD"; } 2>/dev/null; then
      printf '%s\n' "$SYSMSG" >&"$FC_SYSMSG_FD"
    fi
    ;;
esac

exit 0
