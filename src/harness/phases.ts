/**
 * 9-step harness phase definitions.
 *
 * Each step ships principle, tactical parallel, problem-map prompt, and the
 * concrete `apply` work. Per-step Fibonacci parallelism budget controls
 * sub-agent fan-out instructions: 1,1,2,3,5,8 across the build steps,
 * 1 for the verdict, 13 for cold audit, 21 for ship.
 *
 * `apply` may contain the `{COMPLETION_PROMISE}` placeholder which is
 * substituted at injection time with the session's completion phrase.
 *
 * `requires` declares the evidence tags the stop-hook gate enforces on the
 * teachings line for this step. `env:` is always required (full environment
 * + context). `dw:` is always required (DeepWiki RAG). `ab:` is required
 * when `requires.agentBrowser` is true.
 */
export type HarnessPhase = {
  step: number
  label: string
  title: string
  principle: string
  tactical: string
  problemMap: string
  apply: string
  fibBudget: number
  requires: {
    deepwiki: boolean
    agentBrowser: boolean
  }
}

const DEEPWIKI_RAG =
  'RAG context via DeepWiki (cache-first): before calling, grep `.aiko/dw-cache.local.md` for the `<owner/repo#topic>` you need — if a recent entry exists (≤24h old), reuse it and cite it as `dw:<owner/repo#topic>` (cached). Only on cache miss: call mcp__deepwiki__read_wiki_structure then mcp__deepwiki__ask_question against the upstream repo, then append the answer to `.aiko/dw-cache.local.md` in the format `## <owner/repo#topic> [<ISO timestamp>]\n<one-paragraph cited summary>\n` so subsequent steps reuse it. Quote a cited file:line back into your teachings line as `dw:<owner/repo#topic>`. After reviewing upstream docs and before finalizing design decisions, invoke the `/taste` skill (or `/design-taste-frontend`, `/ui-ux-pro-max`, `/code-review` — whichever matches the slice) to validate the design is sound against the upstream patterns. Never rely on training-data memory — your knowledge of the world is stale.'

const AGENT_BROWSER_PROBE =
  'Empathy probe — see what the user sees (session-reuse): first, check if the user sent a screenshot or described what they are looking at. If they did, reason from that visual context before reaching for automated tools. If not, try agent-browser (if `.aiko/cdp-port.local.txt` exists, read the port and `npx agent-browser connect http://localhost:<port>` — reuse the live session). Otherwise launch fresh: `npx agent-browser` (Electron host: app must be launched with `--remote-debugging-port=9222` then `connect http://localhost:9222`); on first launch write the port to `.aiko/cdp-port.local.txt` so later steps skip the cold-start cost. Walk the actual UI as a user would — screenshot, console, network, eval. Capture evidence as `ab:<screenshot-path|console-error|network-failure|eval-result>`.'

const TASTE_SKILL_ROUTING =
  'Taste/UX skill routing: enumerate available Skills and invoke whichever match `taste|critique|design-review|ux|frontend-design|ui-ux` for the slice — common candidates installed at the user level: `/design-taste-frontend`, `/ui-ux-pro-max`, `/gpt-taste`, `/running-design-reviews`, `/frontend-design`, `/code-review`, `/stitch-design-taste`, `/minimalist-ui`. Pick by name match against the slice (frontend bug → `/frontend-design` or `/ui-ux-pro-max`; pure visual taste → `/design-taste-frontend` or `/gpt-taste`; structured review framing → `/running-design-reviews`). If no match exists, note `taste-skill:none-installed` in the report and rely on the agent-browser pass alone.'

const HUMAN_PREVIEW =
  'Human preview: detect the dev script from package.json (bun dev / pnpm dev / npm run dev), run it backgrounded, parse the URL it prints, write that URL to `.aiko/dev-url.local.txt`. On first launch this turn, also `open <url>` (macOS) / `xdg-open <url>` (linux) so the human watching can eyeball the running app while agent-browser probes it programmatically. Subsequent steps reuse the URL — do not re-spawn the dev server if the file already exists and the port responds.'

const DEPENDENCY_BOUNDARY_AUDIT =
  'Dependency-boundary audit (part of step 1 inventory, before declaring it complete): invoke the bundled `/audit-boundaries` skill first — it uses LSP workspace/symbol queries + bundled TypeScript AST to find producer/consumer pairs (React Context, Spring DI, pytest fixtures, "use client" boundaries, etc.) across the workspace and emits findings as markdown. Paste the table into your inventory, and explicitly flag any row marked `unknown` or `unlikely` scope as a high-priority finding for step 5. **For non-TS languages (Python, Go, Rust, Java, Ruby, …) OR when /audit-boundaries reports empty findings for a TS pattern, additionally call `mcp__serena__find_symbol` and `mcp__serena__find_referencing_symbols` directly against the workspace.** Serena is auto-registered as a built-in MCP server (uv bundled with aiko-code; first call may take 10-30s while uvx fetches serena). Tools accept `name_path` (with `substring_matching=true` to fuzzy-match against the producer/consumer regex source), `relative_path` (defaults to the workspace), `include_body` (true for full source). The audit also emits a `## Serena follow-ups` block when local code analysis came up empty — run each suggested call. Language-agnostic by design. Extend the pattern registry via `.aiko/boundary-patterns.json`. For boundaries the static audit can\'t cover (dynamic plugin loaders, runtime DI, lazy require, env-var contracts, concurrent lock acquire/release, IPC sender/receiver, FFI binding load vs call site), enumerate them by hand from the inventory. Do NOT skip the audit.'

const FIX_NOT_DOCUMENT =
  'Fix-not-document rule: when a probe surfaces a deterministic, reproducible failure on this turn (not a flake, not a hardware quirk, not a third-party outage), apply the root-cause fix on this same turn before declaring step done. "Document and defer" is reserved for non-deterministic failures, environment-only failures, or scope-creep failures that genuinely belong to a different task. The harness gate sees the difference: a teachings line that records a reproducible bug as `H1 not yet validated, deferred` without an attached fix is a no-op, not a discovery — re-do the step. The deterministic-vs-non-deterministic test: can you trigger the failure twice in a row by repeating the same input? If yes, it is deterministic and must be fixed now.'

// ─── GSD borrows ────────────────────────────────────────────────────────────
// Seven patterns lifted from gsd-build/get-shit-done, adapted to the 9-phase
// loop. Each is a named string the gate reads as part of `apply` so it fires
// every turn the relevant phase runs.

const MUST_HAVES_DECL =
  'Must-haves declaration (goal-backward contract): at the top of your architecture sketch, write a `must_haves:` block with three sub-keys — `truths:` (observable behaviors a human can verify, e.g. "user can paste a code and get approved"), `artifacts:` (specific file paths that must exist with a one-line `provides:` description), `key_links:` (producer→consumer pairs, e.g. `from: cli/telegram.ts to: channels/pairing-store.ts via: approvePairingCode()`). Step 7 Verdict reads this block and checks each item EXISTS, is SUBSTANTIVE, and is WIRED. Vague truths ("works correctly") are rejected — they must be testable from the outside.'

const PLAN_SELF_VERIFY =
  'Plan self-verification (pre-flight gate): before declaring boundaries done, walk the must_haves list and answer for each row: (a) is the truth observable without reading code? (b) does the artifact path point to a file you intend to create/edit, not a hand-wave? (c) does the key_link name a real symbol that will exist after build? If any answer is no, fix the must_haves block before exiting this step. Cheap pre-flight that prevents Step 7 from rejecting the whole arc.'

const API_REALITY_CHECK =
  'API reality check (one real call, no mocks): for every external API surface this integration touches, make ONE live call with real credentials and diff the actual response shape against what the code expects. Append the result to `.aiko/dw-cache.local.md` as `## <provider>#<endpoint> [<ISO>]` with: status, fields actually returned, fields the code expects, gotchas (null-able fields, undocumented rate limits, response wrapping). Code that passes types but expects fields the API does not return is the #2 source of integration failures (after "I never actually called it"). Do not skip this even if you have a recent dw: entry — APIs drift.'

const STUB_SCAN =
  'Stub-and-placeholder scan (audit slice): one of the audit sub-agents must run a stub scan across files changed this arc — `rg -n "TODO|FIXME|XXX|return null;|return undefined;|throw new Error\\\\(.not implemented|NotImplementedError|pass\\\\s*$|console\\\\.log\\\\(.debug" <changed-files>` plus a check for empty function bodies and unhandled promise rejections. Any hit is a verdict-blocker unless explicitly scoped out in the must_haves block. Catches the #1 "loop declared done but left placeholders" failure mode that ralph-style loops produce.'

const GOAL_BACKWARD_VERIFY =
  'Goal-backward verdict (3-level check + 3-state output): re-read the `must_haves:` block from Step 2. For each artifact verify three levels in order — (1) EXISTS: file present at declared path, (2) SUBSTANTIVE: real code, not stubs (run the stub scan against just this file), (3) WIRED: at least one other file in the arc imports or invokes the symbol it declares. For each truth, name the exact reproduction command/UI step that demonstrates it. Output exactly one of: `passed` (all must_haves green) → advance to Step 8, `gaps_found: <list of unmet truths/artifacts>` → loop back to Step 5 with the gap list as the scoped sub-problem, `human_needed: <checklist>` → stop and surface the checklist (used only when the truth requires real-world action — sending an email, observing a side effect). No fourth state.'

const CHECKPOINT_FILE =
  'Continue-here checkpoint (hand-off resilience): before declaring this step done, write `.aiko/aiko-code.<session>.continue-here.local.md` with four blocks — `<current_state>` (where the arc is, one paragraph), `<decisions_made>` (each decision + the WHY behind it, so a fresh session does not re-debate them), `<next_action>` (the single literal next move), `<files_in_flight>` (paths touched but not yet committed). Read by Step 1 of the next session if AIKO.md compaction did not fire. Delete it after a successful Step 9 Ship.'

const ATOMIC_COMMIT =
  'Atomic commit per phase (clean rollback points): each completed phase ends with a single `git commit` containing only the files this phase touched, with the message format `{type}({step}-{label}): {one-line outcome}` (e.g. `feat(3-skeleton): wire pairing-store stubs`). Never bundle multiple phases into one commit — the goal is that `git log --oneline` reads as the loop transcript. If the phase produced no code (Survey, Boundaries, Verdict, Audit), commit the journal/teachings updates with the same message format so the trail is unbroken.'

const CONTEXT_THRESHOLDS =
  'Context budget self-check (4-state): at the end of every step, estimate your context usage and act on it — PEAK 0-30% (continue), GOOD 30-50% (continue), DEGRADING 50-70% (CHECKPOINT NOW: write `.aiko/aiko-code.<session>.context-state.local.md` with `last_step:`, `est_pct:`, `completed_this_segment:`, `key_decisions:` (with WHY), `next_action:` — then continue with the file as the working context), POOR 70%+ (you waited too long — checkpoint immediately and consider /clear before next step). The lightweight checkpoint fires before the heavier AIKO.md compaction path; both are local-only writes, no telemetry. Never reach POOR — the cost of an unprompted compaction is 10x the cost of a 50% checkpoint.'

const CODEBASE_CACHE =
  'Codebase cache (read first, populate on miss): before walking the affected scope, check for `.aiko/codebase/` and read whichever files exist — `STRUCTURE.md` (directory layout), `STACK.md` (detected tech + versions), `ARCHITECTURE.md` (components, data flow, patterns), `CONVENTIONS.md` (naming, file patterns), `INTEGRATIONS.md` (external services, APIs). If any are missing or older than 7 days (`stat -f %m <file>` vs `date +%s`), populate them as part of this turn (only the missing/stale ones — do not re-walk what is fresh). On greenfield repos with no `.aiko/codebase/`, run a one-shot scan and create all five before the inventory pass. Step 1 inventory then composes from cache + the affected scope, instead of re-walking the whole repo every arc.'

const READ_ONLY_LINT =
  'Read-only contract (build-phase guard): the `must_haves:` block declared in Step 2 Boundaries is READ-ONLY for build phases (Steps 3 Skeleton, 4 Signals, 5 Edges, 6 Integration). If you find yourself wanting to relax a `truths:` row, narrow an `artifacts:` path, or drop a `key_links:` pair to make the build pass — STOP. That is the worker rewriting the spec to fit the work, not the work to fit the spec. Surface the conflict instead: emit a teachings line `H1 spec-vs-build conflict: <truth/artifact/key_link> cannot be satisfied because <reason>` and let Step 7 Verdict decide gaps_found vs human_needed. Phase 2 owns the contract; build phases honor it. Same rule for `.planning/`-style state files in adjacent projects (PROJECT.md, ROADMAP.md, REQUIREMENTS.md): never edit during build phases.'

export const PHASES: readonly HarnessPhase[] = [
  {
    step: 1,
    label: 'survey',
    title: 'Survey — inventory',
    principle:
      'You cannot solve what you have not enumerated. Read the code, list the surfaces, count the moving parts. No building this step.',
    tactical:
      'Pareto: 80% of your surprises live in 20% of the code. Find that 20% first.',
    problemMap:
      'What files, modules, contracts, and external systems does this task touch? Enumerate them precisely with paths.',
    apply:
      `${CODEBASE_CACHE}\nRead every file in the affected scope. Produce a written inventory: paths, current behavior, dependencies, owners. No edits. No proposals.\n${DEPENDENCY_BOUNDARY_AUDIT}\n${DEEPWIKI_RAG}\n${AGENT_BROWSER_PROBE} (initial-state screenshot of the affected UI surface, even if "working".)\n${TASTE_SKILL_ROUTING}`,
    fibBudget: 1,
    requires: { deepwiki: true, agentBrowser: true },
  },
  {
    step: 2,
    label: 'boundaries',
    title: 'Boundaries — architecture',
    principle:
      'Architecture is the choice of which seams to make hard and which to make soft. Pick the seams before the code.',
    tactical:
      "Conway's law: the system mirrors the team. Defendable seams align with how people already think about the work.",
    problemMap:
      'Which layers, contracts, and ownership boundaries does this work require? What changes shape, what stays stable?',
    apply:
      `Write the architecture sketch: layers, interfaces, data flow, invariants. One short page. No code yet. State in-scope vs. out-of-scope.\n${MUST_HAVES_DECL}\n${PLAN_SELF_VERIFY}\n${DEEPWIKI_RAG} Cross-check seam choices against how upstream/peer projects draw the same line.`,
    fibBudget: 1,
    requires: { deepwiki: true, agentBrowser: false },
  },
  {
    step: 3,
    label: 'skeleton',
    title: 'Skeleton — first artifacts',
    principle:
      'The skeleton is the smallest thing that compiles, runs, and shows the shape. It does not work yet — it stands.',
    tactical:
      'A walking skeleton beats a perfect blueprint. Wire end-to-end before filling in.',
    problemMap:
      'What is the minimum file/function/route set that, once stubbed, lets every later step land cleanly?',
    apply:
      `Write stubs and types, no real logic. Confirm it compiles, the test runner discovers it, the route resolves. Two parallel sub-agents may explore alternative skeletons.\n${READ_ONLY_LINT}\n${DEEPWIKI_RAG} Verify skeleton signatures match upstream API surface exactly (method names, arg order, return shape).`,
    fibBudget: 2,
    requires: { deepwiki: true, agentBrowser: false },
  },
  {
    step: 4,
    label: 'signals',
    title: 'Signals — tests, types, metrics',
    principle:
      'Signals are how the system tells you it is working. Without signals, every claim of correctness is faith.',
    tactical:
      'Three independent signal axes beat one strong one: type-level, test-level, runtime-level.',
    problemMap:
      'What tests, type assertions, and observability does this feature need to be defensible? Three independent axes.',
    apply:
      `Spawn three parallel sub-agents (Agent tool, single message, three tool_use blocks). Each owns one axis: types, tests, metrics. Each writes asserts that will fail until step 5.\n${READ_ONLY_LINT}\n${DEEPWIKI_RAG} Verify assert shapes (test runner API, matcher names, metric field names) against upstream docs.\n${AGENT_BROWSER_PROBE} For runtime signals: capture a baseline metric trace (perf, network timing, eval of state) so step 5/6 have something to compare against.`,
    fibBudget: 3,
    requires: { deepwiki: true, agentBrowser: true },
  },
  {
    step: 5,
    label: 'edges',
    title: 'Edges — adversarial, concurrency, failure',
    principle:
      'The behavior at the edges is the behavior. The happy path is just the loudest edge.',
    tactical:
      'Five adversaries: empty, malformed, concurrent, partial-failure, hostile. Run them in parallel.',
    problemMap:
      'What inputs, conditions, race windows, and partial failures break this? Five adversarial probes. What does the user actually see when it breaks?',
    apply:
      `Spawn five parallel sub-agents. Each probes one adversarial axis (empty, malformed, concurrent, partial-failure, hostile) and reports a failing case or a clean pass.\n${READ_ONLY_LINT}\n${CONTEXT_THRESHOLDS}\n${FIX_NOT_DOCUMENT}\n${DEEPWIKI_RAG} Look up known edge-case bugs / CVEs / issues filed upstream against the libraries you depend on.\n${AGENT_BROWSER_PROBE} UX empathy pass: hover states that break layout, click targets too small, mobile overflow, contrast failures, keyboard-only nav, screen-reader labels. Attach screenshots of every broken state. If the user described a bug visually, reason from their description/screenshot first.\n${TASTE_SKILL_ROUTING}`,
    fibBudget: 5,
    requires: { deepwiki: true, agentBrowser: true },
  },
  {
    step: 6,
    label: 'integration',
    title: 'Integration — end-to-end flows',
    principle:
      'Integration is where the lies in your unit tests come due. The whole must do what the parts only claimed to.',
    tactical:
      'Eight integration paths: cold-start, warm-start, upgrade, rollback, multi-tenant, idle, peak, recovery.',
    problemMap:
      'Which end-to-end flows must work? Which user journeys, deploy paths, lifecycle transitions?',
    apply:
      `Spawn eight parallel sub-agents. Each runs one end-to-end path against the integrated artifact and reports pass/fail with evidence. Aggregate.\n${READ_ONLY_LINT}\n${CONTEXT_THRESHOLDS}\n${API_REALITY_CHECK}\n${DEEPWIKI_RAG} Verify integration contracts (auth, session, multi-tenant isolation) match upstream guidance.\n${AGENT_BROWSER_PROBE} Walk each user journey end-to-end in the real browser/Electron app: navigate → interact → screenshot → check console + network. Tail the main-process stdout/stderr in parallel for Electron. This is the e2e empathy gate.\n${HUMAN_PREVIEW}\n${TASTE_SKILL_ROUTING}`,
    fibBudget: 8,
    requires: { deepwiki: true, agentBrowser: true },
  },
  {
    step: 7,
    label: 'verdict',
    title: 'Verdict — promote, hold, or reject',
    principle:
      'A verdict is single-threaded by design. Pluralism is for building; judgement is a single voice.',
    tactical:
      'Three options, no fourth: promote, hold, reject. Naming the verdict forces honesty about built vs. promised.',
    problemMap:
      'Given steps 1–6, does this artifact deserve to advance to audit? Promote, hold, or reject — pick one.',
    apply:
      `Single-threaded. Render the verdict (PROMOTE / HOLD / REJECT) with specific evidence from steps 4–6. If HOLD or REJECT, name the exact gap and loop back. If PROMOTE, advance to step 8.\n${GOAL_BACKWARD_VERIFY}\n${DEEPWIKI_RAG} If verdict cites a library behavior claim, back it with a DeepWiki citation, not vibes.`,
    fibBudget: 1,
    requires: { deepwiki: true, agentBrowser: false },
  },
  {
    step: 8,
    label: 'audit',
    title: 'Audit — adversarial cold review',
    principle:
      'The builder cannot audit their own work. The audit is what someone with no investment would say after reading it cold.',
    tactical:
      'Thirteen auditors, each reading one slice with no builder bias. Anything that survives all thirteen is real.',
    problemMap:
      'Which slices need cold review? API contract, data model, error paths, perf, security, observability, docs, types, tests, deps, build, deploy, rollback. Also: does the UI match what the user expected to see?',
    apply:
      `Spawn thirteen parallel sub-agents. Each audits one slice cold (no builder bias). Aggregate findings. Anything that cannot survive audit loops back before step 9.\n${CONTEXT_THRESHOLDS}\n${STUB_SCAN}\n${CHECKPOINT_FILE}\n${DEEPWIKI_RAG} Cross-check every API claim, data-model invariant, and dep version against upstream wikis.\n${AGENT_BROWSER_PROBE} Run the available taste/critique skill alongside an agent-browser visual pass — render the actual page and screenshot to catch rendering issues code review misses (overlapping elements, missing images, broken CSS, wrong font sizes, z-index, mobile overflow).\n${TASTE_SKILL_ROUTING}`,
    fibBudget: 13,
    requires: { deepwiki: true, agentBrowser: true },
  },
  {
    step: 9,
    label: 'ship',
    title: 'Ship — publish, tag, hand off',
    principle:
      'Shipped means reachable by the user it was built for. Anything less is half-built.',
    tactical:
      'Up to twenty-one publishers in parallel: commit, tag, changelog, docs, README, hand-off, notification, monitoring, on-call, rollback plan, etc.',
    problemMap:
      'What needs to happen for the intended user to actually use this? List every artifact that must move.',
    apply:
      `Spawn the publish fan-out (up to 21 parallel sub-agents). When the artifact is genuinely reachable by its user, output exactly: <promise>{COMPLETION_PROMISE}</promise>\n${ATOMIC_COMMIT}\n${DEEPWIKI_RAG} Verify release/publish steps (npm tag conventions, changelog format, doc URL anchors) against upstream norms.\n${AGENT_BROWSER_PROBE} Post-ship smoke: hit the deployed URL/built artifact in agent-browser and screenshot reachable success state.`,
    fibBudget: 21,
    requires: { deepwiki: true, agentBrowser: true },
  },
] as const

export type HarnessModeName = 'quick' | 'standard' | 'deep'

/**
 * Steps included in each mode. `standard` is the canonical 1..9.
 * `quick` runs survey → edges → ship for one-shot fixes (3 turns vs 9).
 * `deep` runs the full 9 with multiplied fibBudgets on adversarial steps.
 */
const MODE_STEPS: Record<HarnessModeName, readonly number[]> = {
  quick: [1, 5, 9],
  standard: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  deep: [1, 2, 3, 4, 5, 6, 7, 8, 9],
}

/**
 * Compute the next step number for a session given the current step and the
 * mode. Returns -1 to indicate the loop has reached the end and should close.
 * The mode's step list is the source of truth for ordering; `currentStep === 0`
 * means "before step 1", so we return the first step of the mode.
 */
export function nextStepForMode(
  currentStep: number,
  mode: HarnessModeName,
): number {
  const steps = MODE_STEPS[mode]
  if (currentStep === 0) return steps[0] ?? -1
  const idx = steps.indexOf(currentStep)
  if (idx < 0) {
    // Current step isn't in the mode list (shouldn't happen, but tolerate it
    // by returning the first step >= currentStep, or -1 if none).
    for (const s of steps) if (s > currentStep) return s
    return -1
  }
  return steps[idx + 1] ?? -1
}

/** Index of the current step within the mode's list (1-based for display). */
export function stepPositionInMode(
  step: number,
  mode: HarnessModeName,
): { position: number; total: number } {
  const steps = MODE_STEPS[mode]
  const idx = steps.indexOf(step)
  return { position: idx >= 0 ? idx + 1 : 0, total: steps.length }
}

/**
 * Apply mode-specific fibBudget multipliers. `deep` mode escalates the
 * adversarial steps (5 edges, 8 audit, 9 ship) by 1.5x rounded up. `quick`
 * mode keeps fibBudgets as-is — already minimal. `standard` no-op.
 */
export function fibBudgetForMode(
  step: number,
  base: number,
  mode: HarnessModeName,
): number {
  if (mode !== 'deep') return base
  if (step === 5 || step === 8 || step === 9) return Math.ceil(base * 1.5)
  return base
}
