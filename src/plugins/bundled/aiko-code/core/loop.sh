#!/bin/bash
# aiko-code — 9-step harness Stop-hook driver.
#
# Same architecture as jstack/core/loop.sh, secularized. Reads the active
# session's state file, advances the step, and injects step N's playbook
# (principle, problem map, fib budget, work) as the resume prompt.
#
# Inputs (env, set by hooks/stop-hook.sh):
#   FC_PLUGIN_ROOT, FC_STATE_DIR, FC_SESSION, FC_OUTPUT_FORMAT, FC_SYSMSG_FD
# Inputs (stdin): hook envelope JSON ({} ok; .transcript_path used to detect promise).
# Exit: 0 keep going · 1 done / no state.

set -euo pipefail

FC_STATE_DIR="${FC_STATE_DIR:-.aiko}"
FC_SESSION="${FC_SESSION:-default}"
FC_OUTPUT_FORMAT="${FC_OUTPUT_FORMAT:-aiko-code}"
FC_SYSMSG_FD="${FC_SYSMSG_FD:-3}"
PLUGIN_ROOT="${FC_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

PHASES_FILE="$PLUGIN_ROOT/data/phases.json"
BREAK_SCRIPT="bash $PLUGIN_ROOT/scripts/break-harness.sh"
STEER_SCRIPT="/steer"

STATE_FILE="$FC_STATE_DIR/aiko-code.$FC_SESSION.local.md"
[[ -f "$STATE_FILE" ]] || exit 1
TEACHINGS_FILE="$FC_STATE_DIR/aiko-code.$FC_SESSION.teachings.local.md"

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

EFFECTIVE_PROMISE="${COMPLETION_PROMISE:-SHIPPED}"
[[ "$EFFECTIVE_PROMISE" == "null" ]] && EFFECTIVE_PROMISE="SHIPPED"

# Done if the agent emitted the completion promise.
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
LAST_OUTPUT=""
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]] && grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
  LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '.message.content | map(select(.type == "text")) | map(.text) | join("\n")' 2>/dev/null || echo "")
fi
if [[ -n "$LAST_OUTPUT" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$EFFECTIVE_PROMISE" ]]; then
    echo "aiko-code [$FC_SESSION]: promise fulfilled. Closing." >&2
    rm -f "$STATE_FILE"
    exit 1
  fi
fi

# If a fib-harness break is in flight, stay on the same step until it lands.
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
  TITLE="Repair (fib-harness child active)"
  PRINCIPLE="Repair is fractal. Each stuck step earns its own full cycle."
  TACTICAL="Drive the fib-harness child to verdict=promote before resuming the main loop."
  PROBLEM_MAP="Step $STEP is stuck and a fib-harness is running in $HARNESS_WS."
  APPLY="Work the harness. When verdict=promote, blank harness_ws in $STATE_FILE so the next firing advances the main loop to step $((STEP + 1))."
  FIB_BUDGET=1
else
  IDX=$((NEXT_STEP - 1))
  TITLE=$(jq -r --argjson i "$IDX" '.[$i].title' "$PHASES_FILE")
  PRINCIPLE=$(jq -r --argjson i "$IDX" '.[$i].principle' "$PHASES_FILE")
  TACTICAL=$(jq -r --argjson i "$IDX" '.[$i].tactical' "$PHASES_FILE")
  PROBLEM_MAP=$(jq -r --argjson i "$IDX" '.[$i].problem_map' "$PHASES_FILE")
  APPLY=$(jq -r --argjson i "$IDX" '.[$i].apply' "$PHASES_FILE")
  FIB_BUDGET=$(jq -r --argjson i "$IDX" '.[$i].fib_budget' "$PHASES_FILE")
fi

# Substitute {COMPLETION_PROMISE} placeholder in the apply text (used by step 9).
APPLY=${APPLY//\{COMPLETION_PROMISE\}/$EFFECTIVE_PROMISE}

# Per-step parallelism hint.
if [[ "$FIB_BUDGET" -le 1 ]]; then
  FANOUT_HINT="Single-threaded. Do this work yourself in this turn."
else
  FANOUT_HINT="Spawn $FIB_BUDGET sub-agents in parallel via the Agent tool — single assistant message with $FIB_BUDGET tool_use blocks. Each sub-agent owns one slice. Aggregate before stopping."
fi

PROMPT=$( {
  printf '<harness-directive priority="absolute">\n'
  printf 'The harness is still active. Resume execution. Do NOT summarize for\n'
  printf 'the user. Do NOT ask for confirmation. Your next response must be\n'
  printf 'tool calls that complete this step, plus a teachings-line append to\n'
  printf '%s. Stay silent to the user until step 9 PROMOTE.\n' "$TEACHINGS_FILE"
  printf '</harness-directive>\n\n'
  printf 'aiko-code [session: %s] — Step %s of 9 (%s)\n\n' "$FC_SESSION" "$NEXT_STEP" "$TITLE"
  if [[ -n "$NORTH_STAR" ]] && [[ "$NORTH_STAR" != "null" ]]; then
    printf 'NORTH STAR (re-read every step):\n  %s\n\n' "$NORTH_STAR"
  fi
  printf 'PRINCIPLE:\n  %s\n\n' "$PRINCIPLE"
  printf 'TACTICAL PARALLEL:\n  %s\n\n' "$TACTICAL"
  printf 'PROBLEM MAP:\n  %s\n\n' "$PROBLEM_MAP"
  printf 'REQUIRED REPLY STRUCTURE:\n'
  printf '  1. Map principle + tactical to this specific task in 2–3 lines.\n'
  printf '  2. Append ONE line to %s:\n' "$TEACHINGS_FILE"
  printf '     - [step %s / %s] <one-line lesson>\n' "$NEXT_STEP" "$TITLE"
  printf '  3. Do the work: %s\n\n' "$APPLY"
  printf 'FIB PARALLELISM (step %s of 9 → %s worker%s):\n  %s\n' \
    "$NEXT_STEP" "$FIB_BUDGET" "$([[ "$FIB_BUDGET" -eq 1 ]] && echo "" || echo "s")" "$FANOUT_HINT"
  printf '\nUSER STEERING:\n  Lewis can re-aim the north star at any time with:\n'
  printf '    %s --session %s "<new north star>"\n' "$STEER_SCRIPT" "$FC_SESSION"
  printf '  Re-read NORTH STAR above before doing work.\n'
  if [[ "$PHASE" != "harness" ]]; then
    printf '\nIF STEP CANNOT CLOSE IN ONE PASS:\n'
    printf '    %s --step %s --session %s --scope "<what is stuck>"\n' "$BREAK_SCRIPT" "$NEXT_STEP" "$FC_SESSION"
  fi
  if [[ "$NEXT_STEP" -eq 9 ]] && [[ "$PHASE" != "harness" ]]; then
    printf '\nCOMPLETION PROMISE:\n  When the artifact is genuinely reachable by its user, output exactly: <promise>%s</promise>\n' "$EFFECTIVE_PROMISE"
  fi
  printf '\nTASK (unchanged since step 1):\n%s\n' "$TASK_TEXT"
} )

# Advance step in the state file.
if [[ "$PHASE" != "harness" ]]; then
  TEMP_STATE="${STATE_FILE}.tmp.$$"
  sed "s/^step: .*/step: $NEXT_STEP/" "$STATE_FILE" > "$TEMP_STATE"
  mv "$TEMP_STATE" "$STATE_FILE"
fi

if [[ "$PHASE" == "harness" ]]; then
  SYSMSG="◆ [$FC_SESSION] Step $STEP · fib-harness ($HARNESS_WS)"
elif [[ "$NEXT_STEP" -eq 9 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 9/9 Ship · <promise>$EFFECTIVE_PROMISE</promise> when reachable"
elif [[ "$NEXT_STEP" -eq 8 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 8/9 Audit · cold adversarial review"
elif [[ "$NEXT_STEP" -eq 7 ]]; then
  SYSMSG="◆ [$FC_SESSION] Step 7/9 Verdict · promote / hold / reject"
else
  SYSMSG="◆ [$FC_SESSION] Step $NEXT_STEP/9 · $TITLE"
fi

case "$FC_OUTPUT_FORMAT" in
  aiko-code|codex|claude-code)
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
