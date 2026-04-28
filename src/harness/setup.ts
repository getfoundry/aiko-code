/**
 * /guide entry point — initialize a new harness session and emit the
 * startup banner. Native TS replacement for setup-loop.sh.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ensureDir,
  type HarnessMode,
  stateFilePath,
  teachingsFilePath,
  writeState,
} from './state.js'

const STATE_DIR = '.aiko'

export type SetupArgs = {
  task: string
  session?: string
  northStar?: string
  completionPromise?: string
  cwd?: string
  mode?: HarnessMode
}

export function setupHarness(args: SetupArgs): string {
  const cwd = args.cwd ?? process.cwd()
  const session = args.session ?? 'default'
  const completionPromise = args.completionPromise ?? 'SHIPPED'
  const stateDir = resolve(cwd, STATE_DIR)
  ensureDir(stateDir)

  const mode = args.mode ?? autoDetectMode(args.task)

  const statePath = stateFilePath(stateDir, session)
  const teachingsPath = teachingsFilePath(stateDir, session)
  const startedAt = new Date().toISOString()

  writeState(statePath, {
    active: true,
    session,
    step: 0,
    harnessWs: null,
    completionPromise,
    northStar: args.northStar ?? null,
    startedAt,
    task: args.task,
    noOpCount: 0,
    mode,
  })

  if (!existsSync(teachingsPath)) {
    writeFileSync(
      teachingsPath,
      `# aiko-code — Teachings Log [${session}] (mode: ${mode})\n\nTask: ${args.task}\nStarted: ${startedAt}\n`,
      'utf8',
    )
  }

  return banner({
    task: args.task,
    session,
    statePath,
    completionPromise,
    northStar: args.northStar,
    mode,
  })
}

/**
 * Pick a mode from task keywords when the user didn't pass --mode explicitly.
 * Conservative: defaults to standard. `quick` triggers on small-fix vocabulary
 * (fix, debug, hotfix, typo, tweak, small, quick). `deep` triggers on
 * production/external vocabulary (ship to prod, deploy, public release,
 * customer-facing, breaking change).
 */
function autoDetectMode(task: string): HarnessMode {
  const t = task.toLowerCase()
  const deepHints = [
    'production',
    'prod release',
    'ship to prod',
    'public release',
    'customer-facing',
    'breaking change',
    'security audit',
    'compliance',
    'gdpr',
    'soc2',
  ]
  if (deepHints.some(h => t.includes(h))) return 'deep'
  const quickHints = [
    'hotfix',
    'typo',
    'one-liner',
    'tiny',
    'small fix',
    'quick fix',
    'rename ',
    'bump version',
  ]
  if (quickHints.some(h => t.includes(h))) return 'quick'
  return 'standard'
}

type BannerArgs = {
  task: string
  session: string
  statePath: string
  completionPromise: string
  northStar?: string
  mode: HarnessMode
}

function banner({
  task,
  session,
  statePath,
  completionPromise,
  northStar,
  mode,
}: BannerArgs): string {
  const stepCounts: Record<HarnessMode, number> = {
    quick: 3,
    standard: 9,
    deep: 9,
  }
  const totalSteps = stepCounts[mode]
  const lines: string[] = []
  lines.push('<harness-directive priority="absolute">')
  lines.push(
    `You are inside an active aiko-code ${totalSteps}-step harness session (mode: ${mode}). The text below`,
  )
  lines.push(
    'is your operating contract — not a description for the user. Do not',
  )
  lines.push('paraphrase. Do not ask for confirmation.')
  lines.push('')
  lines.push(
    `This is a STOP-DRIVEN loop. Setup just wrote ${statePath} with step=0 and mode=${mode}.`,
  )
  lines.push(
    'At the end of every assistant turn, the native Stop hook reads the state',
  )
  lines.push(
    "file, advances to the next step in this mode's list, and injects that step's playbook",
  )
  lines.push(
    '(principle, problem map, fib budget, work). Do the current step\'s work, append a',
  )
  lines.push(
    'one-line teachings entry, then stop normally — the hook delivers the',
  )
  lines.push('next step. Do not pre-empt. Do not skip ahead.')
  lines.push('</harness-directive>')
  lines.push('')
  lines.push(
    `aiko-code [session: ${session}] — ${totalSteps}-step harness armed (mode: ${mode}).`,
  )
  lines.push('')
  lines.push(`Task:              ${task}`)
  lines.push(`Mode:              ${mode}   (quick=1,5,9 / standard=1..9 / deep=1..9 +budgets)`)
  lines.push(`Session:           ${session}   (state: ${statePath})`)
  lines.push(`Step:              about to enter step 1 (Survey)`)
  lines.push(
    `Completion phrase: ${completionPromise}   (output only at the final step PROMOTE)`,
  )
  lines.push(
    `North star:        ${northStar ?? '<unset — set with /steer>'}`,
  )
  lines.push('')
  lines.push('Your immediate next action: produce a brief one-paragraph')
  lines.push(
    'acknowledgement and stop. The Stop hook will then inject step 1 (Survey).',
  )
  lines.push('')
  lines.push(`Stop early:        /cancel --session ${session}`)
  lines.push(`Read the log:      /log    --session ${session}`)
  lines.push(`Re-aim mid-flight: /steer  --session ${session} "<new north star>"`)
  lines.push('')
  lines.push('TASK:')
  lines.push(task)
  return lines.join('\n')
}

/**
 * Parse `/guide` argument string. Tokenizes with quote awareness, then
 * extracts --session / --north-star / --completion-promise / --mode flags
 * from the tail and treats remaining positional tokens as the task.
 */
export function parseGuideArgs(input: string): SetupArgs {
  const tokens = tokenize(input)
  const positional: string[] = []
  let session: string | undefined
  let northStar: string | undefined
  let completionPromise: string | undefined
  let mode: HarnessMode | undefined
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    switch (t) {
      case '--session':
        session = tokens[++i]
        break
      case '--north-star':
        northStar = tokens[++i]
        break
      case '--completion-promise':
        completionPromise = tokens[++i]
        break
      case '--mode': {
        const m = tokens[++i]?.toLowerCase()
        if (m === 'quick' || m === 'standard' || m === 'deep') mode = m
        break
      }
      default:
        positional.push(t)
    }
  }
  return {
    task: positional.join(' '),
    session,
    northStar,
    completionPromise,
    mode,
  }
}
function tokenize(input: string): string[] {
  const out: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) quote = null
      else buf += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (buf) {
        out.push(buf)
        buf = ''
      }
      continue
    }
    buf += ch
  }
  if (buf) out.push(buf)
  return out
}
