#!/bin/bash
# aiko-code plugin — one-shot installer.
#
# Usage (after extracting the tarball):
#   ./install.sh
#
# Adds this folder as a aiko Code marketplace and installs the aiko-code plugin.
# Idempotent — re-running is safe.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Aiko Code plugin install"
echo "  source: $DIR"
echo

cat <<EOF
Run these two commands inside aiko Code:

  /plugin marketplace add $DIR
  /plugin install aiko-code@aiko-code

Then enable it from /plugin if needed. Start a loop with:

  /loop "your task here"

Other commands: /cancel, /log, /steer "<new north star>"

Requires: bash, jq, perl, python3 (for fib-harness escape).
EOF
