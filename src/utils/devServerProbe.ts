import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { detectDevCommand, type DevCommand } from './devCommand.js'

const LOCK_DIR = '.aiko'
const STARTUP_LOG_TAIL_LINES = 80
const STARTUP_LOG_MAX_BYTES = 16 * 1024
const DEFAULT_STARTUP_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 500
const PROBE_TIMEOUT_MS = 1_500

export type DevServerProbeResult =
  | { state: 'already-up'; url: string; cmd: DevCommand; pid?: number; output: string }
  | { state: 'started'; url: string; cmd: DevCommand; pid: number; output: string }
  | { state: 'failed'; url: string; cmd: DevCommand; output: string; reason: string }
  | { state: 'skipped'; reason: string; cmd: DevCommand; output: '' }

function lockPath(cwd: string, port: number): string {
  return join(cwd, LOCK_DIR, `devserver-${port}.lock`)
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function httpAlive(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // 5xx is "alive" — server bound and responding, even if app errored.
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'manual' })
    return r.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

function tailOutput(buf: string): string {
  let s = buf.length > STARTUP_LOG_MAX_BYTES ? buf.slice(-STARTUP_LOG_MAX_BYTES) : buf
  const lines = s.split('\n')
  if (lines.length > STARTUP_LOG_TAIL_LINES) s = lines.slice(-STARTUP_LOG_TAIL_LINES).join('\n')
  return s.trim()
}

/**
 * Probe-or-start the project's dev server. Idempotent: if already responding
 * on the detected port, returns 'already-up' instantly. Otherwise spawns the
 * install + dev command in the background, polls the port, and returns either
 * 'started' (with PID and the recent terminal output) or 'failed' (with the
 * captured stderr/stdout so the model can debug).
 *
 * Terminal output is the contract: the returned `output` field is what the
 * harness directive injects into the model's context. This is the
 * generalization of "make terminal failures actionable" — every failure
 * surfaces the actual error text, not just an exit code.
 */
export async function probeOrStartDevServer(opts: {
  cwd: string
  timeoutMs?: number
}): Promise<DevServerProbeResult> {
  const cwd = opts.cwd
  const timeoutMs = opts.timeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
  const cmd = detectDevCommand(cwd)
  const url = `http://localhost:${cmd.port}`

  // Cheap HTTP probe — if something is already bound to the port, reuse it.
  if (await httpAlive(url, PROBE_TIMEOUT_MS)) {
    let pid: number | undefined
    const lp = lockPath(cwd, cmd.port)
    if (existsSync(lp)) {
      try {
        pid = Number(readFileSync(lp, 'utf8').trim()) || undefined
      } catch { /* ignore */ }
    }
    return { state: 'already-up', url, cmd, pid, output: '' }
  }

  // Stale lock cleanup.
  const lp = lockPath(cwd, cmd.port)
  if (existsSync(lp)) {
    try {
      const stalePid = Number(readFileSync(lp, 'utf8').trim())
      if (stalePid && !pidAlive(stalePid)) unlinkSync(lp)
    } catch { /* ignore */ }
  }

  if (!existsSync(join(cwd, LOCK_DIR))) {
    try { mkdirSync(join(cwd, LOCK_DIR), { recursive: true }) } catch { /* ignore */ }
  }

  const startedAt = Date.now()
  let captured = ''

  const startCommand = `${cmd.install} && ${cmd.dev}`
  const child = spawn('sh', ['-lc', startCommand], {
    cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  })

  const onData = (b: Buffer) => {
    captured += b.toString('utf8')
    if (captured.length > STARTUP_LOG_MAX_BYTES * 2) {
      captured = captured.slice(-STARTUP_LOG_MAX_BYTES)
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)

  let earlyExitCode: number | null = null
  child.on('exit', code => { earlyExitCode = code })

  if (child.pid) {
    try { writeFileSync(lp, String(child.pid)) } catch { /* ignore */ }
  }

  while (Date.now() - startedAt < timeoutMs) {
    if (earlyExitCode !== null) {
      try { unlinkSync(lp) } catch { /* ignore */ }
      return {
        state: 'failed',
        url,
        cmd,
        output: tailOutput(captured),
        reason: `dev command exited with code ${earlyExitCode} before binding to port ${cmd.port}`,
      }
    }
    if (await httpAlive(url, PROBE_TIMEOUT_MS)) {
      // Detach so we don't block on child process closure when the harness
      // finishes its turn.
      try { child.unref() } catch { /* ignore */ }
      return {
        state: 'started',
        url,
        cmd,
        pid: child.pid ?? -1,
        output: tailOutput(captured),
      }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
  }

  // Timed out — kill our process tree, return whatever we captured.
  try { child.kill('SIGTERM') } catch { /* ignore */ }
  try { unlinkSync(lp) } catch { /* ignore */ }
  return {
    state: 'failed',
    url,
    cmd,
    output: tailOutput(captured),
    reason: `dev server did not bind to port ${cmd.port} within ${timeoutMs}ms`,
  }
}

/** Format probe result as text injected into a harness directive. */
export function describeProbeForDirective(r: DevServerProbeResult): string {
  if (r.state === 'skipped') return `     dev-server probe: skipped (${r.reason})`
  const head = `     dev-server probe (${r.cmd.framework ?? 'unknown framework'}, port ${r.cmd.port})`
  if (r.state === 'already-up')
    return `${head}: ALREADY UP at ${r.url}${r.pid ? ` (pid ${r.pid})` : ''}. Probe via agent-browser; do not relaunch.`
  if (r.state === 'started')
    return `${head}: STARTED at ${r.url} (pid ${r.pid}). Bound after install + dev launch. Probe via agent-browser. Recent terminal output:\n${indentBlock(r.output)}`
  return `${head}: FAILED. ${r.reason}. Terminal output is below — fix the root cause before retrying. Common fixes: missing env vars (read .env.example, mock with SKIP_ENV_VALIDATION=true if the project's env validator supports it), port already in use (kill the conflicting process), install errors (check the lockfile / network).\n${indentBlock(r.output || '(no output captured)')}`
}

function indentBlock(s: string): string {
  return s
    .split('\n')
    .map(l => `       │ ${l}`)
    .join('\n')
}
