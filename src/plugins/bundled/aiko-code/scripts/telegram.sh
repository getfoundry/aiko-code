#!/usr/bin/env bash
# Thin wrapper around `aiko-code telegram <args>` so the slash command can
# expose pairing/approve/who/start without re-implementing the CLI.
#
# Used by commands/telegram.md.

set -euo pipefail

BIN="${AIKO_CODE_BIN:-aiko-code}"

if ! command -v "$BIN" >/dev/null 2>&1; then
  echo "[error] '$BIN' not found on PATH"
  echo "  Set AIKO_CODE_BIN or install the aiko-code CLI."
  exit 1
fi

if [ "$#" -eq 0 ]; then
  exec "$BIN" telegram --help
fi

exec "$BIN" telegram "$@"
