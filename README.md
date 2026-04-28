# aiko Code

<!--
Attribution: aiko Code is a fork of [openclaude](https://github.com/Gitlawb/openclaude), which itself originated from Anthropic's aiko Code. We're grateful to the openclaude community for their foundational work — this project builds on their efforts and pushes them further.

The bundled `/taste`, `/audit`, `/critique`, and `/craft` skills are baked from two open sources:
- [impeccable.style](https://impeccable.style/docs/) — design loop, audit/critique command shape, 37-pattern slop catalogue.
- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) — high-agency frontend rules, anti-slop directives, motion-engine bento paradigm.

Credit and thanks to both authors. The aiko bundle adapts and condenses their material; consult the originals for full canonical guidance.
-->

[![npm](https://img.shields.io/npm/v/aiko.svg)](https://www.npmjs.com/package/aiko)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A terminal-first AI coding agent built with React (Ink) that wraps multiple LLM providers through a unified interface. Routes Anthropic SDK calls through an OpenAI-compatible shim, so you can swap between aiko API, OpenAI, Codex, Gemini, and any OpenAI-compatible endpoint without changing the rest of the codebase.

## Architecture

aiko Code sits between the Anthropic SDK and your preferred API. The [OpenAI shim](src/services/api/openaiShim.ts) translates Anthropic's `messages.create` calls into OpenAI-compatible chat completion requests, then streams back responses in Anthropic's format. The rest of the codebase stays the same regardless of which backend you're using.

**Provider resolution** (see `src/utils/model/providers.ts`):

- **aiko API** (default) — routes to `aiko-api.getfoundry.app/v1`
- **OpenAI-compatible** — set `OPENAI_BASE_URL` to use any OpenAI-compatible endpoint
- **Codex** — Google's Codex agent via `gpt-5.x` model aliases
- **Gemini** — Google's Gemini models via their API
- **GitHub Copilot** — the `github` provider for Copilot-hosted models
- **NVIDIA NIM, Minimax, Mistral, xAI** — additional provider support

## Features

- **Multi-provider**: Route Anthropic SDK calls through OpenAI-compatible endpoints or direct provider SDKs (Bedrock, Vertex, Foundry/Azure). Switch backends with environment variables.
- **9-Phase Fractal Harness (Ralph)**: `/auto "task"` starts a structured development loop (survey → ship) with session state in `.aiko/`. Each Stop hook advances the phase, injects an engineering principle, and adapts work. If a step can't close, `break-harness.sh` spawns a nested **fib-harness** cycle scoped to the stuck sub-problem. Harnesses nest up to 3 levels deep — each child is a full verification loop that must pass before the parent advances.
- **Plugin system**: Extensible hooks (Stop, SessionStart, etc.) and bundled plugins for harness integration, design quality enforcement, and more.
- **Claude Code skills**: Automatically loads 500+ skills from `~/.claude/skills/` with file caching at `~/.aiko/skills-cache.json`.
- **Terminal-first UX**: Built with Ink (React for CLI). Streaming output, session logging, Vim-style keybindings, interactive menus.
- **Team memory**: Shared file-based memory system at `~/.aiko/projects/<project>/memory/` that persists across sessions and can be synced across teams.
- **Vim mode**: Built-in vim keybindings for navigation during sessions.

## Installation

Make sure you have [Node.js](https://nodejs.org/) (v20+) installed, then:

```bash
npm install -g aiko-code
```

That's it. The default API endpoint is [aiko API](https://aiko-api.getfoundry.app/v1). To use a different provider, set the appropriate environment variables:

```bash
# Use a custom OpenAI-compatible endpoint
export OPENAI_BASE_URL=https://your-endpoint.example.com/v1

# Use OpenAI directly
export OPENAI_API_KEY=sk-...
```

Build from source:

```bash
git clone https://github.com/getfoundry/aiko-code.git
cd aiko-code
npm install
npm run build
npm install -g .
```

## Quick Start

```bash
# Start interactive session
aiko-code

# Run a task via the harness
aiko-code /auto "refactor the auth module to use JWT"

# Run in non-interactive mode
aiko-code -c "list all files in src/services"
```

## Harness Architecture

The harness is a stateful loop registered as bundled skills at startup (`src/skills/bundled/aikoCodeHarness.ts`). The `/auto` command, `/stop` hook, and control commands (`/cancel`, `/log`, `/steer`) are all baked in — no plugin install needed.

### How `/auto` Works

When you type `/auto "refactor auth"` the harness does this:

1. **`setup-loop.sh`** writes a YAML frontmatter state file to `.aiko/aiko-code.<session>.local.md` with the task, phase (`step: 1`), north star, completion promise, and a multi-line prompt explaining the 9 phases and the principles to follow.
2. The agent sees the Phase 1 (Survey) prompt and starts working.
3. The harness registers a **PreToolUse hook** on `AgentTool` at startup (`src/skills/bundled/aikoCodeHarness.ts`). Every time the agent calls a tool — read, write, bash, or especially AgentTool — the hook fires.
4. **`stop-hook.sh`** detects the active session file, then calls **`loop.sh`** which:
   - Reads the current step from the frontmatter
   - Selects the next phase and picks a principle from `creation-teachings.json`
   - Checks for `/steer` to rewrite the north star
   - Generates a new prompt for that phase and injects it into the agent's context
5. The agent continues with the new phase prompt, and the cycle repeats until `/cancel` or a `SHIPPED` completion promise.

The harness is session-scoped — you can run `/auto "task A" --session a` and `/auto "task B" --session b` concurrently. `stop-hook.sh` picks the most-recently-modified state file each turn.

### Main Loop (loop.sh)

Runs 9 phases from a single state file (`.aiko/aiko-code.<session>.local.md`):

| Phase | Focus | When it runs |
|-------|-------|--------------|
| 1. Survey | Inventory what exists before building | First pass |
| 2. Boundaries | Design separations — layers, modules, contracts | First pass |
| 3. Skeleton | Minimal runnable seed / stub | First pass |
| 4. Signals | Falsifiable checks — tests, types, assertions | First pass |
| 5. Edges | Adversarial behavior — edge cases, concurrency | First pass |
| 6. Integration | End-to-end exercise across the seams | First pass |
| 7. Verdict | Single-threaded PROMOTE / HOLD / REJECT | After phases 1–6 |
| 8. Audit | Cold re-read of the record without builder bias | After PROMOTE |
| 9. Ship | Deliver the artifact — commit, document, hand off | After Audit |

The loop fires on every tool call via the PreToolUse hook (not just Stop). It reads the current step from the frontmatter, advances to the next phase, picks a principle from `creation-teachings.json`, and generates a new prompt. A parallelism budget (1, 1, 2, 3, 5, 8, 1, 13, 21) is communicated to the agent for that phase — it's a suggestion, not an enforcement. Phase 7 (Verdict) is always single-threaded.

### Nested Harness (fib-harness)

When a step can't close in one pass, `/fib-harness` (or `break-harness.sh --step N --scope "..."`) spawns a child verification harness in `/tmp/`. This is where the fractal behavior comes from:

- The child harness registers **6 dimensions** (genesis days) scoped to the stuck problem. Each dimension declares a primitive — code execution, skill invocation, or both.
- It runs a 20-agent investigation cycle (1 + 1 + 2 + 3 + 5 + 8 agents across 6 levels), collecting hypothesis artifacts.
- **Judge** evaluates all hypotheses. If there are failures, it checks whether it can spawn children (max depth 5).
- **spawn-child** creates another full harness at depth + 1, scoped to the specific failure. The child runs its own 20-agent cycle independently.
- **link-child** connects the child's verdict back to the parent. The parent waits for all children to resolve before rendering its own verdict.
- The parent harness advances to the next main-loop step only when its verdict is **PROMOTE** (all children pass).

This nested structure means the harness can recursively drill down into a stuck problem — a verification loop inside another verification loop — up to 5 levels deep.

### Session Management

Multiple sessions can run concurrently. Each has its own state file and teachings log. The Stop hook automatically picks the most-recently-modified session.

### SubagentStop Hook

The harness also responds to `SubagentStop` events. When a spawned sub-agent completes, the hook fires with the subagent's context — allowing the loop to react to agent completions, not just Stop/halt events.

### State Files

| File | Purpose |
|------|---------|
| `.aiko/aiko-code.<session>.local.md` | Loop state — current step, north star, completion promise, harness_ws |
| `.aiko/aiko-code.<session>.teachings.local.md` | Phase-by-phase lessons learned |

## Harness Commands

| Command | Description |
|---------|-------------|
| `/auto "task"` | Start the fractal harness. Defaults to `--mode restructure`. |
| `/auto --mode experiment "task"` | Run in experiment mode — divergent variants, keep what bears fruit. |
| `/stop` | Advance to next phase |
| `/cancel` | Abort current session |
| `/log` | Read session teachings |
| `/steer "direction"` | Re-aim mid-flight |
| `/fib-harness` | Repair a stuck step — spawns a nested fib-harness cycle |
| `/taste` `/audit` `/critique` `/craft` | Senior UI/UX design skills auto-invoked by the Taste Gate when the task touches UI |

### Harness Modes

The harness has two complementary modes that work hand-in-hand:

- **`restructure`** (default, OT/law) — judges dimensions against success criteria, recurses into a child harness on each blocking failure until verdict=promote. Best for cleanup, alignment, "make this match the spec."
- **`experiment`** (NT/grace) — fans out divergent variants per dimension, keeps the ones that bear fruit, logs the rest without condemnation. Best for exploration, "try several things and see what works."

The two hand off: experiment → restructure to consolidate when a dimension has no keeper; restructure → experiment when judge returns `needs_investigation` with no clear repair direction.

### Taste Gate (PHASE -1)

Before every harness run, the agent decides whether the task touches UI/frontend/design (judgement, not regex). If it does, the harness invokes the appropriate taste-family skill — `/craft` for new UI, `/audit` for review, `/critique` for second-opinion, `/taste` otherwise — and treats its output as a binding constraint when declaring dimensions.

### Visibility

- **TUI banner** — SessionStart emits `aiko-code ◉ taste:on  harness:loaded` plus a one-line confirmation in conversation context.
- **Statusline** — drop into `~/.claude/settings.json` to see active sessions and mode (`✶` experiment, `△` restructure):
  ```json
  "statusLine": { "type": "command",
                  "command": "<plugin-root>/scripts/statusline.sh" }
  ```
  The exact path is printed when you run `/auto`.
## Configuration

All configuration lives in `~/.aiko/settings.json`. Key settings:

- `disableClaudeSkills`: Disable loading Claude Code skills from `~/.claude/skills/`

Environment variables control API routing:

- `OPENAI_BASE_URL`: Override the default aiko API endpoint with any OpenAI-compatible URL
- `OPENAI_API_KEY`: API key for OpenAI-compatible endpoints
- `ANTHROPIC_API_KEY`: Direct Anthropic API key (for non-shim paths)
- `GITHUB_TOKEN`: Authentication for GitHub Copilot provider

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Fork Attribution

This project is a fork of [openclaude](https://github.com/Gitlawb/openclaude) by Gitlawb, which itself traces back to Anthropic's original aiko Code work. We're proud to build on their foundation. If you use aiko Code, consider also checking out [openclaude](https://github.com/Gitlawb/openclaude) — both projects are alive and well.

## License

MIT
