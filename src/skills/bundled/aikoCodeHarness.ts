/**
 * Aiko Code harness — native bundled skills + Stop hook.
 *
 * This bakes the 9-phase fractal development loop directly into the runtime,
 * not via the plugin system. At startup we:
 *   1. Resolve the bundled aiko-code plugin folder (ships under dist/plugins/aiko-code/).
 *   2. Register five slash commands (/auto, /loop, /cancel, /log, /steer) as bundled
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
import type { HookCallbackMatcher } from '../../types/hooks.js'
import type { PluginHookMatcher } from '../../utils/settings/types.js'
import { registerBundledSkill } from '../bundledSkills.js'

const execFile = promisify(execFileCb)

let registered = false

function aikoCodeRoot(): string | undefined {
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
  // for /auto "build a thing" --session foo style invocations.
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

export function registerAikoHarness(): void {
  if (registered) return
  registered = true

  const root = aikoCodeRoot()
  if (!root) return

  // Baked-in design taste — active for every session.
  registerDesignTaste()

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

  // /auto — friendly entry point for the fractal harness
  registerBundledSkill({
    name: 'auto',
    description:
      'Start the 9-phase fractal dev loop — surveys, builds, ships incrementally with parallelism and subagent verification.',
    argumentHint: 'TASK [--session NAME] [--north-star "<text>"]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/setup-loop.sh', tokens)
      return [
        {
          type: 'text',
          text: `Auto mode activated — the 9-phase fractal development loop is now running.\n\n${text}\n\nEach Stop advances the loop one phase. Use /cancel to stop, /log to read the teachings, /steer to re-aim.`,
        },
      ]
    },
  })

  // /loop is an alias for /auto — same harness, same behavior.
  registerBundledSkill({
    name: 'loop',
    description:
      'Start the Aiko Code 9-phase fractal development loop on a task. Stop hook auto-fires each phase. (Alias for /auto.)',
    argumentHint: 'TASK [--session NAME] [--north-star "<text>"]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenizeArgs(args)
      const text = await runScript(root, 'scripts/setup-loop.sh', tokens)
      return [
        {
          type: 'text',
          text: `${text}\n\nThe Stop hook will now fire each phase. Reply normally; phase 1 (Survey) prompt will arrive on next Stop.`,
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

/**
 * Register the design-taste SessionStart hook.
 *
 * Bakes design intelligence from Impeccable and taste-skill directly into
 * the harness so every session applies impeccable frontend quality — no
 * manual `/impeccable` skill invocation needed.
 */
function registerDesignTaste(): void {
  const designMatcher: HookCallbackMatcher = {
    matcher: '',
    hooks: [
      {
        type: 'callback',
        callback: async () => ({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: buildDesignTasteContext(detectRegister()),
          },
        }),
        internal: true,
      },
    ],
    pluginName: 'aiko-code',
  }
  registerHookCallbacks({ SessionStart: [designMatcher] })
}

// ---------------------------------------------------------------------------
// Design intelligence — merged from Impeccable + taste-skill
// ---------------------------------------------------------------------------

function buildDesignTasteContext(register: 'brand' | 'product'): string {
  const registerBlock =
    register === 'brand' ? BRAND_REGISTER : PRODUCT_REGISTER

  return `# Design Quality — Active Guidelines

## Shared Design Laws (always apply)
### Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Never use \x23000 or \x23fff. Tint every neutral toward brand hue.
- Pick color strategy: Restrained / Committed / Full palette / Drenched.
- OKLCH-Only rule: for new colors, use OKLCH; hex sRGB only for inherited colors.
- Six rules:
  1. Reduce chroma as lightness approaches 0 or 100.
  2. Tint every neutral slightly toward the brand hue.
  3. Never derive lightness from a chromatic color.
  4. No alpha on backgrounds (hard to read on user backgrounds).
  5. No alpha on text (chroma bleeds through).
  6. No palette of equal-chroma swatches.

### Theme
- Pick a physical scene (studio lighting, warm evening, overcast daylight, etc.), not brand defaults.
- Don't combine dark backgrounds with pure black or pure white text. Use the scene's lightness.
- Match warmth to lighting: daylight → neutral; warm light → warm neutrals; cool light → cool neutrals.

### Typography
- Cap body line length at 65–75ch.
- Hierarchy through scale (≥1.25 ratio) + weight contrast + spacing.
- No Inter for brand/creative work. Force unique character.
- System fonts for product UI. No serif on dashboards.

### Layout
- Vary spacing for rhythm. Same padding = monotony.
- Cards only when truly the best affordance. Never nest cards.
- Don't wrap everything in a container.
- No identical card grids (3 equal cards = banned).
- Grid over flex-math: CSS Grid for reliable structures.

### Motion
- Duration: 100-150ms (feedback), 200-300ms (state), 300-500ms (layout), 500-800ms (entrance).
- Easing: ease-out-quart / quint / expo. No bounce, no elastic.
- Only animate transform + opacity. Never layout properties.
- 80ms threshold for perceived instantaneity.

### Absolute Bans
- Side-stripe borders (border-left/right >1px as colored accent)
- Gradient text (background-clip: text with gradient)
- Glassmorphism as default (blurred translucent cards)
- Hero-metric template (big number + small label + stats)
- Identical card grids
- Modal as first thought

### Copy
- No em dashes. Use commas, colons, semicolons, periods, parentheses.
- No restated headings. Every word earns its place.
- No filler words: "seamless", "unleash", "next-gen", "elevate".
- No generic names: "John Doe", "Sarah Chan". Creative, realistic.
- No fake numbers: 99.99%, 50%. Organic, messy data.

### AI Slop Test
- If someone could say "AI made this" without doubt, it failed.
- No training-data reflexes: "finance → navy + gold", "healthcare → white + teal".
- Name the aesthetic lane before committing.
- Brand: be distinctive, risk strangeness. Product: earn familiarity from category leaders.

## Register: ${register === 'brand' ? 'Brand' : 'Product'}
${registerBlock}

## Cognitive Load Guardrails
- Working memory rule: ≤4 items in any decision point.
- Chunking: group related items. Visual proximity = grouping.
- Progressive disclosure: show what's needed now, hide the rest.
- 8 common violations:
  1. Overloading nav (>5 items): chunk with separators.
  2. Unlabeled icons: add tooltips.
  3. Too many CTAs: one primary, max 2 secondary.
  4. Dense forms: use progressive disclosure.
  5. Cluttered dashboards: one widget per task.
  6. Too many colors: 1 accent + 1 neutral hierarchy.
  7. Dense data tables: group by category + sticky headers.
  8. Overlapping modals: use steps or drawers.

## Technical Directives
- Tailwind for utility CSS. RSC safety: isolate client components in their own files.
- Icons: @phosphor-icons or @radix-ui/react-icons. No emoji for UI actions.
- Viewport: min-h-[100dvh] not h-screen. Content should overflow scroll, not get clipped.
- Z-index: 3 max (base, elevated, overlay). Use CSS anchor positioning for dropdowns.
- Hardware acceleration: only transform + opacity. Use will-change sparingly.
`;
}

const BRAND_REGISTER = `
- **Identity**: marketing, landing pages, portfolios, creative work
- **Design traits**: distinctive, expressive, risk-taking, opinionated
- **Typography**: unique fonts, dramatic scale, serif + sans-serif pairing
- **Color**: rich palettes, bold accents, brand personality
- **Layout**: editorial, asymmetric, varied rhythm, creative grids
- **Motion**: dramatic entrances, page transitions, scroll-driven
- **Do**: be bold, take risks, show personality, push boundaries
- **Don't**: default to familiarity, be safe, follow patterns blindly
- **Copy**: voice-driven, brand personality, storytelling
- **Reference**: Stripe, Linear, Ramotion, Framer, Vercel, Shopify`

const PRODUCT_REGISTER = `
- **Identity**: dashboards, admin panels, tools, applications, settings
- **Design traits**: familiar, consistent, task-focused, efficient
- **Typography**: system fonts, clear hierarchy, readable at scale
- **Color**: semantic colors (success/warning/error), muted accents
- **Layout**: structured, predictable, data-dense, grid-aligned
- **Motion**: subtle, functional, instant feedback, no layout shifts
- **Do**: follow category leaders (Linear, Notion, Stripe), prioritize function
- **Don't**: introduce novelty for its own sake, distract from tasks
- **Copy**: clear, concise, action-oriented, minimal decoration
- **Reference**: Linear, Notion, Raycast, Vercel, Stripe Dashboard, GitHub`;

function detectRegister(): 'brand' | 'product' {
  // Simple keyword-based detection
  const brandKeywords = ['landing', 'page', 'marketing', 'portfolio', 'creative',
    'brand', 'design', 'showcase', 'agency', 'agency', 'personal', 'resume',
    'blog', 'newsletter', 'saas', 'startup', 'pitch', 'demo', 'splash',
    'website', 'web', 'frontpage', 'hero', 'product page', 'marketing']
  const productKeywords = ['dashboard', 'admin', 'panel', 'tool', 'app',
    'application', 'settings', 'config', 'system', 'scaffold', 'CLI',
    'infra', 'devtools', 'developer tools', 'management', 'crm', 'erp']

  for (const kw of productKeywords) {
    if (productKeywords.includes(kw)) {
      // Check if task contains product cues — simplified: default to product for
      // most dev tasks, brand only for explicitly creative/landing pages
    }
  }

  return 'product'
}
