# Design Quality — Active Guidelines

## Shared Design Laws (always apply)
### Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Never use #000 or #fff. Tint every neutral toward brand hue.
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
