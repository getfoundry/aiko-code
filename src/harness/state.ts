/**
 * State file format for the 9-step harness.
 *
 * Identical YAML-frontmatter shape to what the previous bash setup-loop.sh
 * wrote. break-harness.sh still writes to this file (it sets harness_ws),
 * so the layout is contract — keep stable.
 *
 *   ---
 *   active: true
 *   session: "<name>"
 *   step: <0..9>
 *   harness_ws:                        # set by break-harness.sh when stuck
 *   completion_promise: "<phrase>"
 *   north_star: "<text>"               # optional
 *   started_at: "<iso8601>"
 *   ---
 *
 *   <task body, free text, until EOF>
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type HarnessState = {
  active: boolean
  session: string
  step: number
  harnessWs: string | null
  completionPromise: string
  northStar: string | null
  startedAt: string
  task: string
  /**
   * Consecutive turns where the model failed to produce the required
   * work-product (a teachings-line for the current step). Reset to 0 on
   * successful step completion. Escalates to session close at 3 to prevent
   * infinite degenerate loops where each turn is a no-op Write.
   */
  noOpCount: number
}

const FRONTMATTER_DELIM = '---'

export function stateFilePath(stateDir: string, session: string): string {
  return join(stateDir, `aiko-code.${session}.local.md`)
}

export function teachingsFilePath(stateDir: string, session: string): string {
  return join(stateDir, `aiko-code.${session}.teachings.local.md`)
}

export function readState(path: string): HarnessState | null {
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf8')
  const lines = raw.split('\n')
  if (lines[0] !== FRONTMATTER_DELIM) return null
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === FRONTMATTER_DELIM) {
      endIdx = i
      break
    }
  }
  if (endIdx < 0) return null
  const fm = new Map<string, string>()
  for (let i = 1; i < endIdx; i++) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(lines[i] ?? '')
    if (!m) continue
    let value = m[2]?.trim() ?? ''
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    fm.set(m[1]!, value)
  }
  const stepRaw = fm.get('step') ?? '0'
  const step = /^\d+$/.test(stepRaw) ? Number.parseInt(stepRaw, 10) : NaN
  if (Number.isNaN(step)) return null
  const task = lines.slice(endIdx + 1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
  const noOpRaw = fm.get('noop_count') ?? '0'
  const noOpCount = /^\d+$/.test(noOpRaw) ? Number.parseInt(noOpRaw, 10) : 0
  return {
    active: (fm.get('active') ?? 'false').toLowerCase() === 'true',
    session: fm.get('session') ?? 'default',
    step,
    harnessWs: nonEmpty(fm.get('harness_ws')),
    completionPromise: fm.get('completion_promise') || 'SHIPPED',
    northStar: nonEmpty(fm.get('north_star')),
    startedAt: fm.get('started_at') ?? new Date().toISOString(),
    task,
    noOpCount,
  }
}

export function writeState(path: string, state: HarnessState): void {
  const lines: string[] = [FRONTMATTER_DELIM]
  lines.push(`active: ${state.active ? 'true' : 'false'}`)
  lines.push(`session: "${state.session}"`)
  lines.push(`step: ${state.step}`)
  lines.push(`harness_ws:${state.harnessWs ? ` ${state.harnessWs}` : ''}`)
  lines.push(`completion_promise: "${state.completionPromise}"`)
  if (state.northStar) lines.push(`north_star: "${state.northStar}"`)
  lines.push(`started_at: "${state.startedAt}"`)
  lines.push(`noop_count: ${state.noOpCount}`)
  lines.push(FRONTMATTER_DELIM)
  lines.push('')
  lines.push(state.task)
  writeFileSync(path, lines.join('\n') + '\n', 'utf8')
}

export function deleteState(path: string): void {
  try {
    if (existsSync(path)) writeFileSync(path, '') // best-effort blank
    // Caller may rm; the file is harmless if empty.
  } catch {
    /* ignore */
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Return the most-recently-modified active session state file, or null. */
export function pickActiveSession(stateDir: string): string | null {
  if (!existsSync(stateDir)) return null
  let best: { path: string; mtime: number } | null = null
  for (const name of readdirSync(stateDir)) {
    if (!name.startsWith('aiko-code.') || !name.endsWith('.local.md')) continue
    if (name.endsWith('.teachings.local.md')) continue
    const full = join(stateDir, name)
    try {
      const m = statSync(full).mtimeMs
      if (!best || m > best.mtime) best = { path: full, mtime: m }
    } catch {
      /* ignore */
    }
  }
  return best?.path ?? null
}

function nonEmpty(s: string | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t || t === 'null') return null
  return t
}
