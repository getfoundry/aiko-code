# aiko Code

<!--
Attribution: aiko Code is a fork of [openclaude](https://github.com/Gitlawb/openclaude), which itself originated from Anthropic's aiko Code. We're grateful to the openclaude community for their foundational work — this project builds on their efforts and pushes them further.
-->

[![npm](https://img.shields.io/npm/v/aiko.svg)](https://www.npmjs.com/package/aiko)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A terminal-first AI coding agent that runs **everywhere** — cloud APIs, local models, anything OpenAI-compatible. Build, ship, and iterate with the power of a 9-phase fractal harness.

## Powered by [aiko API](https://aiko-api.getfoundry.app/v1)

The heart of aiko Code is our own lightweight OpenAI-compatible API — fast, cheap, and designed for agent workloads. It's the only endpoint needed. No config, no switching, no overhead.

- **Low latency**: Sub-second response times. The kind of speed that makes terminal workflows feel instant.
- **Cost-efficient**: Fractions of a cent per turn. Your coding brain time is worth way more.

## The 9-Phase Fractal Harness (Ralph)

Built-in development workflow that turns any task into a structured, multi-agent production line. Run it with `/auto "your task"`.

| Phase   | Focus                            | Workers |
|---------|----------------------------------|---------|
| Survey  | Inventory what exists            | 1       |
| Boundaries | Design separations/architecture | 1      |
| Skeleton| Minimal runnable seed            | 2       |
| Signals | Tests, types, falsifiable checks | 3       |
| Edges   | Adversarial/edge case testing    | 5       |
| Integration| End-to-end wiring             | 8       |
| Verdict | PROMOTE / HOLD / REJECT          | 1       |
| Audit   | Cold re-read, adversarial review | 13      |
| Ship    | Deliver/hand off                 | 21      |

Uses a **Fibonacci parallelism budget** — each phase spawns workers matching Fibonacci numbers, scaling from 1 (survey) to 21 (ship). State persists across sessions so you can pause, reroute, and continue.

## Features

- **Single API endpoint**: All API calls route through [aiko API](https://aiko-api.getfoundry.app/v1) — our own high-performance OpenAI-compatible gateway. No config, no switching, no overhead.
- **Multi-agent harness**: Run the 9-phase fractal loop for complex tasks, or use individual agents for simpler work.
- **Plugin system**: Bundled plugins for harness integration, design quality, and more. Extensible via plugins.
- **Claude Code skills**: Automatically loads skills from `~/.claude/skills/` — inherit 500+ community skills with zero setup.
- **Terminal-first UX**: Built with Ink (React for CLI). Streaming output, session logging, interactive menus.
- **Team memory**: Shared memory system across your team. File-based, version-controlled knowledge that persists across sessions.

## Installation

Make sure you have [Node.js](https://nodejs.org/) (v20+) installed, then:

```bash
npm install -g aiko
```

That's it. No API keys, no config. Just:

```bash
aiko
```

If you prefer to build from source:

```bash
git clone https://github.com/getfoundry/aiko.git
cd aiko
npm install
npm run build
npm install -g .
```

## Quick Start

```bash
# Start interactive session
aiko

# Run with a task via the harness
aiko /auto "refactor the auth module to use JWT"

# Run in non-interactive mode
aiko -c "list all files in src/services"
```

## Harness Commands

| Command | Description |
|---------|-------------|
| `/auto "task"` | Start the 9-phase fractal loop |
| `/stop` | Advance to next phase |
| `/cancel` | Abort current session |
| `/log` | Read session teachings |
| `/steer "direction"` | Re-aim mid-flight |
| `/fib-harness` | Repair stuck harness |

## Configuration

All configuration lives in `~/.aiko/settings.json`. Key settings:

- `disableClaudeSkills`: Disable loading Claude Code skills from `~/.claude/skills/`

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Fork Attribution

This project is a fork of [openclaude](https://github.com/Gitlawb/openclaude) by Gitlawb, which itself traces back to Anthropic's original aiko Code work. We're proud to build on their foundation. If you use aiko Code, consider also checking out [openclaude](https://github.com/Gitlawb/openclaude) — both projects are alive and well.

## License

MIT
