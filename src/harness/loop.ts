/**
 * 9-step harness loop — Stop-hook callback that advances the active session
 * one step per assistant turn and injects step N's playbook as the resume
 * directive. Native TS replacement for core/loop.sh.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { formatAuditMarkdown, runBoundaryAudit } from './boundaryAudit.js'
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
  // model to append a line of the form
  //   `[step N / <title>] <H1 lesson> env:<ctx> dw:<ref> ab:<evidence>`
  // to the teachings file. The gate checks for both the step marker AND the
  // required evidence tags (env always; dw always; ab when the phase requires
  // it). Missing tags = no work-product → re-inject the same step. Escalates
  // to session close after 3 consecutive no-ops.
  if (!onHarness && state.step >= 1) {
    const prevPhase = PHASES.find(p => p.step === state.step)
    const teachingsContent = existsSync(teachingsPath)
      ? readFileSync(teachingsPath, 'utf8')
      : ''
    const stepLine = findStepLine(teachingsContent, state.step)
    const missing = stepLine
      ? evidenceMissing(stepLine, prevPhase)
      : ['teachings-line']
    if (missing.length > 0) {
      const newCount = (state.noOpCount ?? 0) + 1
      if (newCount >= 3) {
        try {
          unlinkSync(path)
        } catch {
          /* ignore */
        }
        return {
          systemMessage: `◆ [${state.session}] step ${state.step} produced no work-product across ${newCount} turns. Loop closed. Run /guide again with a clearer task or smaller scope.`,
        }
      }
      writeState(path, { ...state, noOpCount: newCount })
      // Re-inject the SAME step (don't advance).
      nextStep = state.step
      const directive = buildDirective({
        state,
        nextStep,
        onHarness,
        cwd,
        teachingsPath,
      })
      const warning = `<no-op-warning priority="absolute">\nYour last turn did not satisfy the work-product gate for step ${state.step}. Missing: ${missing.join(', ')}. The harness will not advance. Re-do step ${state.step} properly: produce the artifact AND append the line:\n  - [step ${state.step} / <title>] <H1 lesson — positive validation only> env:<runtime+ctx> dw:<owner/repo#topic> ${prevPhase?.requires.agentBrowser ? 'ab:<screenshot|console|network|eval>' : ''}\nto ${teachingsPath}. Treat this as H1 only — validate what worked. Do NOT reject H0; H0 may be revalidatable later. Whitespace-only writes and tag-only stubs are not work-product. This is attempt ${newCount}/3 — at 3 the loop closes.\n</no-op-warning>\n\n`
      return {
        decision: 'block',
        reason: warning + directive,
        systemMessage: `◆ [${state.session}] step ${state.step} no-op (${newCount}/3) — re-injecting (missing: ${missing.join(',')}).`,
      }
    }
    // Step completed cleanly; reset the counter for the next step.
    if ((state.noOpCount ?? 0) > 0) {
      writeState(path, { ...state, noOpCount: 0 })
    }
  }

  // When the harness advances INTO step 1 (state.step was 0 or below, nextStep
  // is 1 in any mode), pre-run the dependency-boundary audit and prepend the
  // findings to the directive. The model still sees the directive that says
  // "invoke /audit-boundaries" — having the report already in-context lets it
  // skip the round-trip on the easy case and still re-run when needed.
  const auditPrelude =
    !onHarness && nextStep === 1
      ? await runAuditWithTimeout(cwd, 30000)
      : ''

  const directive = buildDirective({
    state,
    nextStep,
    onHarness,
    cwd,
    teachingsPath,
  })

  // Persist step advance for non-harness phases.
  if (!onHarness && nextStep !== state.step) {
    writeState(path, { ...state, step: nextStep, noOpCount: 0 })
  }

  const sysMsg = buildSystemMessage(state, nextStep, onHarness)
  return {
    decision: 'block',
    reason: auditPrelude ? `${auditPrelude}\n\n${directive}` : directive,
    systemMessage: sysMsg,
  }
}

/**
 * Run the boundary audit with a hard timeout so the stop hook never hangs.
 * Returns an empty string on timeout or any error — the directive still
 * tells the model to invoke `/audit-boundaries` itself, so a missing
 * prelude just costs one extra tool call.
 */
async function runAuditWithTimeout(cwd: string, timeoutMs: number): Promise<string> {
  try {
    const audit = await Promise.race([
      runBoundaryAudit({ cwd }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!audit) return ''
    if (audit.findings.length === 0 && !audit.diagnostics.lspReachable) return ''
    const md = formatAuditMarkdown(audit)
    return `<boundary-audit priority="high">\n${md}\n</boundary-audit>`
  } catch {
    return ''
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

/**
 * Check the teachings line for the required evidence tags. Returns the list
 * of missing tags. `env:` and `dw:` are always required. `ab:` is required
 * when the phase requires.agentBrowser. A tag value of `skip:<reason>` is
 * accepted only when the reason is non-trivial (>=20 chars).
 */
function evidenceMissing(
  line: string,
  phase: HarnessPhase | undefined,
): string[] {
  const missing: string[] = []
  const checks: Array<{
    tag: string
    required: boolean
    shape?: (value: string) => string | null
  }> = [
    { tag: 'env:', required: true, shape: shapeEnv },
    {
      tag: 'dw:',
      required: phase?.requires.deepwiki ?? true,
      shape: shapeDeepWiki,
    },
    {
      tag: 'ab:',
      required: phase?.requires.agentBrowser ?? false,
      shape: shapeAgentBrowser,
    },
  ]
  for (const { tag, required, shape } of checks) {
    if (!required) continue
    const value = extractTag(line, tag)
    if (value === null) {
      missing.push(tag.replace(':', ''))
      continue
    }
    if (value.startsWith('skip:')) {
      if (value.slice(5).trim().length < 20) {
        missing.push(`${tag.replace(':', '')}(skip-reason-too-short)`)
      }
      continue
    }
    if (shape) {
      const reason = shape(value)
      if (reason) missing.push(`${tag.replace(':', '')}(${reason})`)
    }
  }
  return missing
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
 * whitespace-or-start, then the tag, then a value terminated by whitespace.
 * Returns the value (without the tag prefix) or null.
 */
function extractTag(line: string, tag: string): string | null {
  const re = new RegExp(`(?:^|\\s)${tag.replace(':', '\\:')}(\\S+)`)
  const m = re.exec(line)
  return m ? m[1]! : null
}

type DirectiveArgs = {
  state: HarnessState
  nextStep: number
  onHarness: boolean
  cwd: string
  teachingsPath: string
}

function buildDirective({
  state,
  nextStep,
  onHarness,
  teachingsPath,
}: DirectiveArgs): string {
  let phase: HarnessPhase
  if (onHarness) {
    phase = {
      step: state.step,
      label: 'repair',
      title: 'Repair (fib-harness child active)',
      principle:
        'Repair is fractal. Each stuck step earns its own full cycle.',
      tactical:
        'Drive the fib-harness child to verdict=promote before resuming the main loop.',
      problemMap: `Step ${state.step} is stuck and a fib-harness is running in ${state.harnessWs}.`,
      apply: `Work the harness. When verdict=promote, blank harness_ws in the state file so the next firing advances the main loop to step ${state.step + 1}.`,
      fibBudget: 1,
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
    out.push(
      '     ab: must point at a real agent-browser RUNTIME artifact — a screenshot path (.png/.jpg), `console:<error>`, `network:<request>`, `eval:<result>`, or a string containing `agent-browser`/`localhost:`/`:9222`/`cdp`/`devtools`. Build/test logs ("bun run next build", "vitest passed", "tsc clean") are REJECTED — they are compile-time, not runtime, and miss hydration mismatches and provider-not-found errors. You must actually launch `npx agent-browser navigate <url>` (or attach to `--remote-debugging-port=9222`) and capture live output. `ab:skip:<reason>` allowed only with a 20+ char justification.',
    )
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
      `  /cancel --session ${state.session}  (or invoke break-harness.sh under the bundled plugin to spawn a fib-harness child scoped to the stuck sub-problem)`,
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
