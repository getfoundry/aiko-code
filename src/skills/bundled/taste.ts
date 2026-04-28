import { registerBundledSkill } from '../bundledSkills.js'

const LAWS_MD = `# Design Taste — Active Laws

Synthesized from \`impeccable.style/docs\` (the impeccable design loop) and
the \`Leonxlnx/taste-skill\` high-agency frontend skill. These are *active*
rules applied to every UI you generate or review — not aspirational guidance.

## 0. The Loop
Design is iterative. Four phases:
1. **Start** — blank file → designed feature (\`teach\` → \`shape\` → \`craft\`).
2. **Iterate** — refine via named edits (typeset, layout, colorize, animate).
3. **Polish** — pre-ship gates (\`audit\`, \`clarify\`, \`harden\`).
4. **Maintain** — prevent design debt (\`extract\`, \`document\`).

Pick a register first: **brand** (design IS the product, risk strangeness) or
**product** (design serves the task, earn familiarity from category leaders).
The same rules apply differently in each register.

## 1. Color (OKLCH only for new colors)
- Use OKLCH. Reduce chroma as lightness → 0 or 100.
- Never \`#000\` or \`#fff\`. Tint every neutral toward the brand hue.
- Pick a strategy: **Restrained / Committed / Full palette / Drenched**.
- No alpha on backgrounds (unreadable on user backgrounds).
- No alpha on text (chroma bleeds through).
- No palette of equal-chroma swatches.
- Max 1 accent. Saturation < 80%.
- BANNED: AI purple/violet gradients, cyan-on-dark, neon glows.
- Don't derive lightness from a chromatic color.

## 2. Theme (pick a physical scene)
- Studio lighting / warm evening / overcast daylight — not brand defaults.
- Dark backgrounds: never with pure black or pure white text. Use scene lightness.
- Match warmth to lighting (daylight → neutral, warm → warm neutrals, cool → cool).
- Don't default to dark mode for safety. It's a retreat.

## 3. Typography
- Body line length: 65–75ch. Hard cap.
- Hierarchy via **scale (≥1.25 ratio) + weight + spacing** — not size alone.
- BANNED for brand/creative: Inter, Roboto, Open Sans, Lato, Montserrat, Arial.
- Brand register: Geist, Outfit, Cabinet Grotesk, Satoshi.
- Product UI: system fonts. No serif on dashboards.
- Display headlines: \`text-4xl md:text-6xl tracking-tighter leading-none\`.
- Body: \`text-base leading-relaxed max-w-[65ch]\`. Line-height ≥ 1.3.
- No all-caps body text. No gradient text on headings.
- No monospace as "technical" shorthand — earn it.

## 4. Layout
- Vary spacing for rhythm. Same padding everywhere = monotony.
- Cards only when elevation communicates hierarchy. Never nest cards.
- Don't wrap everything in a container.
- BANNED: 3 equal cards horizontally. Use zig-zag, asymmetric grid, or
  horizontal scroll instead.
- BANNED: hero-metric template (big number + small label + 3 stats).
- Grid over flex-math. \`grid-cols-3\` not \`w-[calc(33%-1rem)]\`.
- Asymmetric beats centered when LAYOUT_VARIANCE > 4.
- Mobile override: any asymmetric layout above \`md:\` MUST collapse to
  \`w-full px-4\` single-column below 768px.
- Viewport: \`min-h-[100dvh]\`, never \`h-screen\` (iOS Safari jump).

## 5. Materiality
- Glassmorphism is not a default. Use only when solving a real layering
  problem — and add a 1px inner border + inset shadow for edge refraction.
- Tint shadows toward the background hue.
- BANNED: side-stripe accent borders (>1px colored border-left/right). The
  most recognizable AI tell.
- BANNED: thick accent borders on rounded cards (corners clash).
- BANNED: rounded rectangles with generic drop shadows. Forgettable.
- BANNED: sparklines as decoration. Charts must convey info.

## 6. Motion
- Durations: 100–150ms (feedback), 200–300ms (state), 300–500ms (layout),
  500–800ms (entrance). 80ms threshold for perceived instantaneity.
- Easing: ease-out-quart / quint / expo. **No bounce, no elastic.**
- Animate **transform + opacity only**. Never \`top/left/width/height/padding/margin\`.
- Spring physics for premium feel: \`stiffness: 100, damping: 20\`.
- Perpetual micro-interactions (Pulse, Float, Shimmer) only when justified —
  never inside scrolling containers (continuous GPU repaints).
- Scroll-bound animation: never \`window.addEventListener('scroll')\`. Use
  Framer Motion hooks or \`IntersectionObserver\`.

## 7. Cognitive Load Guardrails
- ≤4 items per decision point (working memory limit).
- Chunk by visual proximity. Progressive disclosure, not everything at once.
- Eight common violations:
  1. Nav with >5 items — chunk with separators.
  2. Unlabeled icons — add tooltips.
  3. Many CTAs — one primary, ≤2 secondary.
  4. Dense forms — progressive disclosure.
  5. Cluttered dashboards — one widget per task.
  6. Too many colors — 1 accent + 1 neutral hierarchy.
  7. Dense tables — group by category, sticky headers.
  8. Stacked modals — use steps or drawers.

## 8. Absolute Bans
- Side-stripe borders as colored accent.
- Gradient text on headings.
- Glassmorphism as default.
- Hero-metric template.
- Identical card grids (3 equal cards).
- Modal as first thought (lazy default).
- Pure \`#000000\` backgrounds.
- Custom mouse cursors.
- \`h-screen\` on hero sections.
- Centered hero text over dark image (do asymmetric instead).
- Monospace as "I'm technical" shorthand.
- Mocking critical functionality on mobile.

## 9. Copy
- No em dashes. Use commas, colons, semicolons, periods, parentheses.
- No restated headings. Every word earns its place.
- BANNED filler: "seamless", "unleash", "next-gen", "elevate", "supercharge".
- BANNED generic names: "John Doe", "Sarah Chan", "Jack Su". Invent realistic ones.
- BANNED fake numbers: 99.99%, 50%, 1234567. Use organic data: 47.2%, +1 (312) 847-1928.
- BANNED startup-slop names: "Acme", "Nexus", "SmartFlow". Be contextual.
- Form labels above inputs. Helper text in markup. Errors below.

## 10. Technical Directives
- React/Next: default to RSC. Isolate \`'use client'\` to leaf components.
- Global state only inside Client Components. Wrap providers in \`"use client"\`.
- Tailwind for ~90% of styles. Lock to v3 or v4 — never mix syntax.
- v4: use \`@tailwindcss/postcss\`, not \`tailwindcss\` plugin.
- Icons: \`@phosphor-icons/react\` or \`@radix-ui/react-icons\`. Never emoji.
- Standardize \`strokeWidth\` (1.5 or 2.0).
- Z-index: 3 layers max (base, elevated, overlay).
- Hardware accel: only \`transform\` + \`opacity\`. \`will-change\` sparingly.
- Verify dependencies in \`package.json\` before importing. Output install
  command if missing — never assume a library exists.
- shadcn/ui: never default state. Customize radii, colors, shadows.
- Placeholders: \`https://picsum.photos/seed/{seed}/800/600\`. Never Unsplash.

## 11. Required Interactive States
LLMs default to "static success." You MUST implement:
- **Loading** — skeleton matching layout, not generic spinner.
- **Empty** — composed empty states showing how to populate.
- **Error** — inline, near the field that failed.
- **Tactile** — \`:active\` → \`-translate-y-[1px]\` or \`scale-[0.98]\`.

## 12. The AI Slop Test
If a stranger could say "AI made this" without doubt — it failed.
- No training-data reflexes (finance → navy+gold, healthcare → white+teal).
- Name the aesthetic lane before committing.
- Ship it only if it reads as **intentional**, not generic.

## 13. Pre-Flight Checklist
- [ ] Mobile collapses cleanly (\`w-full px-4 max-w-7xl mx-auto\`).
- [ ] Full-height uses \`min-h-[100dvh]\`, not \`h-screen\`.
- [ ] \`useEffect\` animations have cleanup.
- [ ] Empty / loading / error states present.
- [ ] Cards omitted in favor of spacing where possible.
- [ ] Perpetual animations isolated in their own memoized Client Component.
- [ ] One primary CTA visible per screen.
- [ ] Body line length ≤75ch.
- [ ] No banned fonts, colors, layouts, or filler copy.
`

const SLOP_MD = `# AI Slop Catalogue — 37 Banned Patterns

Concrete, scannable list. Used by \`/audit\` and \`/critique\` for detection.
Adapted from \`impeccable.style/slop\`.

## Visual Details
1. **Border accent on rounded element** — thick accent border on rounded card; corners clash.
2. **Glassmorphism everywhere** — blur/glass/glow as decoration, not solving layering.
3. **Modal-by-reflex** — modal as first interaction default. Lazy.
4. **Rounded rectangle + generic drop shadow** — safest, most forgettable shape on the web.
5. **Side-tab accent border** — colored border on one side of card. The most recognizable AI tell.
6. **Sparklines as decoration** — tiny charts that look smart but say nothing.

## Typography
7. **Flat type hierarchy** — sizes too close together; no clear hierarchy.
8. **Icon tile stacked above heading** — small rounded-square icon container above heading. Universal feature-card template.
9. **Monospace as "technical" shorthand** — earn it; don't reach for it.
10. **Overused font** — Inter, Roboto, Open Sans, Lato, Montserrat, Arial.
11. **Single font family for everything** — no contrast.
12. **All-caps body text** — long passages in uppercase are unreadable.

## Color & Contrast
13. **AI color palette** — purple/violet gradients, cyan-on-dark.
14. **Dark mode + glowing accents** — colored box-shadow glows on dark = AI default.
15. **Dark mode for safety** — retreat from intentional design.
16. **Gradient text** — decorative, common AI tell on headings.
17. **Gray text on colored background** — washed out.
18. **Pure black background** — \`#000000\` is harsh.

## Layout & Space
19. **Everything centered** — center-aligned everything. Asymmetric reads more designed.
20. **Hero metric layout** — big number + small label + three supporting stats + gradient accent.
21. **Identical card grids** — same-sized cards with icon+heading+text repeated endlessly.
22. **Monotonous spacing** — same padding everywhere, no rhythm.
23. **Nested cards** — cards inside cards = visual noise.
24. **Wrapping everything in cards** — not every block needs a border.
25. **Line length too long** — wider than ~80ch unreadable.

## Motion
26. **Bounce/elastic easing** — feels dated. Real objects decelerate smoothly.
27. **Layout property animation** — animating width/height/padding/margin causes thrash.

## Interaction
28. **Every button is primary** — when all are equal, none reads as the action.
29. **Redundant info** — intros restating the heading; section labels repeating page title.

## Responsive
30. **Amputating features on mobile** — hiding critical functionality because it's inconvenient.

## General Quality
31. **Cramped padding** — text too close to container edge.
32. **Justified text** — without hyphenation creates uneven word spacing.
33. **Low contrast text** — fails WCAG AA.
34. **Skipped heading level** — h1 → h3 with no h2.
35. **Tight line height** — below 1.3× font size.
36. **Tiny body text** — below 12px.
37. **Wide letter spacing on body text** — above 0.05em disrupts character groups.
`

const FILES: Record<string, string> = {
  'laws.md': LAWS_MD,
  'slop.md': SLOP_MD,
}

const TASTE_PROMPT = `# /taste — Design Taste Engine

You are operating as a senior UI/UX engineer. The active design laws live in
\`laws.md\` (color, theme, type, layout, materiality, motion, cognitive load,
copy, technical, slop test). The 37-pattern slop catalogue lives in
\`slop.md\`. Read both before producing or reviewing UI. They override your
default LLM design biases.

## How to use this skill

1. **Identify the register first.** Brand (design IS the product) or product
   (design serves the task). The same laws apply differently in each.
2. **Pick a strategy.** Color: Restrained / Committed / Full palette / Drenched.
   Lighting scene: studio / warm evening / overcast daylight. Name it before
   you write CSS.
3. **Apply the laws as you generate.** Don't generate first, audit second.
   The laws are a constraint set, not a critique pass.
4. **Run the pre-flight checklist** in \`laws.md\` §13 before declaring done.

## When to delegate to a sibling skill

- \`/audit\` — technical quality scan (a11y, perf, theming, responsive,
  anti-patterns). Documents issues; doesn't fix them.
- \`/critique\` — second-opinion review on completed work. Nielsen heuristics
  + slop detection. "Is this any good?"
- \`/craft\` — start from a blank file, code toward a concrete hi-fi reference.

## If the user passed an argument

Treat it as the focus area. Examples: "this hero section", "the dashboard
cards", "color only". Apply the relevant slice of the laws and skip the rest.
`

const AUDIT_PROMPT = `# /audit — Technical Design Audit

Run a systematic technical quality scan across five dimensions and produce a
severity-prioritized report. **Document only — don't fix.** Route fixes to
\`/taste\`, \`/critique\`, or specialized commands.

Reference: \`laws.md\` for the rules being checked, \`slop.md\` for AI-tell
patterns to flag.

## Dimensions (score 0–4 each, total /20)

1. **Accessibility** — contrast, ARIA, keyboard nav, semantic HTML, alt text,
   form labels. Anchor to WCAG AA.
2. **Performance** — layout thrashing, expensive animations, missing lazy
   loading, bundle bloat, render inefficiencies, hardware-accel violations.
3. **Theming** — hard-coded colors, dark-mode gaps, token inconsistency,
   theme-switch failures, OKLCH adherence.
4. **Responsive** — fixed widths, touch targets <44×44px, horizontal overflow,
   text scaling, missing breakpoints, \`h-screen\` usage.
5. **Anti-Patterns** — every item from \`slop.md\` plus laws §8 absolute bans.

## Severity

- **P0** — blocks release (a11y violations, broken responsive, broken theme).
- **P1** — major, ship-blocking (slop tells, perf regressions on hot paths).
- **P2** — next cycle (cohesion issues, minor copy debt).
- **P3** — polish (spacing rhythm, micro-interaction gaps).

## Output

\`\`\`
DESIGN HEALTH: <score>/20
  A11y: <0-4>  Perf: <0-4>  Theming: <0-4>  Responsive: <0-4>  Anti-Patterns: <0-4>

ISSUES: <P0 count> P0 · <P1 count> P1 · <P2 count> P2 · <P3 count> P3

TOP 3–5 PROBLEMS
  1. [P0] <one-line summary> — <file:line> — fix via /taste
  ...

DETAILED FINDINGS (by severity)
  P0
    - <location> · <impact> · <law violated> · <recommended fix>
  P1
    ...
\`\`\`

## Scope

If the user passed a path or component name, scan only that. Otherwise scan
changed files (\`git diff\`) or the most recently edited UI files in scope.
`

const CRITIQUE_PROMPT = `# /critique — Honest Second Opinion

Run when a UI is functionally done and the user wants to know if it reads as
intentional or as AI slop. **Two independent assessments**, kept isolated to
prevent bias.

Reference: \`laws.md\` (Nielsen heuristics + design laws), \`slop.md\`
(detection catalogue).

## Assessment A — Design Review

Examine source + rendered output for:
- AI slop tells from \`slop.md\` (37 patterns).
- Visual hierarchy and information architecture.
- Cognitive load (laws §7 — flag any decision point with >4 items as critical).
- Emotional journey (peak-end rule, anxiety spikes, dead-ends).
- Nielsen's 10 heuristics, each scored 0–4.

## Assessment B — Pattern Detection

Independently scan for concrete anti-patterns. Don't share Assessment A's
output with this pass — keep them isolated. Cross-reference at the end.

## Output

\`\`\`
DESIGN HEALTH SCORE
  Nielsen: <0-4 per heuristic, total /40>
  Slop: <count of patterns detected from slop.md>

OVERALL IMPRESSION
  <one-paragraph gut reaction>
  <single biggest opportunity>

WHAT'S WORKING
  - 2–3 specific strengths

PRIORITY ISSUES
  P0/P1/P2/P3 — what / why / fix / suggested command

PERSONA RED FLAGS
  - 2–3 user types with specific breakage points

QUESTIONS TO CONSIDER
  - 2–3 provocative design questions
\`\`\`

## Constraints

- Run only on completed work. Incomplete designs score poorly because they're
  unfinished, not bad.
- Heuristic scores are diagnostic, not grades.
- Prioritize ruthlessly — don't list 20 issues, list the 5 that matter.
`

const CRAFT_PROMPT = `# /craft — Code Toward a Concrete Reference

The premise: "Craft codes toward a concrete image, not an abstract brief.
That is the step change."

Reference: \`laws.md\` for the active rule set.

## Phase 1 — Establish the reference

Before writing code, state in plain text:
1. **Register** — brand or product?
2. **Lighting scene** — studio / warm evening / overcast daylight / etc.?
3. **Color strategy** — Restrained / Committed / Full palette / Drenched?
4. **Type pairing** — display + body + (optional) mono. No banned fonts.
5. **Layout archetype** — asymmetric hero / bento / split-screen / etc. No
   identical card grids.
6. **One adjective** the design must read as. "Quiet", "confident", "playful".
   If you can't pick one, the brief isn't ready.

If the user gave you a screenshot or visual reference, anchor to it. Otherwise
declare your aesthetic lane out loud — "this will read as 1990s broadsheet
newspaper", "this will read as Vercel-core meets Dribbble-clean" — and commit.

## Phase 2 — Generate

Apply \`laws.md\` as a constraint set during generation. In particular:
- OKLCH for new colors.
- \`min-h-[100dvh]\`, never \`h-screen\`.
- Grid over flex-math.
- Loading / empty / error states from the start, not as polish.
- Tactile feedback on every interactive element.
- One primary CTA visible per screen.

## Phase 3 — Pre-flight

Run laws §13 checklist. If anything fails, fix it before declaring done.
Don't ship and audit after.

## If the argument is a path or component

Craft inside that scope. If it's a description ("a pricing page"), draft the
reference card first, then generate.
`

export function registerTasteSkill(): void {
  registerBundledSkill({
    name: 'taste',
    description:
      'Senior UI/UX engineer. Applies design laws (impeccable + taste-skill) to override default LLM UI biases.',
    aliases: ['design'],
    userInvocable: true,
    files: FILES,
    async getPromptForCommand(args) {
      let prompt = TASTE_PROMPT
      if (args) prompt += `\n\n## Focus\n\n${args}`
      return [{ type: 'text', text: prompt }]
    },
  })

  registerBundledSkill({
    name: 'audit',
    description:
      'Run a technical design audit across a11y, performance, theming, responsive, and anti-patterns. Documents issues; does not fix.',
    userInvocable: true,
    files: FILES,
    async getPromptForCommand(args) {
      let prompt = AUDIT_PROMPT
      if (args) prompt += `\n\n## Scope\n\n${args}`
      return [{ type: 'text', text: prompt }]
    },
  })

  registerBundledSkill({
    name: 'critique',
    description:
      'Honest second-opinion review on completed UI — Nielsen heuristics plus AI-slop detection.',
    userInvocable: true,
    files: FILES,
    async getPromptForCommand(args) {
      let prompt = CRITIQUE_PROMPT
      if (args) prompt += `\n\n## Target\n\n${args}`
      return [{ type: 'text', text: prompt }]
    },
  })

  registerBundledSkill({
    name: 'craft',
    description:
      'Start from a blank file. Code toward a concrete hi-fi reference under the design laws.',
    userInvocable: true,
    files: FILES,
    async getPromptForCommand(args) {
      let prompt = CRAFT_PROMPT
      if (args) prompt += `\n\n## Brief\n\n${args}`
      return [{ type: 'text', text: prompt }]
    },
  })
}
