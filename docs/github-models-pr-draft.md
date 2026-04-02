# GitHub Models + onboard — PR draft (paste into GitHub)

**Title:** `feat: GitHub Models provider + interactive onboard (keychain-backed)`

**Body:**

## Summary

- Adds GitHub Models (`models.github.ai`) as an OpenAI-compatible backend via `CLAUDE_CODE_USE_GITHUB` (see existing shim changes).
- Adds `/onboard-github`: interactive Ink flow for GitHub Device Login or PAT, stores token in OS-backed secure storage (macOS Keychain when available, else `~/.claude/.credentials.json`), and writes user settings `env` so no `export GITHUB_TOKEN` is required.
- Applies user settings before provider env validation and hydrates `GITHUB_TOKEN` from secure storage when the GitHub provider flag is on.

## How to test

1. Run `openclaude` and execute `/onboard-github` (or launch via command registration).
2. Complete device flow or paste a PAT with Models access.
3. Restart CLI; confirm `CLAUDE_CODE_USE_GITHUB=1` in `~/.claude/settings.json` (or merged file) and that inference works without exporting `GITHUB_TOKEN`.
4. `bun test` (new suites) + `bun run build`.

## Notes / follow-ups

- Device flow OAuth app client ID is configurable via `GITHUB_DEVICE_FLOW_CLIENT_ID`; verify scope list against current GitHub Models documentation.
- `/logout` currently deletes all secure storage; GitHub token is cleared too — document or narrow in a follow-up.
- Linux: secure storage is plaintext with chmod 600 today; libsecret is still TODO in `secureStorage`.
