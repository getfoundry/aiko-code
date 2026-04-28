import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export type BootstrapStatus =
  | 'installed'
  | 'updated'
  | 'unchanged'
  | 'skipped'
  | 'error'

export interface BootstrapResult {
  status: BootstrapStatus
  reason?: string
  version?: string
  pluginRoot?: string
}

const PLUGIN_ID = 'aiko-code@aiko-code'

/**
 * Locate the bundled aiko-code plugin source root inside the running package.
 * Mirrors the resolution logic in src/skills/bundled/aikoCodeHarness.ts so
 * src and dist layouts both work.
 */
function resolveBundledPluginRoot(): string | undefined {
  const candidates: string[] = []
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(
      resolve(here, '..', 'plugins', 'bundled', 'aiko-code'),
      resolve(here, '..', '..', 'plugins', 'bundled', 'aiko-code'),
      resolve(here, '..', '..', 'plugins', 'aiko-code'),
      resolve(here, 'plugins', 'aiko-code'),
    )
  } catch {}
  for (const c of candidates) {
    if (existsSync(resolve(c, '.claude-plugin', 'plugin.json'))) return c
  }
  return undefined
}

function readPluginVersion(pluginRoot: string): string | undefined {
  try {
    const raw = readFileSync(
      resolve(pluginRoot, '.claude-plugin', 'plugin.json'),
      'utf8',
    )
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version
  } catch {
    return undefined
  }
}

/**
 * Idempotent startup bootstrap. Registers the bundled aiko-code plugin in
 * the user's installed plugins manifest and ensures it is enabled in their
 * global settings, so /guide and /taste surface as plugin commands.
 *
 * In-place install: installPath points at the bundled plugin root inside
 * the running package — no copy step, no concurrency window.
 *
 * Best-effort: never throws. Respects AIKO_SKIP_PLUGIN_BOOTSTRAP=1 opt-out.
 * Never re-enables a plugin the user has explicitly disabled (enabled:false).
 *
 * Heavy plugin/settings modules are loaded via dynamic import so this file
 * is cheap to require in unit tests without dragging the settings graph.
 */
export async function ensureAikoPluginInstalled(): Promise<BootstrapResult> {
  if (process.env.AIKO_SKIP_PLUGIN_BOOTSTRAP === '1') {
    return { status: 'skipped', reason: 'AIKO_SKIP_PLUGIN_BOOTSTRAP=1' }
  }

  const pluginRoot = resolveBundledPluginRoot()
  if (!pluginRoot) {
    return { status: 'skipped', reason: 'bundled plugin root not found' }
  }

  const version = readPluginVersion(pluginRoot)
  if (!version) {
    return { status: 'skipped', reason: 'plugin.json unreadable' }
  }

  try {
    const [
      { addInstalledPlugin, loadInstalledPluginsFromDisk },
      { getInitialSettings, updateSettingsForSource },
    ] = await Promise.all([
      import('../utils/plugins/installedPluginsManager.js'),
      import('../utils/settings/settings.js'),
    ])

    const v2 = safeCall(() => loadInstalledPluginsFromDisk())
    const installations = v2?.plugins?.[PLUGIN_ID] ?? []
    const existing = installations.find(
      e => e.scope === 'user' && !e.projectPath,
    )
    const sameVersion = existing?.version === version
    const samePath = existing?.installPath === pluginRoot
    const alreadyOk = Boolean(sameVersion && samePath)

    if (!alreadyOk) {
      addInstalledPlugin(
        PLUGIN_ID,
        {
          version,
          installedAt: existing?.installedAt ?? new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          installPath: pluginRoot,
        },
        'user',
      )
    }

    // Schema: enabledPlugins is Record<string, boolean | string[]> per
    // src/utils/settings/types.ts. `false` means user-disabled; `true`
    // means enabled; a string[] is a version-constraint extended form.
    const settings = safeCall(() => getInitialSettings()) as
      | { enabledPlugins?: Record<string, boolean | string[]> }
      | undefined
    const currentValue = settings?.enabledPlugins?.[PLUGIN_ID]
    const userDisabled = currentValue === false
    if (userDisabled) {
      return {
        status: alreadyOk ? 'unchanged' : 'installed',
        reason: 'user-disabled — manifest updated, enabled flag respected',
        version,
        pluginRoot,
      }
    }

    const alreadyEnabled = currentValue === true
    if (!alreadyEnabled) {
      const { error } = updateSettingsForSource('userSettings', {
        enabledPlugins: { [PLUGIN_ID]: true },
      } as never)
      if (error) {
        return {
          status: 'error',
          reason: `enable failed: ${error.message}`,
          version,
          pluginRoot,
        }
      }
    }

    return {
      status: alreadyOk && alreadyEnabled
        ? 'unchanged'
        : existing
          ? 'updated'
          : 'installed',
      version,
      pluginRoot,
    }
  } catch (err) {
    return {
      status: 'error',
      reason: err instanceof Error ? err.message : String(err),
      version,
      pluginRoot,
    }
  }
}

function safeCall<T>(fn: () => T | undefined): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}
