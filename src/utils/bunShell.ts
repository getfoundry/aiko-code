import { execa } from 'execa'

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

export type ShellResult = {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Run a shell command. Uses Bun.$ when on the Bun runtime (faster, no subshell
 * spawn for builtins), falls back to execa under Node.
 */
export async function sh(
  command: string,
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<ShellResult> {
  if (isBun) {
    const Bun = (globalThis as { Bun: { $: unknown } }).Bun
    const $ = Bun.$ as {
      (strings: TemplateStringsArray, ...values: unknown[]): {
        cwd: (p: string) => unknown
        env: (e: Record<string, string>) => unknown
        nothrow: () => unknown
        quiet: () => Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }>
      }
    }
    let proc = $`sh -c ${command}`.nothrow()
    if (opts.cwd) proc = (proc as { cwd: (p: string) => typeof proc }).cwd(opts.cwd)
    if (opts.env) proc = (proc as { env: (e: Record<string, string>) => typeof proc }).env(opts.env)
    const r = await (proc as { quiet: () => Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> }).quiet()
    return {
      stdout: r.stdout.toString('utf8'),
      stderr: r.stderr.toString('utf8'),
      exitCode: r.exitCode,
    }
  }
  const r = await execa(command, {
    shell: true,
    cwd: opts.cwd,
    env: opts.env,
    timeout: opts.timeout,
    reject: false,
  })
  return {
    stdout: typeof r.stdout === 'string' ? r.stdout : '',
    stderr: typeof r.stderr === 'string' ? r.stderr : '',
    exitCode: r.exitCode ?? 1,
  }
}

export const runtimeIsBun = isBun


/**
 * Direct binary spawn — bypasses the shell entirely. Use when:
 *  - args are already split (no shell metacharacters needed)
 *  - you want the lowest possible spawn latency
 *
 * On Bun, this uses `Bun.spawn` (faster than Node's child_process.spawn for
 * short-lived processes by ~2-5x in benchmarks). On Node, falls back to
 * child_process.spawn.
 *
 * Tradeoff vs `sh()`:
 *   - `sh()` runs through `sh -c` so it supports pipes/globs/&&/redirects.
 *   - `runFast()` does NOT support those — argv goes straight to execve.
 */
export async function runFast(
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number; input?: string } = {},
): Promise<ShellResult> {
  if (argv.length === 0) return { stdout: '', stderr: 'empty argv', exitCode: 2 }
  if (isBun) {
    const Bun = (globalThis as { Bun: { spawn: (cmd: string[], opts: unknown) => unknown } }).Bun
    const proc = Bun.spawn(argv, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdin: opts.input ? new TextEncoder().encode(opts.input) : 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }) as {
      stdout: ReadableStream<Uint8Array>
      stderr: ReadableStream<Uint8Array>
      exited: Promise<number>
      kill: (sig?: string) => void
    }
    let timer: NodeJS.Timeout | undefined
    if (opts.timeout) {
      timer = setTimeout(() => proc.kill('SIGTERM'), opts.timeout)
    }
    const [stdoutText, stderrText, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (timer) clearTimeout(timer)
    return { stdout: stdoutText, stderr: stderrText, exitCode }
  }
  // Node fallback
  const { spawn } = await import('node:child_process')
  return await new Promise<ShellResult>(resolve => {
    const p = spawn(argv[0]!, argv.slice(1), {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    p.stdout.on('data', (b: Buffer) => { out += b.toString('utf8') })
    p.stderr.on('data', (b: Buffer) => { err += b.toString('utf8') })
    if (opts.input) p.stdin.end(opts.input); else p.stdin.end()
    let timer: NodeJS.Timeout | undefined
    if (opts.timeout) timer = setTimeout(() => p.kill('SIGTERM'), opts.timeout)
    p.on('exit', code => {
      if (timer) clearTimeout(timer)
      resolve({ stdout: out, stderr: err, exitCode: code ?? 1 })
    })
    p.on('error', () => resolve({ stdout: out, stderr: err || 'spawn error', exitCode: 127 }))
  })
}
