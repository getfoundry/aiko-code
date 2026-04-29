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
aiko-code /guide "refactor the auth module to use JWT"

# Run in non-interactive mode
aiko-code -c "list all files in src/services"
```

## Harness Architecture

The 9-phase fractal harness is registered as a bundled skill at startup
(`src/skills/bundled/aikoCodeHarness.ts`). The `/guide` command, the
native Stop hook callback, and control commands (`/cancel`, `/log`,
`/steer`) are all baked in — no plugin install needed.

### How `/guide` Works

When you type `/guide "refactor auth"` the harness does this:

1. **`setupHarness`** (TS, `src/harness/setup.ts`) writes a YAML
   frontmatter state file to `.aiko/aiko-code.<session>.local.md` with the
   task, `step: 0`, `noop_count: 0`, north star, completion promise, and a
   teachings-log file beside it.
2. The agent's first turn produces nothing yet — the **Stop hook** fires
   at end-of-turn and `advanceHarness` (`src/harness/loop.ts`) injects
   Phase 1's directive (principle / tactical / problem-map / apply work)
   as the resume prompt.
3. The agent works the phase, then **must append a teachings line** of the
   form `- [step N <title>] <one-line lesson>` to the teachings log.
4. Next turn ends → Stop hook fires → `advanceHarness`:
   - Reads the current step from frontmatter
   - **Validates work-product**: scans the teachings file for
     `[step N ` marker. If absent, increments `noop_count`, re-injects
     the same step's directive with a `<no-op-warning>` block, and bails
     after 3 consecutive no-ops with a session-close message.
   - Otherwise advances to step N+1 and injects that phase's directive.
5. Cycle repeats until step 9 emits `<promise>{phrase}</promise>` (loop
   closes cleanly) or `/cancel`.

The harness is session-scoped — `/guide "task A" --session a` and
`/guide "task B" --session b` run concurrently. The Stop hook picks the
most-recently-modified state file each turn.

### Phases & Fibonacci Parallelism

Each phase ships a principle, tactical hint, problem-map prompt, and the
concrete `apply` work text. The directive injected each turn instructs
the agent to fan out to N parallel sub-agents per the Fibonacci budget —
**1, 1, 2, 3, 5, 8, 1, 13, 21** across the 9 steps:

| Phase | Focus | Parallel sub-agents |
|-------|-------|---------------------|
| 1. Survey | Inventory what exists before building | 1 |
| 2. Boundaries | Layers, modules, contracts | 1 |
| 3. Skeleton | Minimal runnable seed / stub | 2 |
| 4. Signals | Tests, types, metrics | 3 |
| 5. Edges | Empty / malformed / concurrent / partial-failure / hostile | 5 |
| 6. Integration | Cold-start / warm / upgrade / rollback / multi-tenant / idle / peak / recovery | 8 |
| 7. Verdict | Single-threaded PROMOTE / HOLD / REJECT | 1 |
| 8. Audit | Cold review across 13 slices (api / data / errors / perf / security / observ / docs / types / tests / deps / build / deploy / rollback) | 13 |
| 9. Ship | Publish fan-out (commit / tag / changelog / docs / hand-off / monitoring / on-call / rollback plan / etc.) | up to 21 |

Sub-agents run via the `Agent` tool — single assistant message with N
`tool_use` blocks. The harness directive instructs this; the model
complies.

### Work-Product Validation

`advanceHarness` won't let the model walk through the phases without
producing actual artifacts. Each step's directive instructs the agent to
append a teachings line. If the line is missing on the next firing, the
harness re-injects the same step instead of advancing. After 3
consecutive no-ops the session closes with a clear message — no more
infinite-loop-on-empty-Write degenerate paths.

### Nested Harness (fib-harness)

When a step can't close in one pass, `break-harness.sh` (under the
bundled plugin tree) sets `harness_ws` in the state file. `advanceHarness`
detects this and switches mode: the next directive becomes a **child
harness scoped to the stuck sub-problem**, which runs its own full
9-phase cycle to verdict=promote. Then `harness_ws` clears and the
parent resumes from where it left off. True fractal recursion — a
verification loop inside another verification loop.

### Routing from the Guide Agent

The `aiko-code-guide` subagent (`src/tools/AgentTool/built-in/aikoCodeGuideAgent.ts`)
is the entry point for "Can aiko-code...", "How do I...", and bug-shaped
questions. It classifies trivial vs non-trivial:

- **Trivial** (single-fact lookup, doc question): answers directly with
  doc URL or DeepWiki citation.
- **Non-trivial** (bug, multi-file change, "isn't working"): invokes
  `/guide` via the `Skill` tool with a task statement that **embeds tool
  routing for the relevant phases** — DeepWiki at survey/audit,
  agent-browser at edges/integration, aiko SDK debug-replay at
  signals/verdict. The harness phases.ts is domain-agnostic; the routing
  rides on the appended `task` string.

The guide-agent prompt also ships **tool playbooks** the agent reads
before deciding — concrete how-tos for DeepWiki (`read_wiki_structure`
vs `ask_question`, common target repos), agent-browser (CDP setup for
web vs Electron, capture table for screenshots/console/network/eval/
click/dom/perf-trace, common gotchas like service-worker cache), and
aiko SDK debug replay (`ANTHROPIC_LOG=debug` runner, `usage.cache_*`,
`messages.countTokens`, raw SSE dump, tool-use loop counting).

### Session Management

Multiple sessions can run concurrently. Each has its own state file and
teachings log. The Stop hook picks the most-recently-modified session.

### State Files

| File | Purpose |
|------|---------|
| `.aiko/aiko-code.<session>.local.md` | Loop state — `step`, `noop_count`, `north_star`, `completion_promise`, `harness_ws` |
| `.aiko/aiko-code.<session>.teachings.local.md` | Phase-by-phase lessons learned (work-product gate) |

## Harness Commands

| Command | Description |
|---------|-------------|
| `/guide "task" [--session NAME] [--north-star "<text>"]` | Start the 9-phase fractal harness |
| `/cancel [--session NAME \| --all]` | Abort a session (or all) |
| `/log [--session NAME \| --all]` | Read session teachings |
| `/steer [--session NAME] "direction"` | Re-aim the north star mid-flight |

### Visibility

- **TUI banner** — SessionStart emits `aiko-code ◉ taste:on  harness:loaded` plus a one-line confirmation in conversation context.
- **Statusline** — drop into `~/.aiko/settings.json` to see active sessions and mode:
  ```json
  "statusLine": { "type": "command",
                  "command": "<plugin-root>/scripts/statusline.sh" }
  ```
  The exact path is printed when you run `/guide`.

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

### Tooling Credits

The 9-phase harness's evidence gate and the dependency-boundary audit hang on a small set of external tools. All MIT-equivalent permissive, all linked at runtime — none are vendored.

- **[DeepWiki](https://deepwiki.com)** — RAG-on-rails for public GitHub repos. Surfaces upstream wikis with cited line references via the `mcp__deepwiki__read_wiki_structure` and `mcp__deepwiki__ask_question` MCP tools. Every harness step (and every parallel sub-agent slice) must cite a DeepWiki query in its teachings line as `dw:<owner/repo#topic>`. Also the tier-3 fallback for the boundary audit: when LSP and the bundled TS AST scanner both come up empty, the audit emits structured DeepWiki queries against the canonical upstream repo (`facebook/react`, `vercel/next.js`, `spring-projects/spring-framework`, `pytest-dev/pytest`, …) so the model can ground producer/consumer patterns in official docs.
- **[agent-browser](https://github.com/vercel-labs/agent-browser)** — Chrome DevTools Protocol over a CLI (`npx agent-browser`). Used for the e2e and UX-empathy gates on harness steps 1, 4, 5, 6, 8, 9 — screenshots, console errors, network failures, page evals. For the Aiko Electron host: launch with `--remote-debugging-port=9222` then `connect http://localhost:9222`. Evidence lands in the teachings line as `ab:<screenshot-path|console-error|network-failure|eval-result>`.
- **[serena](https://github.com/oraios/serena)** by oraios — LSP-backed semantic code intelligence as an MCP server. **Auto-registered** as a built-in MCP — when [`uv`](https://docs.astral.sh/uv/) is on PATH, aiko-code spawns it via `uvx --from git+https://github.com/oraios/serena serena-mcp-server`. First-run latency is 10–30s while uvx fetches serena and its dependencies; subsequent runs are sub-second. Wraps tsserver, pyright, gopls, rust-analyzer, jdtls, clangd, ruby-lsp via [solid-lsp](https://github.com/oraios/solid-lsp). Tools surface as `mcp__serena__find_symbol` / `mcp__serena__find_referencing_symbols` / etc. Install uv: `brew install uv` (macOS/Linux) or `curl -LsSf https://astral.sh/uv/install.sh | sh`.
- **TypeScript AST** (in-process, tier-2 fallback) — uses the bundled `typescript` package's compiler API to parse `.ts`/`.tsx`/`.js`/`.jsx` directly. Real syntax tree, alias resolution for imports, no false positives from comments/strings. Always available; no setup required.

The audit's three-tier fallback chain: serena MCP / fcode LSP plugin (preferred when configured) → in-process TypeScript AST (always available for TS/JSX) → DeepWiki for canonical-pattern lookup (when local code analysis came up empty). No regex tier — guess-based scanning produces noisy false positives, so the audit prefers honest "we don't know, here's what to ask the docs" over false confidence.

## OpenAI-Compatible API (free for a month)

aiko Code routes to the aiko API by default (`https://aiko-api.getfoundry.app/v1`), which speaks the OpenAI chat completions protocol and can be used free for a month. works with aiko Code, openclaw, and any OpenAI-compatible coding agent. we do not collect any data — your prompts, responses, and usage stay between you and the API. no config changes needed, it's the default.

### Quick start

The `/v1/chat/completions` endpoint is free for now — no API key, no signup. works with aiko Code, openclaw, and any OpenAI-compatible coding agent. we do not collect any data — your prompts, responses, and usage stay between you and the API.

```bash
export OPENAI_BASE_URL=https://aiko-api.getfoundry.app/v1
```

### Full OpenAPI spec

The API is a faithful subset of the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat).

#### `POST /v1/chat/completions`

Generate a chat completion.

**Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | yes | `application/json` |

**Request body:**

```json
{
  "model": "aiko-opus-4.6",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `model` | string | no | `aiko-opus-4.6` | Model to use (see model list below) |
| `messages` | array | yes | — | Conversation history (see [OpenAI format](https://platform.openai.com/docs/api-reference/chat/create#chat-create-messages)) |
| `stream` | boolean | no | `false` | Enable streaming (SSE) |
| `max_tokens` | integer | no | null | Max tokens in response |
| `temperature` | number | no | `1.0` | Sampling temperature |
| `top_p` | number | no | `1.0` | Nucleus sampling |
| `tools` | array | no | — | Tool/function calling format |

**Response (non-streaming):**

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1745900000,
  "model": "aiko-opus-4.6",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hey there! How can I help?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 12,
    "total_tokens": 37
  }
}
```

**Example with curl:**

```bash
curl https://aiko-api.getfoundry.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "aiko-opus-4.6",
    "messages": [
      { "role": "user", "content": "What is the capital of France?" }
    ]
  }'
```

**Example streaming:**

```bash
curl https://aiko-api.getfoundry.app/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "aiko-sonnet-4.6",
    "messages": [
      { "role": "user", "content": "Tell me a joke" }
    ],
    "stream": true
  }'
```

### Available models

| Model | ID | Best for |
|-------|----|----------|
| aiko Opus 4.6 | `aiko-opus-4.6` | Complex reasoning, code generation, multi-step tasks |
| aiko Sonnet 4.6 | `aiko-sonnet-4.6` | Fast, capable — good default for most tasks |
| aiko Haiku 4.5 | `aiko-haiku-4-5` | Quick answers, lightweight tasks |
| GPT-5.5 | `gpt-5.5` | OpenAI's flagship |
| GPT-5.4 | `gpt-5.4` | Strong general-purpose |
| GPT-4o | `gpt-4o` | Fast and versatile |
| Codex (gpt-5.5) | `codexplan` | Autonomous coding agent with reasoning |
| Codex Spark (gpt-5.3-codex-spark) | `codexspark` | High-throughput autonomous coding |

**Alias shortcuts** — use these in `/model` or any OpenAI-compatible client:

| Alias | Resolves to |
|-------|-------------|
| `codexplan` | `gpt-5.5` (high reasoning) |
| `codexspark` | `gpt-5.3-codex-spark` |
| `gpt-5.5` | `gpt-5.5` (high reasoning) |
| `gpt-5.5-mini` | `gpt-5.5-mini` (medium reasoning) |
| `gpt-5.4-mini` | `gpt-5.4-mini` (medium reasoning) |
| `gpt-5.4` | `gpt-5.4` (high reasoning) |
| `gpt-5.3-codex` | `gpt-5.3-codex` (high reasoning) |
| `gpt-5.2-codex` | `gpt-5.2-codex` (high reasoning) |
| `gpt-5.2` | `gpt-5.2` (medium reasoning) |

### Error codes

| HTTP status | Meaning |
|-------------|---------|
| `401` | Invalid or missing API key |
| `429` | Rate limited — free tier has generous per-minute limits |
| `500` | Internal server error — retry with backoff |

### Swapping endpoints

Set `OPENAI_BASE_URL` to point any OpenAI-compatible client at the aiko API:

```bash
export OPENAI_BASE_URL=https://aiko-api.getfoundry.app/v1
```

Use with `curl`, Python (`openai` package), TypeScript (`openai` npm), or any SDK that speaks the OpenAI protocol.

## License

MIT
