/**
 * Built-in Plugin Initialization
 *
 * Aiko Code bakes its 9-phase fractal loop in natively (Stop hook + slash commands)
 * via src/skills/bundled/aiko-codeHarness.ts — not as a plugin. So this file is
 * intentionally empty. Add registerBuiltinPlugin() calls here only for things
 * users should be able to toggle in the /plugin UI.
 */
export function initBuiltinPlugins(): void {
  // intentionally empty
}
