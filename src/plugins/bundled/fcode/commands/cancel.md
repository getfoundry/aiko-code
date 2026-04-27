---
description: "Cancel an active Aiko Code session (or all)"
argument-hint: "[--session NAME | --all]"
allowed-tools: ["Bash(bash ${aiko_PLUGIN_ROOT}/scripts/cancel.sh:*)"]
---

# Cancel

Cancel a running aiko-code. Pass `--session NAME` for a specific session, or `--all` to cancel every session in the repo. Default is `--session default`. Teachings logs are preserved.

!`bash ${aiko_PLUGIN_ROOT}/scripts/cancel.sh $ARGUMENTS`
