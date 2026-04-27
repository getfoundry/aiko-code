/**
 * Aiko Code harness — native bundled skills + Stop hook.
 *
 * This bakes the 9-phase fractal development loop directly into the runtime,
 * not via the plugin system. At startup we:
 *   1. Resolve the bundled aiko-code plugin folder (ships under dist/plugins/aiko-code/).
 *   2. Register four slash commands (/loop, /cancel, /log, /steer) as bundled
 *      skills whose getPromptForCommand execs the corresponding bash script.
 *   3. Register the Stop hook directly via registerHookCallbacks so the loop
 *      auto-fires on every Stop without any /plugin install or toggle.
 */

import { execFile as execFileCb } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { registerHookCallbacks } from '../../bootstrap/state.js'
import type { PluginHookMatcher } from '../../utils/settings/types.js'
import { registerBundledSkill } from '../bundledSkills.js'

const execFile = promisify(execFileCb)

let registered = false

function aiko-codeRoot(): string | undefined {
  const candidates: string[] = []
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(
      resolve(here, '..', '..', 'plugins', 'bundled', 'aiko-code'), // src layout
      resolve(here, '..', '..', 'plugins', 'aiko-code'), // dist alt
      resolve(here, 'plugins', 'aiko-code'),
      resolve(here, '..', 'plugins', 'aiko-code'),
    )
  } catch {}
  try {
    const argvDir = dirname(process.argv[1] ?? '')
    if (argvDir) {
      candidates.push(
        resolve(argvDir, '..', 'dist', 'plugins', 'aiko-code'),
        resolve(argvDir, '..', 'lib', 'node_modules', 'aiko-code', 'dist', 'plugins', 'aiko-code'),
      )
    }
  } catch {}
  for (const c of candidates) {
    if (existsSync(resolve(c, 'core', 'loop.sh'))) return c
  }
  return undefined
}

async function runScript(
  root: string,
  script: string,
  args: string[],
): Promise<string> {
  try {
    const { stdout, stderr } = await execFile(
      'bash',
      [resolve(root, script), ...args],
      { maxBuffer: 4 * 1024 * 1024 },
    )
    return [stdout, stderr].filter(Boolean).join('\n').trim() || '(no output)'
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return (
      [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim() ||
      'aiko-code: script failed'
    )
  }
}

function tokenizeArgs(input: string): string[] {
  // Minimal POSIX-like split that respects single/double quotes. Good enough
  // for /loop "build a thing" --session foo style invocations.
  const out: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        buf += ch
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ' ' || ch === '\t') {
      if (buf) {
        out.push(buf)
        buf = ''
      }
    } else {
      buf += ch
    }
  }
  if (buf) out.push(buf)
  return out
}

export function registerFcodeHarness(): void {
  if (registered) return
  registered = true

  const root = aiko-codeRoot()
  if (!root) return

  // Native Stop hook — no plugin layer.
  const stopMatcher: PluginHookMatcher = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: `bash ${resolve(root, 'hooks', 'stop-hook.sh')}`,
      },
    ],
    pluginRoot: root,
    pluginName: 'aiko-code',
    pluginId: 'aiko-code@native',
  }
  registerHookCallbacks({ Stop: [stopMatcher] })

  registerBundledSkill({
    name: 'loop',
    description:
      'Start the Aiko Code 9-phase fractal development loop on a task. Stop hook auto-fires each phase.',
    argumentHint: 'TASK [--session NAME] [--north-star "<text>"]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/setup-loop.sh', tokens)
      return [
        {
          type: 'text',
          text: `aiko-code loop activated.\n\n${text}\n\nThe Stop hook will now fire each phase. Reply normally; phase 1 (Survey) prompt will arrive on next Stop.`,
        },
      ]
    },
  })

  registerBundledSkill({
    name: 'cancel',
    description:
      'Cancel a running Aiko Code loop session (or all). Teachings logs are preserved.',
    argumentHint: '[--session NAME | --all]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/cancel.sh', tokens)
      return [{ type: 'text', text }]
    },
  })

  registerBundledSkill({
    name: 'log',
    description:
      'Read back the teachings log from one or all Aiko Code loop sessions.',
    argumentHint: '[--session NAME | --all]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/log.sh', tokens)
      return [{ type: 'text', text }]
    },
  })

  registerBundledSkill({
    name: 'steer',
    description:
      'Re-aim the north star of a running Aiko Code loop session without restarting it.',
    argumentHint: '[--session NAME] "<new north star>"',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/steer.sh', tokens)
      return [{ type: 'text', text }]
    },
  })
}
