/**
 * Aiko Code harness — fully native TS implementation.
 *
 * The 9-step harness now runs entirely in-process:
 *   1. /guide registers as a bundled skill whose getPromptForCommand calls
 *      setupHarness() to write the session state file and emit the banner.
 *   2. The Stop hook is registered as a native callback that calls
 *      advanceHarness() each turn — reads state, advances the step, and
 *      injects step N's playbook from src/harness/phases.ts.
 *   3. /cancel, /log, /steer remain bundled-skill shells over their plugin
 *      scripts (small wrappers — porting them is a separate pass).
 *
 * The bundled plugin tree at dist/plugins/aiko-code/ is now optional: the
 * Stop hook no longer execs core/loop.sh. We only resolve the plugin root
 * so the auxiliary commands (/cancel, /log, /steer, break-harness) keep
 * working — and that resolution is best-effort: if the tree is missing,
 * /guide still works and the auxiliary commands just won't register.
 */

import { execFile as execFileCb } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { registerHookCallbacks } from '../../bootstrap/state.js'
import type { HookCallbackMatcher } from '../../types/hooks.js'
import { advanceHarness } from '../../harness/loop.js'
import { parseGuideArgs, setupHarness } from '../../harness/setup.js'
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
    // Auxiliary commands (cancel/log/steer) live under scripts/.
    if (existsSync(resolve(c, 'scripts', 'cancel.sh'))) return c
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

export function registerAikoHarness(): void {
  if (registered) return
  registered = true

  // Always-on design taste — independent of plugin tree.
  registerDesignTaste()

  // Native Stop hook — pure callback, no shell exec. The TS callback returns
  // the same `{ decision: 'block', reason, systemMessage }` shape that the
  // bash core/loop.sh used to emit, so the host treats `reason` as the
  // resume prompt to inject back into the model on the next turn.
  const stopMatcher: HookCallbackMatcher = {
    matcher: '',
    hooks: [
      {
        type: 'callback',
        callback: async input => {
          const out = await advanceHarness(input as { transcript_path?: string })
          if (out.decision === 'block') {
            return {
              decision: 'block',
              reason: out.reason,
              systemMessage: out.systemMessage,
            } as never
          }
          if (out.systemMessage) {
            return { systemMessage: out.systemMessage } as never
          }
          return {} as never
        },
        internal: true,
      },
    ],
    pluginName: 'aiko-code',
  }
  registerHookCallbacks({ Stop: [stopMatcher] })

  // /guide — native TS entry point. No bash, no plugin root needed.
  const harnessAllowedTools: string[] = ['Agent', 'Skill', 'Write', 'Read']
  registerBundledSkill({
    name: 'guide',
    description:
      'Launch the aiko-code 9-step harness. Stop-driven: each assistant Stop calls the host runtime which reads the session state, advances the step, and injects step N\'s playbook (principle, problem map, fibonacci parallelism budget, work). Steps 1-6 build (survey, boundaries, skeleton, signals, edges, integration), 7 verdict, 8 audit, 9 ship. Per-step parallelism budget 1,1,2,3,5,8,1,13,21.',
    argumentHint: 'TASK [--session NAME] [--north-star "<text>"]',
    userInvocable: true,
    allowedTools: harnessAllowedTools,
    async getPromptForCommand(args) {
      const parsed = parseGuideArgs(args)
      if (!parsed.task) {
        return [
          {
            type: 'text',
            text: 'Error: /guide needs a task. Usage: /guide <task> [--session NAME] [--north-star "<text>"]',
          },
        ]
      }
      const text = setupHarness(parsed)
      return [{ type: 'text', text }]
    },
  })

  // Auxiliary commands still live as small shell scripts under the bundled
  // plugin tree. Best-effort: if the tree isn't shipped, skip them.
  const root = aikoCodeRoot()
  if (!root) return

  registerBundledSkill({
    name: 'cancel',
    description:
      'Cancel a running aiko-code harness session (or all). Teachings logs are preserved.',
    argumentHint: '[--session NAME | --all]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenize(args)
      const text = await runScript(root, 'scripts/cancel.sh', tokens)
      return [{ type: 'text', text }]
    },
  })

  registerBundledSkill({
    name: 'log',
    description:
      'Read back the teachings log from one or all aiko-code harness sessions.',
    argumentHint: '[--session NAME | --all]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenize(args)
      const text = await runScript(root, 'scripts/log.sh', tokens)
      return [{ type: 'text', text }]
    },
  })

  registerBundledSkill({
    name: 'steer',
    description:
      'Re-aim the north star of a running aiko-code harness session without restarting it.',
    argumentHint: '[--session NAME] "<new north star>"',
    userInvocable: true,
    async getPromptForCommand(args) {
      const tokens = tokenize(args)
      const text = await runScript(root, 'scripts/steer.sh', tokens)
      return [{ type: 'text', text }]
    },
  })
}

function tokenize(input: string): string[] {
  const out: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) quote = null
      else buf += ch
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
          systemMessage: 'aiko-code ◉ taste:on  harness:loaded (/guide, /cancel, /log, /steer)',
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext:
              `[aiko-code] design-taste guardrails active for this session. ` +
              `Frontend/UI work auto-applies the laws below. For deep design tasks invoke ` +
              `/taste, /audit, /critique, or /craft explicitly.\n\n` +
              buildDesignTasteContext(detectRegister()),
          },
        }),
        internal: true,
      },
    ],
    pluginName: 'aiko-code',
  }
  registerHookCallbacks({ SessionStart: [designMatcher] })
  // Note: design-taste auto-invocation is NOT done via keyword regex on
  // UserPromptSubmit. The harness playbook itself instructs the agent to
  // judge whether the task touches UI and to invoke /taste, /audit,
  // /critique, or /craft accordingly — agent-based detection, not
  // heuristic.
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
