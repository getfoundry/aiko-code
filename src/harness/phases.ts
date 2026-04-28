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
  'RAG context via DeepWiki: call mcp__deepwiki__read_wiki_structure then mcp__deepwiki__ask_question against the upstream repo(s) this step touches (library, framework, npm package, internal repo on GitHub). Quote a cited file:line back into your teachings line as `dw:<owner/repo#topic>`. Never rely on training-data memory — your knowledge of the world is stale.'

const AGENT_BROWSER_PROBE =
  'Empathy probe via agent-browser: `npx agent-browser` (Electron host: launch with `--remote-debugging-port=9222` then `connect http://localhost:9222`). Walk the actual UI as a user would — screenshot, console, network, eval. Capture evidence as `ab:<screenshot-path|console-error|network-failure|eval-result>`.'

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
      `Read every file in the affected scope. Produce a written inventory: paths, current behavior, dependencies, owners. No edits. No proposals.\n${DEEPWIKI_RAG}\n${AGENT_BROWSER_PROBE} (initial-state screenshot of the affected UI surface, even if "working".)`,
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
      `Write the architecture sketch: layers, interfaces, data flow, invariants. One short page. No code yet. State in-scope vs. out-of-scope.\n${DEEPWIKI_RAG} Cross-check seam choices against how upstream/peer projects draw the same line.`,
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
      `Write stubs and types, no real logic. Confirm it compiles, the test runner discovers it, the route resolves. Two parallel sub-agents may explore alternative skeletons.\n${DEEPWIKI_RAG} Verify skeleton signatures match upstream API surface exactly (method names, arg order, return shape).`,
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
      `Spawn three parallel sub-agents (Agent tool, single message, three tool_use blocks). Each owns one axis: types, tests, metrics. Each writes asserts that will fail until step 5.\n${DEEPWIKI_RAG} Verify assert shapes (test runner API, matcher names, metric field names) against upstream docs.\n${AGENT_BROWSER_PROBE} For runtime signals: capture a baseline metric trace (perf, network timing, eval of state) so step 5/6 have something to compare against.`,
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
      'What inputs, conditions, race windows, and partial failures break this? Five adversarial probes.',
    apply:
      `Spawn five parallel sub-agents. Each probes one adversarial axis (empty, malformed, concurrent, partial-failure, hostile) and reports a failing case or a clean pass. Fix or document each.\n${DEEPWIKI_RAG} Look up known edge-case bugs / CVEs / issues filed upstream against the libraries you depend on.\n${AGENT_BROWSER_PROBE} UX empathy pass: hover states that break layout, click targets too small, mobile overflow, contrast failures, keyboard-only nav, screen-reader labels. Attach screenshots of every broken state.`,
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
      `Spawn eight parallel sub-agents. Each runs one end-to-end path against the integrated artifact and reports pass/fail with evidence. Aggregate.\n${DEEPWIKI_RAG} Verify integration contracts (auth, session, multi-tenant isolation) match upstream guidance.\n${AGENT_BROWSER_PROBE} Walk each user journey end-to-end in the real browser/Electron app: navigate → interact → screenshot → check console + network. Tail the main-process stdout/stderr in parallel for Electron. This is the e2e empathy gate.`,
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
      `Single-threaded. Render the verdict (PROMOTE / HOLD / REJECT) with specific evidence from steps 4–6. If HOLD or REJECT, name the exact gap and loop back. If PROMOTE, advance to step 8.\n${DEEPWIKI_RAG} If verdict cites a library behavior claim, back it with a DeepWiki citation, not vibes.`,
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
      'Which slices need cold review? API contract, data model, error paths, perf, security, observability, docs, types, tests, deps, build, deploy, rollback.',
    apply:
      `Spawn thirteen parallel sub-agents. Each audits one slice cold (no builder bias). Aggregate findings. Anything that cannot survive audit loops back before step 9.\n${DEEPWIKI_RAG} Cross-check every API claim, data-model invariant, and dep version against upstream wikis.\n${AGENT_BROWSER_PROBE} Run /critique skill alongside an agent-browser visual pass — render the actual page and screenshot to catch rendering issues code review misses (overlapping elements, missing images, broken CSS, wrong font sizes, z-index, mobile overflow).`,
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
      `Spawn the publish fan-out (up to 21 parallel sub-agents). When the artifact is genuinely reachable by its user, output exactly: <promise>{COMPLETION_PROMISE}</promise>\n${DEEPWIKI_RAG} Verify release/publish steps (npm tag conventions, changelog format, doc URL anchors) against upstream norms.\n${AGENT_BROWSER_PROBE} Post-ship smoke: hit the deployed URL/built artifact in agent-browser and screenshot reachable success state.`,
    fibBudget: 21,
    requires: { deepwiki: true, agentBrowser: true },
  },
] as const
