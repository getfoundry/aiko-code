import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export type DevCommand = {
  install: string
  dev: string
  port: number
  source: 'package-json' | 'framework-default' | 'unknown'
  framework?: string
}

const FRAMEWORK_DEFAULTS: Record<
  string,
  Pick<DevCommand, 'dev' | 'port' | 'framework'>
> = {
  next: { dev: 'bun run dev', port: 3000, framework: 'next.js' },
  vite: { dev: 'bun run dev', port: 5173, framework: 'vite' },
  '@sveltejs/kit': { dev: 'bun run dev', port: 5173, framework: 'sveltekit' },
  '@remix-run/dev': { dev: 'bun run dev', port: 3000, framework: 'remix' },
  astro: { dev: 'bun run dev', port: 4321, framework: 'astro' },
  '@nuxtjs/core': { dev: 'bun run dev', port: 3000, framework: 'nuxt' },
  nuxt: { dev: 'bun run dev', port: 3000, framework: 'nuxt' },
  '@redwoodjs/core': { dev: 'bun run dev', port: 8910, framework: 'redwood' },
  expo: { dev: 'bun run start', port: 8081, framework: 'expo' },
}

function pickInstaller(cwd: string): string {
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock')))
    return 'bun install'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm install'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn install'
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm install'
  return 'bun install'
}

function pickRunner(installer: string): string {
  if (installer.startsWith('bun')) return 'bun run'
  if (installer.startsWith('pnpm')) return 'pnpm'
  if (installer.startsWith('yarn')) return 'yarn'
  return 'npm run'
}

function detectFramework(deps: Record<string, string>): string | null {
  for (const key of Object.keys(FRAMEWORK_DEFAULTS)) {
    if (deps[key]) return key
  }
  return null
}

/**
 * Detect how to bring up the project's dev server. Read the project's
 * package.json + lockfiles and return:
 *   - install command (`bun install` etc, picked from lockfile)
 *   - dev command (from `scripts.dev`/`scripts.start` or framework default)
 *   - default port (from framework convention)
 *
 * Used by the harness to inject a "before skipping ab:, try to bring up the
 * dev server with this command" hint into agent-browser-required steps.
 */
export function detectDevCommand(cwd: string): DevCommand {
  const pkgPath = join(cwd, 'package.json')
  const installer = pickInstaller(cwd)
  if (!existsSync(pkgPath)) {
    return {
      install: installer,
      dev: `${pickRunner(installer)} dev`,
      port: 3000,
      source: 'unknown',
    }
  }

  let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  } catch {
    /* fall through to defaults */
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  const frameworkKey = detectFramework(deps)
  const fdef = frameworkKey ? FRAMEWORK_DEFAULTS[frameworkKey] : undefined

  const runner = pickRunner(installer)
  const scriptDev = pkg.scripts?.dev ? `${runner} dev` : null
  const scriptStart = pkg.scripts?.start ? `${runner} start` : null

  const dev = scriptDev ?? scriptStart ?? fdef?.dev ?? `${runner} dev`
  const port = fdef?.port ?? 3000

  return {
    install: installer,
    dev,
    port,
    source: scriptDev || scriptStart ? 'package-json' : fdef ? 'framework-default' : 'unknown',
    framework: fdef?.framework,
  }
}
