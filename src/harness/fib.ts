/**
 * Fractal harness — auto-engages a scoped recursion when a step gets stuck.
 *
 * Native TS replacement for break-harness.sh + fib-harness (which were bash
 * + Python and depended on the bundled plugin tree). The mechanism: when
 * the no-op gate fires twice in a row on the same step, the parent loop
 * calls engageFibHarness() instead of closing. That writes harness_ws into
 * the state file, switching the parent into "Repair" mode — it pins the
 * current step and injects a fan-out directive that tells the model to
 * scope the stuck sub-problem and drive 5+ parallel sub-agents at it.
 *
 * Auto-resolve: while harness_ws is set, the regular teachings-line gate
 * still runs. When it eventually passes (the model produces evidence the
 * gate accepts), harness_ws is cleared and the parent advances to step N+1
 * normally. No manual sed editing required.
 *
 * The 20-agent dimensions/judge/verdict ceremony from the bash fib-harness
 * is intentionally NOT ported — that was overkill for inline auto-escalation.
 * The Repair directive in loop.ts buildDirective drives the same fan-out
 * shape (5-8 parallel adversarial sub-agents) without the workspace JSON
 * ceremony.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { HarnessState } from './state.js'

/**
 * Engage fractal repair mode for a stuck step. Creates a marker directory
 * under `.aiko/fib-<session>-step<N>-<timestamp>/` and returns its path —
 * suitable for writing into `state.harnessWs`. The marker is informational;
 * the parent loop only checks whether `state.harnessWs` is non-empty.
 *
 * Best-effort: directory creation failure does NOT throw — fractal mode is
 * still engaged via the returned path string, which the next state write
 * will record. This way auto-escalation never fails because of fs issues.
 */
export function engageFibHarness(
  cwd: string,
  session: string,
  step: number,
  scope: string,
): string {
  const stateDir = resolve(cwd, '.aiko')
  const ts = Date.now()
  const wsName = `fib-${session}-step${step}-${ts}`
  const wsPath = join(stateDir, wsName)
  try {
    if (!existsSync(wsPath)) mkdirSync(wsPath, { recursive: true })
    writeFileSync(
      join(wsPath, 'scope.txt'),
      `step: ${step}\nsession: ${session}\nscope: ${scope}\nstarted_at: ${new Date().toISOString()}\n`,
      'utf8',
    )
  } catch {
    /* best-effort — the workspace path is the source of truth, files are decoration */
  }
  return wsPath
}

/**
 * Clear fractal mode — used when the gate passes while harnessWs is set.
 * Returns a new state with harnessWs nulled and noOpCount reset.
 */
export function clearFibHarness(state: HarnessState): HarnessState {
  return { ...state, harnessWs: null, noOpCount: 0 }
}

/**
 * Build the Repair directive's `apply` text — the concrete fan-out
 * instructions for the model when it's in fractal mode. Replaces the
 * earlier reference to break-harness.sh + fib-harness scripts.
 *
 * Strategy: scope down the stuck sub-problem, fan out 5 adversarial
 * sub-agents at it (mirroring step 5 edges), aggregate, fix root cause,
 * then produce the original step's teachings-line evidence so the parent's
 * gate releases the pin.
 */
export function buildFibRepairApplyText(
  step: number,
  session: string,
  workspace: string,
): string {
  return [
    `Fractal repair engaged for step ${step}. Workspace marker: ${workspace}`,
    '',
    'You are stuck on this step (the no-op gate fired twice). Instead of',
    'banging on the same approach a third time, recurse: treat the unfinished',
    'sub-problem as its own scoped task and drive 5 parallel sub-agents at it,',
    'mirroring the step-5 adversarial fan-out.',
    '',
    'Procedure:',
    `  1. Write a one-paragraph scope to ${workspace}/scope.txt (already`,
    '     stubbed). Name the EXACT sub-problem blocking the original step.',
    '     Examples: "the gate keeps rejecting ab: because no agent-browser',
    '     evidence is captured", "the step-3 skeleton fails to compile because',
    '     a generic constraint is wrong", "the LSP query returns empty for',
    '     pattern X".',
    '  2. Spawn 5 parallel sub-agents via the Agent tool (single message,',
    '     5 tool_use blocks, subagent_type: general-purpose). Each takes one',
    '     adversarial angle on the scoped sub-problem:',
    '       - empty input / boundary case',
    '       - malformed input / wrong type',
    '       - concurrent / race condition',
    '       - partial failure / network-out / file-missing',
    '       - hostile input / injection / size overflow',
    '  3. Aggregate findings. Apply the root-cause fix on this turn (no',
    '     "deferred" — the fix-not-document rule still applies in repair).',
    `  4. Produce the original step ${step}\'s teachings-line in the schema`,
    '     the parent gate expects (env: dw: ab: H1 lesson). When the gate',
    `     accepts it, harness_ws clears automatically and step ${step + 1}`,
    '     fires on the next turn.',
    '',
    'Do NOT manually edit the state file. Do NOT call break-harness.sh',
    '(deprecated). The repair completes when your work satisfies the parent',
    'gate — same shape evidence, just produced after a scoped recursion.',
    '',
    `Session: ${session}.  /steer can re-aim the north star at any time.`,
  ].join('\n')
}
