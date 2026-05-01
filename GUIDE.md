# Loop Harness Guide

How `/guide` (the 9-phase fractal loop) is wired, what it borrows from GSD, and where we go beyond.

## The 9 phases (src/harness/phases.ts)

| Step | Label        | Fib | Purpose                                       |
|------|--------------|-----|-----------------------------------------------|
| 1    | survey       | 1   | inventory before building                     |
| 2    | boundaries   | 1   | architecture seams + **must_haves contract**  |
| 3    | skeleton     | 2   | first runnable artifact                       |
| 4    | signals      | 3   | tests, types, metrics                         |
| 5    | edges        | 5   | adversarial probes                            |
| 6    | integration  | 8   | end-to-end flows + **API reality check**      |
| 7    | verdict      | 1   | promote/hold/reject + **goal-backward verify**|
| 8    | audit        | 13  | cold review + **stub scan + checkpoint file** |
| 9    | ship         | 21  | publish + **atomic commit per phase**         |

Stop-hook (`src/plugins/bundled/aiko-code/hooks/stop-hook.sh`) intercepts every Stop and runs `core/loop.sh`, which fires the next phase via `phases.ts`. Fractal repair auto-engages on stuck steps and fans out 5 adversarial sub-agents.

## GSD borrows (now baked into phases.ts)

Seven patterns lifted from `gsd-build/get-shit-done`, wired as named constants the gate reads every turn:

1. **`MUST_HAVES_DECL`** → Step 2. Architecture sketch must declare `truths:`, `artifacts:`, `key_links:`. Step 7 checks them.
2. **`PLAN_SELF_VERIFY`** → Step 2. Pre-flight: each must_have row testable from outside? Real path? Real symbol? Fix before exit.
3. **`API_REALITY_CHECK`** → Step 6. One real call per external API, diff response shape vs. expected, append to `dw-cache.local.md`. Catches "code expects fields the API doesn't return."
4. **`STUB_SCAN`** → Step 8. `rg` for TODO/return null/NotImplemented/empty bodies in changed files. Any hit blocks verdict.
5. **`GOAL_BACKWARD_VERIFY`** → Step 7. Re-read must_haves, check 3 levels (EXISTS → SUBSTANTIVE → WIRED), output exactly `passed | gaps_found: ... | human_needed: ...`. No fourth state.
6. **`CHECKPOINT_FILE`** → Step 8. Write `.aiko/aiko-code.<session>.continue-here.local.md` with `<current_state>`, `<decisions_made>` (with WHY), `<next_action>`, `<files_in_flight>`. Read by next session if compaction didn't fire.
7. **`ATOMIC_COMMIT`** → Step 9. One `git commit` per phase, message format `{type}({step}-{label}): {outcome}`. `git log --oneline` reads as the loop transcript.

### Reverse-yoinks (extras the GSD doc inspired)

8. **`CONTEXT_THRESHOLDS`** → Steps 5, 6, 8. Self-check at end of step: PEAK 0-30% / GOOD 30-50% / DEGRADING 50-70% (write `.aiko/aiko-code.<session>.context-state.local.md` checkpoint) / POOR 70%+ (don't reach this). Lighter than waiting for AIKO.md compaction.
9. **`CODEBASE_CACHE`** → Step 1. Read `.aiko/codebase/{STRUCTURE,STACK,ARCHITECTURE,CONVENTIONS,INTEGRATIONS}.md` first; populate any missing or >7d-stale ones this turn. Skips re-walking the repo every arc.
10. **`READ_ONLY_LINT`** → Steps 3, 4, 5, 6. The `must_haves:` block from Step 2 is READ-ONLY during build phases. Worker that wants to relax a truth/artifact/key_link must surface a `H1 spec-vs-build conflict:` teachings line instead of editing the spec to fit.

## What we have that GSD doesn't

| Capability                          | aiko-code `/guide`                                   | GSD                                |
|-------------------------------------|------------------------------------------------------|------------------------------------|
| Execution model                     | 9-phase fractal loop, native TS, stop-hook driven    | Slash commands run by Cursor user  |
| Parallelism                         | Fibonacci budget (1,1,2,3,5,8,1,13,21) per phase     | Single-threaded, sequential        |
| Stuck-step recovery                 | Fractal repair: 5 adversarial sub-agents auto-spawn  | Manual gap closure                 |
| Self-correction                     | Stop-hook intercepts every turn, re-injects phase    | User must invoke next command      |
| Mid-flight steering                 | `/steer "<new north star>"` re-injects every step    | Edit ROADMAP.md and re-plan        |
| Compaction resilience               | AIKO.md auto-snapshot on every overflow path         | Manual `pause`/`resume`            |
| Per-session isolation               | `.aiko/aiko-code.<session>.local.md` per session     | One `.planning/` per repo          |
| Multi-channel surface               | Telegram bot, CLI, IDE — same agent, same loop       | Cursor IDE only                    |
| Empathy probes built-in             | agent-browser session-reuse + screenshot per phase   | None                               |
| Domain RAG cache                    | DeepWiki cache-first (`.aiko/dw-cache.local.md`)     | Web search per request             |
| Boundary audit                      | `/audit-boundaries` skill + Serena MCP fallback      | Manual                             |
| Taste/UX gating                     | Auto-routes `/design-taste-frontend`, `/ui-ux-pro-max`, `/code-review` per phase | Not defined |
| Teachings log                       | Structured `H1: <hyp> env: dw: ab:` per step         | None — only state files            |
| Fix-not-document rule               | Deterministic failures get fixed THIS turn or step re-runs | "Document and defer" allowed |

## State files

- `.aiko/aiko-code.<session>.local.md` — session state (current step, north star, completion promise)
- `.aiko/aiko-code.<session>.teachings.local.md` — append-only teachings log, one line per step
- `.aiko/dw-cache.local.md` — DeepWiki RAG cache (24h TTL)
- `.aiko/cdp-port.local.txt` — agent-browser CDP port (session-reuse)
- `.aiko/dev-url.local.txt` — dev-server URL (human preview reuse)
- `.aiko/aiko-code.<session>.continue-here.local.md` — Step 8 checkpoint (NEW from GSD borrow)
- `AIKO.md` — pre-compaction journal, shared across sessions
