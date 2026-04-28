import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

import { ensureAikoPluginInstalled } from './installAikoPlugin.js'

const PLUGIN_DIR = resolve(
  __dirname,
  '..',
  'plugins',
  'bundled',
  'aiko-code',
)
const COMMANDS_DIR = resolve(PLUGIN_DIR, 'commands')

let prevSkip: string | undefined

beforeEach(() => {
  prevSkip = process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP
})

afterEach(() => {
  if (prevSkip === undefined) delete process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP
  else process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP = prevSkip
})

test('AIKO_SKIP_PLUGIN_BOOTSTRAP=1 short-circuits to skipped', async () => {
  process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP = '1'
  const result = await ensureAikoPluginInstalled()
  expect(result.status).toBe('skipped')
  expect(result.reason).toContain('AIKO_SKIP_PLUGIN_BOOTSTRAP')
})

test('end-to-end run reads plugin version and produces a defined status', async () => {
  delete process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP
  const result = await ensureAikoPluginInstalled()
  // bun:test env can't resolve `bun:bundle` inside settings.ts so the dynamic
  // import path may surface as 'error' — the contract is that the function
  // never throws and always returns a typed BootstrapResult with version set.
  expect(
    ['unchanged', 'installed', 'updated', 'error', 'skipped'],
  ).toContain(result.status)
  expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
})

test('AIKO_SKIP_PLUGIN_BOOTSTRAP="" does NOT skip', async () => {
  process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP = ''
  const result = await ensureAikoPluginInstalled()
  expect(result.status).not.toBe('skipped')
})

test('AIKO_SKIP_PLUGIN_BOOTSTRAP="0" does NOT skip (only literal "1" skips)', async () => {
  process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP = '0'
  const result = await ensureAikoPluginInstalled()
  expect(result.status).not.toBe('skipped')
})

test('plugin manifest declares an aiko-code name and version', () => {
  const manifestPath = resolve(PLUGIN_DIR, '.claude-plugin', 'plugin.json')
  expect(existsSync(manifestPath)).toBe(true)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string
    version?: string
  }
  expect(manifest.name).toBe('aiko-code')
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
})

test('plugin does NOT ship /guide or /taste plugin command shims, and has no stale /loop', () => {
  // /guide and /taste are registered at runtime as bundled skills (see
  // src/skills/bundled/aikoCodeHarness.ts and src/skills/bundled/taste.ts).
  // A plugin command markdown of the same name would shadow the bundled
  // skill — dropping the laws.md / slop.md files for /taste and producing
  // a duplicate slash-menu entry. Keep the plugin surface lean.
  expect(existsSync(resolve(COMMANDS_DIR, 'guide.md'))).toBe(false)
  expect(existsSync(resolve(COMMANDS_DIR, 'taste.md'))).toBe(false)
  expect(existsSync(resolve(COMMANDS_DIR, 'loop.md'))).toBe(false)
})
