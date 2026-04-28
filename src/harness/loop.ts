/**
 * 9-step harness loop — Stop-hook callback that advances the active session
 * one step per assistant turn and injects step N's playbook as the resume
 * directive. Native TS replacement for core/loop.sh.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import type { HarnessPhase } from './phases.js'
import { PHASES } from './phases.js'
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
  systemMessage?: string
  hookSpecificOutput?: { hookEventName: string; reason: string }
}

export type StopHookInput = {
  transcript_path?: string
}

/**
 * Stop-hook callback. Returns `{}` (no-op) when there's no active session;
 * returns `{ decision: 'block', ... }` to inject the next step's playbook;
 * returns `{}` and clears the state file when the completion promise lands.
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
    nextStep = Math.min(state.step + 1, 9)
    onHarness = false
  }

  const teachingsPath = teachingsFilePath(stateDir, state.session)
  const directive = buildDirective({
    state,
    nextStep,
    onHarness,
    cwd,
    teachingsPath,
  })

  // Persist step advance for non-harness phases.
  if (!onHarness && nextStep !== state.step) {
    writeState(path, { ...state, step: nextStep })
  }

  const sysMsg = buildSystemMessage(state, nextStep, onHarness)
  return {
    decision: 'block',
    systemMessage: sysMsg,
    hookSpecificOutput: { hookEventName: 'Stop', reason: directive },
  }
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

  const fanout =
    phase.fibBudget <= 1
      ? 'Single-threaded. Do this work yourself in this turn.'
      : `Spawn ${phase.fibBudget} sub-agents in parallel via the Agent tool — single assistant message with ${phase.fibBudget} tool_use blocks. Each sub-agent owns one slice. Aggregate before stopping.`

  const out: string[] = []
  out.push('<harness-directive priority="absolute">')
  out.push(
    'The harness is still active. Resume execution. Do NOT summarize for',
  )
  out.push('the user. Do NOT ask for confirmation. Your next response must be')
  out.push(
    'tool calls that complete this step, plus a teachings-line append to',
  )
  out.push(`${teachingsPath}. Stay silent to the user until step 9 PROMOTE.`)
  out.push('</harness-directive>')
  out.push('')
  out.push(
    `aiko-code [session: ${state.session}] — Step ${nextStep} of 9 (${phase.title})`,
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
  out.push('REQUIRED REPLY STRUCTURE:')
  out.push(
    '  1. Map principle + tactical to this specific task in 2–3 lines.',
  )
  out.push(`  2. Append ONE line to ${teachingsPath}:`)
  out.push(`     - [step ${nextStep} / ${phase.title}] <one-line lesson>`)
  out.push(`  3. Do the work: ${apply}`)
  out.push('')
  out.push(
    `FIB PARALLELISM (step ${nextStep} of 9 → ${phase.fibBudget} worker${phase.fibBudget === 1 ? '' : 's'}):`,
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
  if (nextStep === 9 && !onHarness) {
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
  if (nextStep === 9) {
    return `◆ [${state.session}] Step 9/9 Ship · <promise>${state.completionPromise}</promise> when reachable`
  }
  if (nextStep === 8) return `◆ [${state.session}] Step 8/9 Audit · cold adversarial review`
  if (nextStep === 7) return `◆ [${state.session}] Step 7/9 Verdict · promote / hold / reject`
  const phase = PHASES.find(p => p.step === nextStep)
  return `◆ [${state.session}] Step ${nextStep}/9 · ${phase?.title ?? ''}`
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
