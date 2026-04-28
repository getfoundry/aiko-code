/**
 * /guide entry point — initialize a new harness session and emit the
 * startup banner. Native TS replacement for setup-loop.sh.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ensureDir,
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
}

export function setupHarness(args: SetupArgs): string {
  const cwd = args.cwd ?? process.cwd()
  const session = args.session ?? 'default'
  const completionPromise = args.completionPromise ?? 'SHIPPED'
  const stateDir = resolve(cwd, STATE_DIR)
  ensureDir(stateDir)

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
  })

  if (!existsSync(teachingsPath)) {
    writeFileSync(
      teachingsPath,
      `# aiko-code — Teachings Log [${session}]\n\nTask: ${args.task}\nStarted: ${startedAt}\n`,
      'utf8',
    )
  }

  return banner({
    task: args.task,
    session,
    statePath,
    completionPromise,
    northStar: args.northStar,
  })
}

type BannerArgs = {
  task: string
  session: string
  statePath: string
  completionPromise: string
  northStar?: string
}

function banner({
  task,
  session,
  statePath,
  completionPromise,
  northStar,
}: BannerArgs): string {
  const lines: string[] = []
  lines.push('<harness-directive priority="absolute">')
  lines.push(
    'You are inside an active aiko-code 9-step harness session. The text below',
  )
  lines.push(
    'is your operating contract — not a description for the user. Do not',
  )
  lines.push('paraphrase. Do not ask for confirmation.')
  lines.push('')
  lines.push(
    `This is a STOP-DRIVEN loop. Setup just wrote ${statePath} with step=0.`,
  )
  lines.push(
    'At the end of every assistant turn, the native Stop hook reads the state',
  )
  lines.push(
    'file, advances to step N+1, and injects that step\'s playbook (principle,',
  )
  lines.push(
    'problem map, fib budget, work). Do the current step\'s work, append a',
  )
  lines.push(
    'one-line teachings entry, then stop normally — the hook delivers the',
  )
  lines.push('next step. Do not pre-empt. Do not skip ahead.')
  lines.push('</harness-directive>')
  lines.push('')
  lines.push(`aiko-code [session: ${session}] — 9-step harness armed.`)
  lines.push('')
  lines.push(`Task:              ${task}`)
  lines.push(`Session:           ${session}   (state: ${statePath})`)
  lines.push(`Step:              about to enter 1/9 (Survey)`)
  lines.push(
    `Completion phrase: ${completionPromise}   (output only at step 9 PROMOTE)`,
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
 * extracts --session / --north-star / --completion-promise flags from the
 * tail and treats remaining positional tokens as the task.
 */
export function parseGuideArgs(input: string): SetupArgs {
  const tokens = tokenize(input)
  const positional: string[] = []
  let session: string | undefined
  let northStar: string | undefined
  let completionPromise: string | undefined
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
      default:
        positional.push(t)
    }
  }
  return {
    task: positional.join(' '),
    session,
    northStar,
    completionPromise,
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
