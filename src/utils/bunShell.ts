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
