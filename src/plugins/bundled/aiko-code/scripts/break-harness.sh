#!/bin/bash

# Break into a full fib-harness when a aiko-code step can't close
# in one pass. Creates (or reuses) a workspace, registers the step as the
# harness's scope, and writes the workspace path into the loop's state so
# the hook knows to keep us on this step until the harness verdict lands.
#
# Usage:
#   break-harness.sh --step 3 --scope "API routing skeleton (step 3 skeleton)"
#
# After the harness runs its 20-agent cycle (see scripts/fib-harness),
# read the resulting verdict.json. When verdict is `promote`, clear
# harness_ws from the state file and the next hook call advances the
# main loop to step N+1.

set -euo pipefail

STEP=""
SCOPE=""
SESSION="default"
PLUGIN_ROOT="${aiko_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
STATE_DIR=".aiko"

while [[ $# -gt 0 ]]; do
  case $1 in
    --step)    STEP="$2"; shift 2;;
    --scope)   SCOPE="$2"; shift 2;;
    --session) SESSION="$2"; shift 2;;
    --state-dir) STATE_DIR="$2"; shift 2;;
    -h|--help) sed -n '3,18p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 1;;
  esac
done

STATE="$STATE_DIR/aiko-code.$SESSION.local.md"
[[ -n "$STEP" && -n "$SCOPE" ]] || { echo "need --step and --scope" >&2; exit 1; }
[[ -f "$STATE" ]] || { echo "no active loop ($STATE)" >&2; exit 1; }

WS=$("$PLUGIN_ROOT/scripts/fib-harness" init "$(pwd)" | python3 -c "import sys,json; print(json.load(sys.stdin)['workspace'])")
[[ -n "$WS" ]] || { echo "fib-harness init failed" >&2; exit 1; }

TMP="${STATE}.tmp.$$"
sed "s|^harness_ws:.*|harness_ws: $WS|" "$STATE" > "$TMP"
mv "$TMP" "$STATE"

cat <<EOF
◆ Harness break engaged for Step $STEP.
   scope:     $SCOPE
   workspace: $WS

Next: write a 6-dimension JSON scoped to "$SCOPE" and register with:
  $PLUGIN_ROOT/scripts/fib-harness dimensions "$WS" @dimensions.json

Then run the 20-agent cycle (L1=1, L2=1, L3=2, L4=3, L5=5, L6=8),
collect each agent's hypothesis, then:
  $PLUGIN_ROOT/scripts/fib-harness judge   "$WS"
  $PLUGIN_ROOT/scripts/fib-harness verdict "$WS"

When verdict == promote, clear harness_ws from $STATE (sed it blank) and
the main 9-step loop will advance to Step $(( STEP + 1 )) on next iteration.
EOF
