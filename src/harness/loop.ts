/**
 * 9-step harness loop — Stop-hook callback that advances the active session
 * one step per assistant turn and injects step N's playbook as the resume
 * directive. Native TS replacement for core/loop.sh.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { detectDevCommand } from '../utils/devCommand.js'
import {
  describeProbeForDirective,
  probeOrStartDevServer,
  type DevServerProbeResult,
} from '../utils/devServerProbe.js'
import { dirname, resolve } from 'node:path'

import {
  buildFibRepairApplyText,
  clearFibHarness,
  engageFibHarness,
} from './fib.js'
import type { HarnessPhase } from './phases.js'
import {
  fibBudgetForMode,
  nextStepForMode,
  PHASES,
  stepPositionInMode,
} from './phases.js'
import {
  type HarnessState,
  pickActiveSession,
  readState,
  stateFilePath,
  teachingsFilePath,
  writeState,
} from './state.js'

const STATE_DIR = '.aiko'

export type StopHookOutput = {
  decision?: 'block'
  reason?: string
  systemMessage?: string
}

export type StopHookInput = {
  transcript_path?: string
}

/**
 * Stop-hook callback. Returns `{}` (no-op) when there's no active session;
 * returns `{ decision: 'block', reason, systemMessage }` to inject the next
 * step's playbook (the host treats `reason` as the resume prompt to feed
 * back to the model — same contract as bash core/loop.sh's
 * `{decision: "block", reason: $prompt, systemMessage: $msg}` output);
 * returns `{ systemMessage }` and clears the state file when the
 * completion promise lands.
 */
export async function advanceHarness(
  input: StopHookInput,
  cwd: string = process.cwd(),
): Promise<StopHookOutput> {
  const stateDir = resolve(cwd, STATE_DIR)
  const path = pickActiveSession(stateDir)
  if (!path) return {}

  const state = readState(path)
  if (!state) return {}

  // Detect completion promise in last assistant text.
  const lastAssistant = lastAssistantText(input.transcript_path)
  if (lastAssistant) {
    const m = /<promise>([\s\S]*?)<\/promise>/.exec(lastAssistant)
    if (m) {
      const phrase = m[1]!.replace(/\s+/g, ' ').trim()
      if (phrase === state.completionPromise) {
        try {
          unlinkSync(path)
        } catch {
          /* ignore */
        }
        return {
          systemMessage: `◆ [${state.session}] promise fulfilled. Closing.`,
        }
      }
    }
  }

  // If a fib-harness break is in flight, hold the step until it lands.
  let nextStep: number
  let onHarness: boolean
  if (state.harnessWs) {
    nextStep = state.step
    onHarness = true
  } else {
    const advance = nextStepForMode(state.step, state.mode)
    if (advance < 0) {
      // No more steps in this mode's list; the loop has exhausted without
      // emitting <promise>. Close out cleanly instead of re-injecting forever.
      try {
        unlinkSync(path)
      } catch {
        /* ignore */
      }
      return {
        systemMessage: `◆ [${state.session}] mode=${state.mode} reached final step without <promise>${state.completionPromise}</promise>. Loop closed. Run /guide again to restart.`,
      }
    }
    nextStep = advance
    onHarness = false
  }

  const teachingsPath = teachingsFilePath(stateDir, state.session)

  // Work-product validation: the previous step's directive instructed the
  //   `[step N / <title>] <H1 lesson> env:<ctx> dw:<ref> ab:<evidence>`
  // to the teachings file. The gate checks for both the step marker AND the
  // required evidence tags (env always; dw always; ab when the phase requires
  // it).
  //
  // Escalation ladder:
  //   attempt 1: re-inject the same step with a no-op warning.
  //   attempt 2: engage fractal repair (engageFibHarness) — pin the step,
  //              switch the directive into Repair mode, and reset noOpCount
  //              so the recursion has fresh attempts. The model fans out
  //              5 parallel sub-agents at the scoped sub-problem.
  //   attempt 3 (post-fib): close the session — fractal repair couldn't
  //              produce evidence either.
  //
  // When the gate PASSES while harnessWs is set, clear harnessWs (auto-resolve
  // fractal mode) and advance normally.
  if (state.step >= 1) {
    const prevPhase = PHASES.find(p => p.step === state.step)
    const teachingsContent = existsSync(teachingsPath)
      ? readFileSync(teachingsPath, 'utf8')
      : ''
    const stepLine = findStepLine(teachingsContent, state.step)
    const freshness = countFreshToolUses(input.transcript_path)
    const missing = stepLine
      ? evidenceMissing(stepLine, prevPhase, freshness)
      : [{ tag: 'teachings-line', reason: 'not-found', guidance: 'Add a teachings line in the format: - [step N / Phase — description] Your finding. env:... ab:... dw:... at the end of the line.' }]

    if (missing.length === 0) {
      // Gate passed. If we were in fractal repair, exit it now and advance.
      if (onHarness) {
        const cleared = clearFibHarness(state)
        writeState(path, cleared)
        // Re-derive nextStep using the cleared state's mode.
        const advance = nextStepForMode(state.step, state.mode)
        if (advance < 0) {
          try { unlinkSync(path) } catch { /* ignore */ }
          return {
            systemMessage: `◆ [${state.session}] fractal repair resolved on final step. Closing.`,
          }
        }
        nextStep = advance
        onHarness = false
      } else if ((state.noOpCount ?? 0) > 0) {
        writeState(path, { ...state, noOpCount: 0 })
      }
    } else if (!onHarness) {
      // Gate failed and not yet in fractal mode — escalate with guidance.
      const newCount = (state.noOpCount ?? 0) + 1
      if (newCount === 1) {
        // Attempt 1: re-inject with no-op warning + helpful guidance.
        writeState(path, { ...state, noOpCount: newCount })
        nextStep = state.step
        const directive = buildDirective({
          state, nextStep, onHarness, cwd, teachingsPath,
        })
        const missingNames = missing.map(m => m.tag).join(', ')
        const guidanceBlock =
          missing.length > 0
            ? '\n\nHint:\n' +
              missing.map(m => `  • ${m.tag}: ${m.guidance}`).join('\n\n')
            : ''
        const warning = `<no-op-warning priority="absolute">\nYour last turn did not satisfy the work-product gate for step ${state.step}. Missing: ${missingNames}. Re-do step ${state.step}: produce the artifact AND append the schema'd teachings-line. Attempt ${newCount}/2 before fractal repair engages, then 3/3 closes the session.${guidanceBlock}\n</no-op-warning>\n\n`
        return {
          decision: 'block',
          reason: warning + directive,
          systemMessage: `◆ [${state.session}] step ${state.step} no-op (${newCount}/2) — re-injecting.`,
        }
      }
      // Attempt 2: engage fractal repair. Pin the step, set harnessWs,
      // reset noOpCount so the recursion has fresh attempts.
      const missingNames = missing.map(m => m.tag).join(', ')
      const ws = engageFibHarness(
        cwd,
        state.session,
        state.step,
        `step ${state.step} stuck — missing: ${missingNames}`,
      )
      const fibState: HarnessState = {
        ...state, harnessWs: ws, noOpCount: 0,
      }
      writeState(path, fibState)
      nextStep = state.step
      onHarness = true
      const directive = buildDirective({
        state: fibState, nextStep, onHarness, cwd, teachingsPath,
      })
      const banner = `<fractal-repair priority="absolute">\nFractal harness engaged for step ${state.step} — the no-op gate fired twice. Recursion is the response, not closure. Workspace: ${ws}. The step pin remains until you produce the gate-accepted teachings-line for step ${state.step}.\n</fractal-repair>\n\n`
      return {
        decision: 'block',
        reason: banner + directive,
        systemMessage: `◆ [${state.session}] step ${state.step} → fractal repair (workspace: ${ws}).`,
      }
    } else {
      // Already in fractal mode and gate still failing — count fractal attempts.
      const newCount = (state.noOpCount ?? 0) + 1
      if (newCount >= 3) {
        try { unlinkSync(path) } catch { /* ignore */ }
        return {
          systemMessage: `◆ [${state.session}] fractal repair on step ${state.step} produced no work-product across ${newCount} turns. Loop closed. Run /guide again with a clearer scope.`,
        }
      }
      writeState(path, { ...state, noOpCount: newCount })
      nextStep = state.step
      const directive = buildDirective({
        state, nextStep, onHarness, cwd, teachingsPath,
      })
      const fractalMissingNames = missing.map(m => m.tag).join(', ')
      const banner = `<fractal-repair-warning priority="absolute">\nFractal repair attempt ${newCount}/3 still missing: ${fractalMissingNames}. Tighten the scope further OR escalate the fix to root cause. Closure at 3/3.\n</fractal-repair-warning>\n\n`
      return {
        decision: 'block',
        reason: banner + directive,
        systemMessage: `◆ [${state.session}] fractal repair ${newCount}/3 — still missing: ${fractalMissingNames}.`,
      }
    }
  }

  // Note: the in-process boundary audit prelude was removed — it ran on every
  // step 1 entry and could stall the stop hook because TS-AST file walking
  // is synchronous inside an async function (Promise.race timeout returned
  // but the work continued blocking the event loop). The /audit-boundaries
  // skill remains user-invocable, and step 1's DEPENDENCY_BOUNDARY_AUDIT
  // directive instructs the model to call it from the model side where MCP
  // tools and async cancellation work properly.

  let probeResult: DevServerProbeResult | undefined
  const upcomingPhase = onHarness
    ? undefined
    : PHASES.find(p => p.step === nextStep)
  if (upcomingPhase?.requires.agentBrowser) {
    try {
      probeResult = await probeOrStartDevServer({ cwd })
    } catch {
      /* probe must never crash the harness */
    }
  }

  const directive = buildDirective({
    state,
    nextStep,
    onHarness,
    cwd,
    teachingsPath,
    probeResult,
  })

  // Persist step advance for non-harness phases.
  if (!onHarness && nextStep !== state.step) {
    writeState(path, { ...state, step: nextStep, noOpCount: 0 })
  }

  const sysMsg = buildSystemMessage(state, nextStep, onHarness)
  return {
    decision: 'block',
    reason: directive,
    systemMessage: sysMsg,
  }
}

/**
 * Find the line in teachings content that starts with `[step N `.
 * Returns the full line (trimmed) or null.
 */
function findStepLine(content: string, step: number): string | null {
  const marker = `[step ${step} `
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line.includes(marker)) return line
  }
  return null
}

export type FreshTurnEvidence = {
  deepwiki: number
  agentBrowser: number
  zigast: number
}

/**
 * Walk the transcript bottom-up until the most recent user-role message and
 * count tool_use blocks emitted on the current turn. Used by the gate to
 * reject "stale citation" patterns where the model writes `dw:owner/repo`
 * without actually running a DeepWiki query this turn (recycling old cache
 * entries to satisfy the form-only check).
 *
 * "This turn" definition: every assistant message AFTER the most-recent
 * user-role message in the transcript. A turn ends when the next user
 * message arrives (or, here, when the stop hook fires).
 */
export function countFreshToolUses(
  transcriptPath: string | undefined,
): FreshTurnEvidence | undefined {
  if (!transcriptPath || !existsSync(transcriptPath)) return undefined
  let raw: string
  try {
    raw = readFileSync(transcriptPath, 'utf8')
  } catch {
    return undefined
  }
  const lines = raw.split('\n').filter(Boolean)
  const counts: FreshTurnEvidence = { deepwiki: 0, agentBrowser: 0, zigast: 0 }
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj: { message?: { role?: string; content?: unknown } }
    try { obj = JSON.parse(lines[i]!) as typeof obj } catch { continue }
    const role = obj.message?.role
    if (role === 'user') break
    if (role !== 'assistant') continue
    const content = obj.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as {
        type?: string
        name?: string
        input?: { command?: string; file_path?: string; path?: string; file?: string }
      }
      if (b?.type !== 'tool_use') continue
      const name = b.name ?? ''
      if (name === 'mcp__deepwiki__ask_question' || /deepwiki/i.test(name)) {
        counts.deepwiki++
        continue
      }
      // Cache-first protocol (phases.ts DEEPWIKI_RAG): reading or grepping
      // .aiko/dw-cache.local.md counts as fresh DeepWiki evidence — the cache
      // is the prescribed reuse path, not a stale fallback.
      if (name === 'Read' || name === 'mcp__muonry__read') {
        const p = b.input?.file_path ?? b.input?.path ?? b.input?.file ?? ''
        if (/\.aiko\/dw-cache\.local\.md$/.test(p)) counts.deepwiki++
      }
      if (name === 'Grep' || name === 'mcp__muonry__search') {
        const p = b.input?.path ?? b.input?.file_path ?? ''
        if (/\.aiko\/dw-cache\.local\.md$/.test(p)) counts.deepwiki++
      }
      if (name === 'Bash') {
        const cmd = b.input?.command ?? ''
        if (/\.aiko\/dw-cache\.local\.md/.test(cmd)) counts.deepwiki++
        if (/\bagent-browser\b/.test(cmd)) counts.agentBrowser++
        if (/\bzigast\b/.test(cmd)) counts.zigast++
      }
    }
  }
  return counts
}

/**
 * Check the teachings line for the required evidence tags. Returns a list of
 * { tag, reason, guidance } objects where guidance is a human-readable tip
 * explaining WHY the tag is needed and HOW to fix it. Returns empty array
 * when everything passes.
 *
 * `env:` and `dw:` are always required. `ab:` is required when the phase
 * requires.agentBrowser. A tag value of `skip:<reason>` is accepted when the
 * reason is non-trivial (>=20 chars). When freshness counts are provided,
 * citations that AREN'T `skip:` must correspond to an actual tool call this
 * turn — otherwise flagged as stale.
 */
function evidenceMissing(
  line: string,
  phase: HarnessPhase | undefined,
  _freshness?: FreshTurnEvidence,
): Array<{ tag: string; reason: string; guidance: string }> {
  // Loosened gate: every tag is optional. When present, each is shape-checked
  // so malformed citations still surface. The teachings line itself is still
  // required (the upstream caller flags missing step lines), but the worker
  // chooses which tags are useful for this turn — a doc-only edit doesn't
  // need dw:, a CLI fix doesn't need ab:, a stable-env fix doesn't need env:.
  // Phase prompts still inject DEEPWIKI_RAG / AGENT_BROWSER_PROBE constants
  // as nudges, not blockers.
  void phase
  const missing: Array<{ tag: string; reason: string; guidance: string }> = []
  const checks: Array<{
    tag: string
    shape?: (value: string) => string | null
    guidance: string
  }> = [
    {
      tag: 'env:',
      shape: shapeEnv,
      guidance:
        'env: describes the runtime environment (OS, version, key tool versions). ' +
        'Optional. When you do cite, format: env:macOS 25.0.0, Bun 1.3.1, aiko-code v0.10.5',
    },
    {
      tag: 'dw:',
      shape: shapeDeepWiki,
      guidance:
        'dw: cites a public GitHub repo via DeepWiki. Optional. ' +
        'When you do cite, format: dw:owner/repo#topic',
    },
    {
      tag: 'ab:',
      shape: shapeAgentBrowser,
      guidance:
        'ab: records an agent-browser artifact for UI work. Optional for non-UI turns. ' +
        'When you do cite, point at a screenshot/console/network/eval result.',
    },
    {
      tag: 'unb:',
      shape: shapeUnbrowse,
      guidance:
        'unb: records an Unbrowse MCP artifact (unbrowse-ai/unbrowse-dev). Optional. ' +
        'When you do cite, format: unb:<resource-or-action>#<detail>, e.g. unb:resolve#example.com or unb:execute#flow-id',
    },
  ]
  for (const { tag, shape, guidance } of checks) {
    const value = extractTag(line, tag)
    if (value === null) continue
    if (value.startsWith('skip:')) {
      if (value.slice(5).trim().length < 20) {
        missing.push({
          tag: tag.replace(':', ''),
          reason: 'skip-reason-too-short',
          guidance: `${guidance} Your skip reason (${value.slice(5).trim().length} chars) needs 20+ chars.`,
        })
      }
      continue
    }
    if (shape) {
      const reason = shape(value)
      if (reason) {
        missing.push({ tag: tag.replace(':', ''), reason, guidance })
      }
    }
  }
  return missing
}

/**
 * `unb:` value must look like a real Unbrowse MCP artifact. Require >=4 chars
 * and reject single-word placeholders.
 */
function shapeUnbrowse(value: string): string | null {
  if (value.length < 4) return 'too-short'
  if (/^(yes|no|ok|done)$/i.test(value)) return 'placeholder-only'
  return null
}

/**
 * `env:` value must look like a real environment description, not a single
 * label. Require at least 12 chars after the prefix and reject single-word
 * placeholders.
 */
function shapeEnv(value: string): string | null {
  if (value.length < 12) return 'too-short'
  if (/^(prod|dev|staging|local|test|ci)$/i.test(value)) return 'label-only'
  return null
}

/**
 * `dw:` value must look like a real DeepWiki citation. Canonical form is
 * `owner/repo` or `owner/repo#topic` — reject values without a `/`, which
 * indicates a vague library name rather than a queried repo.
 */
function shapeDeepWiki(value: string): string | null {
  if (!value.includes('/')) return 'missing-owner/repo-form'
  if (value.length < 5) return 'too-short'
  return null
}

/**
 * `ab:` value must look like a real agent-browser artifact, not a build-tool
 * substitute. Reject build-tool tokens (bun, npm, next, etc.) and require a
 * marker that proves a runtime browser probe actually ran.
 */
function shapeAgentBrowser(value: string): string | null {
  const lower = value.toLowerCase()
  const buildTokens = [
    'bun',
    'npm',
    'npx',
    'pnpm',
    'yarn',
    'node',
    'next',
    'vite',
    'webpack',
    'tsc',
    'vitest',
    'jest',
    'eslint',
    'prettier',
    'tsx',
    'esbuild',
    'rollup',
  ]
  // npx is allowed only when followed by agent-browser
  if (lower === 'npx' || lower.startsWith('npx')) {
    if (!lower.includes('agent-browser')) return 'build-log-not-agent-browser'
  } else if (buildTokens.includes(lower)) {
    return 'build-log-not-agent-browser'
  }
  const runtimeMarkers = [
    'screenshot',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    'console:',
    'network:',
    'eval:',
    'agent-browser',
    'cdp',
    'localhost:',
    '127.0.0.1',
    ':9222',
    'devtools',
    'puppeteer',
    'playwright',
    'chrome:',
  ]
  const hasMarker = runtimeMarkers.some(m => lower.includes(m))
  if (!hasMarker) return 'no-runtime-artifact-marker'
  return null
}

/**
 * Extract a tag value from a teachings line. The tag is matched as
 * whitespace-or-start, then the tag, then a value that runs until the next
 * sibling tag (` env:`, ` dw:`, ` ab:`) or end-of-line. We need to capture
 * multi-word values like "env:macOS Sequoia 25.0.0, Node v25.6.1, ...";
 * a `\\S+` capture would only grab the first whitespace-free token and break
 * the length-floor checks downstream.
 */
const SIBLING_TAGS = ['env:', 'dw:', 'ab:'] as const

/**
 * Extract a tag value from a teachings line. Uses indexOf to find the LAST
 * occurrence of the tag — this avoids mid-text false matches where the tag
 * name appears as part of prose (e.g., "mentions of dw: slash ab:" in a
 * teaching summary). The last occurrence is the one the author intended.
 */
function extractTag(line: string, tag: string): string | null {
  const tagged = tag
  const tagLen = tagged.length

  // Find ALL positions of this exact tag in the line
  const positions: number[] = []
  let pos = 0
  while (true) {
    const idx = line.indexOf(tagged, pos)
    if (idx === -1) break
    // Verify the char before is start-of-string or whitespace (avoid partial match)
    if (idx === 0 || /\s/.test(line[idx - 1])) {
      positions.push(idx)
    }
    pos = idx + tagLen
  }

  if (positions.length === 0) return null
  // Use the LAST occurrence (intended tag), not the first (potential noise)
  const startIdx = positions[positions.length - 1] + tagLen

  let endIdx = line.length
  for (const sib of SIBLING_TAGS) {
    if (sib === tag) continue
    const sibRe = new RegExp(`\\s${sib.replace(':', '\\:')}`)
    const sibMatch = sibRe.exec(line.slice(startIdx))
    if (sibMatch) {
      const candidate = startIdx + sibMatch.index
      if (candidate < endIdx) endIdx = candidate
    }
  }
  return line.slice(startIdx, endIdx).trim() || null
}

type DirectiveArgs = {
  state: HarnessState
  nextStep: number
  onHarness: boolean
  cwd: string
  teachingsPath: string
  probeResult?: DevServerProbeResult
}

function buildDirective({
  state,
  nextStep,
  onHarness,
  cwd,
  teachingsPath,
  probeResult,
}: DirectiveArgs): string {
  let phase: HarnessPhase
  if (onHarness) {
    phase = {
      step: state.step,
      label: 'repair',
      title: 'Fractal Repair (recursion engaged)',
      principle:
        'Repair is fractal. Each stuck step earns its own scoped recursion — fan out adversarially at the sub-problem, fix the root, then satisfy the parent gate.',
      tactical:
        'Five parallel adversarial sub-agents on the scoped sub-problem. Aggregate. Fix root cause. Produce the original step\'s teachings-line evidence — the parent gate releases the pin automatically when it accepts.',
      problemMap: `Step ${state.step} is stuck. Fractal workspace: ${state.harnessWs ?? 'unknown'}.`,
      apply: buildFibRepairApplyText(
        state.step,
        state.session,
        state.harnessWs ?? '<unknown>',
      ),
      fibBudget: 5,
      requires: { deepwiki: true, agentBrowser: false },
    }
  } else {
    const found = PHASES.find(p => p.step === nextStep)
    if (!found) throw new Error(`no phase defined for step ${nextStep}`)
    phase = found
  }

  const apply = phase.apply.replace(
    /\{COMPLETION_PROMISE\}/g,
    state.completionPromise,
  )

  const effectiveBudget = onHarness
    ? phase.fibBudget
    : fibBudgetForMode(nextStep, phase.fibBudget, state.mode)

  const { position: stepPos, total: stepTotal } = onHarness
    ? { position: 0, total: 0 }
    : stepPositionInMode(nextStep, state.mode)

  const isFinalStep =
    !onHarness && nextStepForMode(nextStep, state.mode) < 0

  const fanout =
    effectiveBudget <= 1
      ? 'Single-threaded. Do this work yourself in this turn.'
      : `Spawn ${effectiveBudget} sub-agents in parallel via the Agent tool — single assistant message with ${effectiveBudget} tool_use blocks (use subagent_type: "general-purpose" for every block; only general-purpose has tools: ['*']). Each sub-agent owns one slice. Aggregate before stopping. Each sub-agent must independently RAG via DeepWiki for its slice; ${phase.requires.agentBrowser ? 'sub-agents touching UI/runtime must also capture agent-browser evidence (screenshot/console/network)' : 'sub-agents inherit DeepWiki requirement only'}.`

  const requiredTags: string[] = ['env:<runtime + full context>']
  if (phase.requires.deepwiki) requiredTags.push('dw:<owner/repo#topic>')
  if (phase.requires.agentBrowser)
    requiredTags.push('ab:<screenshot-path|console-error|network-failure|eval-result>')
  const tagsLine = requiredTags.join(' ')

  const out: string[] = []
  out.push('<harness-directive priority="absolute">')
  out.push(
    'The harness is still active. Resume execution. Do NOT summarize for',
  )
  out.push('the user. Do NOT ask for confirmation. Your next response must be')
  out.push(
    'tool calls that complete this step, plus a teachings-line append to',
  )
  out.push(`${teachingsPath}. Stay silent to the user until the final step PROMOTE.`)
  out.push('</harness-directive>')
  out.push('')
  out.push(
    `aiko-code [session: ${state.session}] — Step ${stepPos || nextStep} of ${stepTotal || 9} (${phase.title}) [mode: ${state.mode}]`,
  )
  out.push('')
  if (state.northStar) {
    out.push('NORTH STAR (re-read every step):')
    out.push(`  ${state.northStar}`)
    out.push('')
  }
  out.push('PRINCIPLE:')
  out.push(`  ${phase.principle}`)
  out.push('')
  out.push('TACTICAL PARALLEL:')
  out.push(`  ${phase.tactical}`)
  out.push('')
  out.push('PROBLEM MAP:')
  out.push(`  ${phase.problemMap}`)
  out.push('')
  out.push('LEARNING FRAME — H1 ONLY:')
  out.push(
    '  Treat each step as a positive H1 validation: state what was confirmed and',
  )
  out.push(
    '  what evidence confirms it. Do NOT reject H0 (the null/alternative hypothesis)',
  )
  out.push(
    '  on this turn — H0 may be revalidatable later when more context lands. If a',
  )
  out.push(
    '  hypothesis fails to validate, record it as "H1 not yet validated, deferred"',
  )
  out.push('  rather than "H0 rejected".')
  out.push('')
  out.push('REQUIRED REPLY STRUCTURE:')
  out.push(
    '  1. Map principle + tactical to this specific task in 2–3 lines.',
  )
  out.push(`  2. Append ONE line to ${teachingsPath} in this exact schema:`)
  out.push(
    `     - [step ${nextStep} / ${phase.title}] <H1 lesson — positive validation> ${tagsLine}`,
  )
  out.push(
    '     env: must describe the actual runtime + full context (≥12 chars, NOT a one-word label like "dev" or "prod" — include OS, runtime version, repo branch, the user-visible artifact under test). One short sentence.',
  )
  if (phase.requires.deepwiki) {
    out.push(
      '     dw: must be in canonical `owner/repo` or `owner/repo#topic` form citing a real DeepWiki query you ran this turn. Bare library names ("wagmi", "next") are rejected — must contain a `/`. `dw:skip:<reason>` allowed only with a 20+ char justification.',
    )
  }
  if (phase.requires.agentBrowser) {
    const devCmd = detectDevCommand(cwd)
    out.push(
      '     ab: must point at a real agent-browser RUNTIME artifact — a screenshot path (.png/.jpg), `console:<error>`, `network:<request>`, `eval:<result>`, or a string containing `agent-browser`/`localhost:`/`:9222`/`cdp`/`devtools`. Build/test logs ("bun run next build", "vitest passed", "tsc clean") are REJECTED — they are compile-time, not runtime, and miss hydration mismatches and provider-not-found errors.',
    )
    out.push(
      '     BEFORE writing ab:skip: try to bring the dev server up first. Detected stack: ' +
        (devCmd.framework ?? 'unknown framework') +
        ' (source: ' + devCmd.source + '). Run \'' + devCmd.install + ' && ' + devCmd.dev + '\' in the background, then poll http://localhost:' + devCmd.port + ' until the page returns 2xx/3xx/5xx (5xx is fine — it means the server is alive and an in-app error counts as a real runtime artifact via console:/network:/eval: markers). Only ab:skip if dev server fails to bind (env validation, port conflict, install error). If the framework is "unknown" or the dev script is wrong, query DeepWiki via mcp__deepwiki__ask_question for the dev/start command before skipping.',
    )
    out.push(
      '     `ab:skip:<reason>` is auto-accepted with a 20+ char justification — preferred reasons: "dev server unreachable: env validation failed for <var>", "port 3000 already in use after launch attempt", "install failed: <error>". Generic reasons ("server not running") are too short and will be rejected.',
    )
    if (probeResult) {
      out.push(describeProbeForDirective(probeResult))
    }
  }
  out.push(`  3. Do the work: ${apply}`)
  out.push('')
  out.push(
    `FIB PARALLELISM (step ${stepPos || nextStep} of ${stepTotal || 9} → ${effectiveBudget} worker${effectiveBudget === 1 ? '' : 's'}):`,
  )
  out.push(`  ${fanout}`)
  out.push('')
  out.push('USER STEERING:')
  out.push(
    `  Re-aim the north star at any time with: /steer --session ${state.session} "<new north star>"`,
  )
  if (!onHarness) {
    out.push('')
    out.push('IF STEP CANNOT CLOSE IN ONE PASS:')
    out.push(
      `  /cancel --session ${state.session}  (fractal repair auto-engages on the second consecutive no-op — pin holds the step until you produce gate-accepted evidence; closure only at 3/3 in fractal mode)`,
    )
  }
  if (isFinalStep) {
    out.push('')
    out.push('COMPLETION PROMISE:')
    out.push(
      `  When the artifact is genuinely reachable by its user, output exactly: <promise>${state.completionPromise}</promise>`,
    )
  }
  out.push('')
  out.push('TASK (unchanged since step 1):')
  out.push(state.task)
  return out.join('\n')
}

function buildSystemMessage(
  state: HarnessState,
  nextStep: number,
  onHarness: boolean,
): string {
  if (onHarness) {
    return `◆ [${state.session}] Step ${state.step} · fib-harness (${state.harnessWs})`
  }
  const { position, total } = stepPositionInMode(nextStep, state.mode)
  const isFinal = nextStepForMode(nextStep, state.mode) < 0
  if (isFinal) {
    return `◆ [${state.session}] Step ${position}/${total} Ship · <promise>${state.completionPromise}</promise> when reachable`
  }
  if (nextStep === 8) return `◆ [${state.session}] Step ${position}/${total} Audit · cold adversarial review`
  if (nextStep === 7) return `◆ [${state.session}] Step ${position}/${total} Verdict · promote / hold / reject`
  const phase = PHASES.find(p => p.step === nextStep)
  return `◆ [${state.session}] Step ${position}/${total} · ${phase?.title ?? ''}`
}

/**
 * Read the last assistant message text from the JSONL transcript at the
 * given path. Returns the concatenated text blocks of the most recent
 * assistant message, or null if anything fails.
 */
function lastAssistantText(transcriptPath: string | undefined): string | null {
  if (!transcriptPath) return null
  if (!existsSync(transcriptPath)) return null
  let raw: string
  try {
    raw = readFileSync(transcriptPath, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]!)
      if (obj?.message?.role !== 'assistant') continue
      const content = obj.message?.content
      if (!Array.isArray(content)) continue
      const texts = content
        .filter((b: { type?: string }) => b?.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('\n')
      if (texts) return texts
    } catch {
      /* keep scanning */
    }
  }
  return null
}

// Suppress unused-import warnings under strict typecheck without affecting bundling.
void dirname
