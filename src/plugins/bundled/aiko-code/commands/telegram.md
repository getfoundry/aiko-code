---
description: "Manage the Aiko Code Telegram bot — pair users, approve, list, start"
argument-hint: "[start | pending | approve <code> | who | install --token=TOKEN | uninstall]"
allowed-tools: ["Bash(bash ${aiko_PLUGIN_ROOT}/scripts/telegram.sh:*)"]
---

# Telegram

Run aiko-code as a Telegram bot and manage who can talk to it.

**Pairing flow** (default DM policy = `pairing`):

1. A friend DMs your bot. The bot replies with a pairing code like `Y2AP-TU32`.
2. They send you the code.
3. You run `/telegram approve Y2AP-TU32` (or paste the code below).
4. They DM the bot again — chat unlocked. No restart needed.

**Common args:**

- `/telegram` — show all subcommands and the pairing flow.
- `/telegram start` — start the bot in the foreground.
- `/telegram pending` — list pending pairing codes.
- `/telegram approve <code|userId>` — approve a user.
- `/telegram who` — list currently approved users.
- `/telegram install --token=BOT_TOKEN` — install as a background service.
- `/telegram uninstall` — remove the background service + config.

State files live at `~/.aiko/telegram.json` (allowlist + token + port) and `~/.aiko/telegram-pending-pairs.json` (pending codes).

!`bash ${aiko_PLUGIN_ROOT}/scripts/telegram.sh $ARGUMENTS`
