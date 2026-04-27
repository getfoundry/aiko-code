---
description: "Read back the teachings log from a Aiko Code session"
argument-hint: "[--session NAME | --all]"
allowed-tools: ["Bash(bash ${aiko_PLUGIN_ROOT}/scripts/log.sh:*)"]
---

# Log

Show the teachings gathered across the nine phases (1 survey through 9 ship). Pass `--session NAME` for one session, `--all` for every session in the repo. Default is `--session default`.

!`bash ${aiko_PLUGIN_ROOT}/scripts/log.sh $ARGUMENTS`

After printing, offer a short synthesis (≤3 sentences): which phase carried the most friction, which tactical principle showed up more than once, and what that says about the shape of the work.
