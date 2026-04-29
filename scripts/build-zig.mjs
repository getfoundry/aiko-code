#!/usr/bin/env node
/**
 * Build the zig binaries (zigrep / zigread / zigdiff) into dist/bin/.
 *
 * Called by scripts/build.ts after the bun bundle step. Best-effort:
 * if `zig` isn't on PATH, logs and exits 0. Targets Zig 0.15+.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const ZIG_DIR = join(REPO_ROOT, 'zig')
const DIST_PREFIX = join(REPO_ROOT, 'dist')

function isOnPath(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function main() {
  if (!existsSync(ZIG_DIR) || !existsSync(join(ZIG_DIR, 'build.zig'))) {
    console.warn('[build-zig] no zig/ directory — skipping')
    return
  }
  if (!isOnPath('zig')) {
    console.warn(
      '[build-zig] `zig` not on PATH — skipping. Install Zig 0.15+ and rebuild to bundle native zigrep/zigread/zigdiff.',
    )
    return
  }
  try {
    console.log('[build-zig] compiling zigrep / zigread / zigdiff (release=fast)')
    execFileSync(
      'zig',
      ['build', 'install', '--release=fast', '--prefix', DIST_PREFIX],
      { cwd: ZIG_DIR, stdio: 'inherit' },
    )
    console.log('[build-zig] installed → dist/bin/zigrep, zigread, zigdiff')
  } catch (e) {
    console.warn(`[build-zig] compilation failed: ${e?.message || e}`)
    console.warn('[build-zig] CLI will work without bundled zig tools')
  }
}

main()
