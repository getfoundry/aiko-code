#!/bin/bash
# aiko-code Stop-hook safety net for the fractal harness.
#
# When the agent stops mid-cycle (no <promise> emitted yet, no verdict.json),
# we re-inject a "resume" prompt pointing at the active workspace. Once the
# fib-harness verdict.json shows promote OR the agent emits <promise>, the
# state file is removed and the loop exits cleanly.
#
# Inputs (env):
#   FC_PLUGIN_ROOT, FC_STATE_DIR, FC_SESSION, FC_OUTPUT_FORMAT, FC_SYSMSG_FD
# Inputs (stdin): hook envelope JSON ({} ok; .transcript_path used to detect promise).
# Exit: 0 keep going · 1 done / no state.

set -euo pipefail

FC_STATE_DIR="${FC_STATE_DIR:-.aiko}"
FC_SESSION="${FC_SESSION:-default}"
FC_OUTPUT_FORMAT="${FC_OUTPUT_FORMAT:-raw}"
FC_SYSMSG_FD="${FC_SYSMSG_FD:-3}"
PLUGIN_ROOT="${FC_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

STATE_FILE="$FC_STATE_DIR/aiko-code.$FC_SESSION.local.md"
[[ -f "$STATE_FILE" ]] || exit 1

HOOK_INPUT=$(cat || true)

FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$STATE_FILE")
fm_get() { echo "$FRONTMATTER" | { grep "^$1:" || true; } | head -1 | sed "s/^$1: *//" | sed 's/^"\(.*\)"$/\1/'; }
WS=$(fm_get workspace)
COMPLETION_PROMISE=$(fm_get completion_promise)
NORTH_STAR=$(fm_get north_star)
EFFECTIVE_PROMISE="${COMPLETION_PROMISE:-SHIPPED}"
[[ "$EFFECTIVE_PROMISE" == "null" ]] && EFFECTIVE_PROMISE="SHIPPED"

TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
LAST_OUTPUT=""
if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]] && grep -q '"role":"assistant"' "$TRANSCRIPT_PATH"; then
  LAST_LINE=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1)
  LAST_OUTPUT=$(echo "$LAST_LINE" | jq -r '.message.content | map(select(.type == "text")) | map(.text) | join("\n")' 2>/dev/null || echo "")
fi

# Done if the agent emitted the completion promise.
if [[ -n "$LAST_OUTPUT" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")
  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$EFFECTIVE_PROMISE" ]]; then
    echo "aiko-code [$FC_SESSION]: promise fulfilled. Closing." >&2
    rm -f "$STATE_FILE"
    exit 1
  fi
fi

# Done if root verdict says promote.
if [[ -n "$WS" && "$WS" != "null" && -f "$WS/state/verdict.json" ]]; then
  V=$(jq -r '.verdict // empty' "$WS/state/verdict.json" 2>/dev/null || echo "")
  if [[ "$V" == "promote" ]]; then
    echo "aiko-code [$FC_SESSION]: verdict=promote. Closing." >&2
    rm -f "$STATE_FILE"
    exit 1
  fi
fi

# Otherwise re-inject the resume nudge.
TASK_TEXT=$(awk '/^---$/{i++; next} i>=2' "$STATE_FILE")
STATUS_HINT=""
if [[ -n "$WS" && "$WS" != "null" && -d "$WS/state" ]]; then
  STATUS_HINT=$("$PLUGIN_ROOT/scripts/fib-harness" status "$WS" 2>/dev/null || echo "")
fi

PROMPT=$( {
  printf '<harness-directive priority="absolute">\n'
  printf 'The harness is still active. Resume execution. Do NOT summarize for the\n'
  printf 'user. Do NOT ask for confirmation. Your next response must be a tool\n'
  printf 'call that advances the cycle (parallel Agent fan-out, fib-harness\n'
  printf 'collect / level-check / judge / spawn-child / verdict). Stay silent to\n'
  printf 'the user until verdict=promote.\n'
  printf '</harness-directive>\n\n'
  printf 'aiko-code [session: %s] — RESUME the fractal harness.\n\n' "$FC_SESSION"
  if [[ -n "$NORTH_STAR" && "$NORTH_STAR" != "null" ]]; then
    printf 'NORTH STAR (re-read every cycle):\n  %s\n\n' "$NORTH_STAR"
  fi
  printf 'WORKSPACE: %s\n' "$WS"
  printf 'PLUGIN_ROOT: %s\n\n' "$PLUGIN_ROOT"
  if [[ -n "$STATUS_HINT" ]]; then
    printf 'CURRENT STATUS:\n%s\n\n' "$STATUS_HINT"
  fi
  printf 'CONTRACT:\n'
  printf '  - Continue the harness flow. Do NOT stop until verdict=promote\n'
  printf '    (or genuine reject after exhausting fractal repair).\n'
  printf '  - Spawn subagents IN PARALLEL where fib budget > 1 — emit a single\n'
  printf '    assistant message with multiple Agent tool_use blocks, not a\n'
  printf '    sequence of single-agent calls.\n'
  printf '  - Use the harness commands:\n'
  printf '      %s/scripts/fib-harness status      %s\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness plan        %s\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness collect     %s <L> <id> @file.json\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness level-check %s <L>\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness judge       %s\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness spawn-child %s <fail-id> "<scope>"\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness link-child  %s <child-ws>\n' "$PLUGIN_ROOT" "$WS"
  printf '      %s/scripts/fib-harness verdict     %s\n' "$PLUGIN_ROOT" "$WS"
  printf '  - When verdict=promote, emit exactly: <promise>%s</promise>\n\n' "$EFFECTIVE_PROMISE"
  printf 'TASK:\n%s\n' "$TASK_TEXT"
} )

SYSMSG="◆ [$FC_SESSION] resuming harness ($WS)"

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
