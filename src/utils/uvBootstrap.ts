/**
 * uv bootstrap — prepend the bundled uv binary's directory to PATH at CLI
 * startup so child processes (the serena MCP server, any other uvx-spawned
 * tool) find it without the user installing uv themselves.
 *
 * The binary is downloaded into `dist/bin/uv` (+ `uv.exe` on Windows) at
 * build time by `scripts/install-uv.mjs`. If it's missing — older build,
 * cross-platform install, or download failed during build — this is a
 * no-op and child processes fall back to the system PATH.
 *
 * Wired into the CLI entrypoint (main.tsx) early enough that all later
 * spawn calls inherit the prepended PATH.
 */
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let bootstrapped = false

/**
 * Resolve the bundled uv binary's directory and prepend it to process.env.PATH
 * if present. Idempotent — safe to call multiple times.
 *
 * Returns the bundled bin directory if it was prepended, else null.
 */
export function bootstrapBundledUv(): string | null {
  if (bootstrapped) return null
  bootstrapped = true

  const candidates = candidateBinDirs()
  for (const dir of candidates) {
    const uv = join(dir, process.platform === 'win32' ? 'uv.exe' : 'uv')
    if (!existsSync(uv)) continue
    const current = process.env.PATH ?? ''
    if (current.split(delimiter).includes(dir)) return dir
    process.env.PATH = current ? `${dir}${delimiter}${current}` : dir
    return dir
  }
  return null
}

/**
 * Possible locations for the bundled bin directory. We probe in order:
 *   1. `dist/bin` next to the running cli.mjs (production install via
 *      `npm i -g aiko-code` / symlink to dist/cli.mjs).
 *   2. `dist/bin` at the repo root (dev / `bun run dev`).
 */
function candidateBinDirs(): string[] {
  const out = new Set<string>()
  try {
    const here = fileURLToPath(import.meta.url)
    // src/utils/uvBootstrap.ts → repo root
    const repoRoot = join(dirname(here), '..', '..')
    out.add(join(repoRoot, 'dist', 'bin'))
  } catch {
    /* import.meta.url unavailable in some bundlers */
  }
  // Bundled into dist/cli.mjs → resolve via process.argv[1].
  const argv1 = process.argv[1]
  if (argv1) {
    out.add(join(dirname(argv1), 'bin'))
    out.add(join(dirname(argv1), '..', 'bin'))
  }
  return [...out]
}
