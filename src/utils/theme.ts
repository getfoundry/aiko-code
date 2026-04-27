import chalk, { Chalk } from 'chalk'
import { env } from './env.js'

export type Theme = {
  autoAccept: string
  bashBorder: string
  aiko: string
  aikoShimmer: string // Lighter version of aiko color for shimmer effect
  aikoBlue_FOR_SYSTEM_SPINNER: string
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: string
  permission: string
  permissionShimmer: string // Lighter version of permission color for shimmer effect
  planMode: string
  ide: string
  promptBorder: string
  promptBorderShimmer: string // Lighter version of promptBorder color for shimmer effect
  text: string
  inverseText: string
  inactive: string
  inactiveShimmer: string // Lighter version of inactive color for shimmer effect
  subtle: string
  suggestion: string
  remember: string
  background: string
  // Semantic colors
  success: string
  error: string
  warning: string
  merged: string
  warningShimmer: string // Lighter version of warning color for shimmer effect
  // Diff colors
  diffAdded: string
  diffRemoved: string
  diffAddedDimmed: string
  diffRemovedDimmed: string
  // Word-level diff highlighting
  diffAddedWord: string
  diffRemovedWord: string
  // Agent colors
  red_FOR_SUBAGENTS_ONLY: string
  blue_FOR_SUBAGENTS_ONLY: string
  green_FOR_SUBAGENTS_ONLY: string
  yellow_FOR_SUBAGENTS_ONLY: string
  purple_FOR_SUBAGENTS_ONLY: string
  violet_FOR_SUBAGENTS_ONLY: string
  pink_FOR_SUBAGENTS_ONLY: string
  cyan_FOR_SUBAGENTS_ONLY: string
  // Grove colors
  professionalBlue: string
  // Chrome colors
  chromeYellow: string
  // TUI V2 colors
  clawd_body: string
  clawd_background: string
  userMessageBackground: string
  userMessageBackgroundHover: string
  /** Message-actions selection. Cool shift toward `suggestion` blue; distinct from default AND userMessageBackground. */
  messageActionsBackground: string
  /** Text-selection highlight background (alt-screen mouse selection). Solid
   *  bg that REPLACES the cell's bg while preserving its fg — matches native
   *  terminal selection. Previously SGR-7 inverse (swapped fg/bg per cell),
   *  which fragmented badly over syntax highlighting. */
  selectionBg: string
  bashMessageBackgroundColor: string

  memoryBackgroundColor: string
  rate_limit_fill: string
  rate_limit_empty: string
  fastMode: string
  fastModeShimmer: string
  // Brief/assistant mode label colors
  briefLabelYou: string
  briefLabelaiko: string
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: string
  rainbow_violet: string
  rainbow_yellow: string
  rainbow_green: string
  rainbow_blue: string
  rainbow_indigo: string
  rainbow_violet: string
  rainbow_red_shimmer: string
  rainbow_violet_shimmer: string
  rainbow_yellow_shimmer: string
  rainbow_green_shimmer: string
  rainbow_blue_shimmer: string
  rainbow_indigo_shimmer: string
  rainbow_violet_shimmer: string
}

export const THEME_NAMES = [
  'dark',
  'light',
  'light-daltonized',
  'dark-daltonized',
  'light-ansi',
  'dark-ansi',
] as const

/** A renderable theme. Always resolvable to a concrete color palette. */
export type ThemeName = (typeof THEME_NAMES)[number]

export const THEME_SETTINGS = ['auto', ...THEME_NAMES] as const

/**
 * A theme preference as stored in user config. `'auto'` follows the system
 * dark/light mode and is resolved to a ThemeName at runtime.
 */
export type ThemeSetting = (typeof THEME_SETTINGS)[number]

/**
 * Light theme using explicit RGB values to avoid inconsistencies
 * from users' custom terminal ANSI color definitions
 */
const lightTheme: Theme = {
  autoAccept: 'rgb(60,200,120)', // Teal green
  bashBorder: 'rgb(140,80,230)', // Purple neon
  aiko: 'rgb(50,120,200)', // Electric blue brand
  aikoShimmer: 'rgb(100,160,230)', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'rgb(80,180,240)', // Brighter cyan-blue
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(130,200,245)', // Soft cyan shimmer
  permission: 'rgb(200,60,140)', // Magenta neon
  permissionShimmer: 'rgb(220,110,180)', // Light magenta shimmer
  planMode: 'rgb(60,200,120)', // Teal green
  ide: 'rgb(60,140,230)', // Sky blue neon
  promptBorder: 'rgb(100,140,200)', // Subtle blue-gray
  promptBorderShimmer: 'rgb(120,160,210)', // Lighter blue shimmer
  text: 'rgb(20,30,50)', // Cool dark
  inverseText: 'rgb(180,200,230)', // Cool white
  inactive: 'rgb(120,140,170)', // Cool gray
  inactiveShimmer: 'rgb(150,170,200)', // Lighter cool gray
  subtle: 'rgb(140,160,190)', // Dimmed blue-gray
  suggestion: 'rgb(140,80,230)', // Purple neon
  remember: 'rgb(140,80,230)', // Purple neon
  background: 'rgb(230,238,250)', // Light ice
  success: 'rgb(40,180,100)', // Neon green
  error: 'rgb(230,60,80)', // Neon red
  warning: 'rgb(240,160,30)', // Neon amber
  merged: 'rgb(50,120,200)', // Brand blue
  warningShimmer: 'rgb(250,190,80)', // Light amber shimmer
  diffAdded: 'rgb(50,180,100)', // Light neon green
  diffRemoved: 'rgb(200,60,80)', // Light neon red
  diffAddedDimmed: 'rgb(100,200,140)', // Medium green
  diffRemovedDimmed: 'rgb(180,100,110)', // Medium red
  diffAddedWord: 'rgb(40,180,100)', // Deep green
  diffRemovedWord: 'rgb(180,100,120)', // Deep red
  // Agent colors
  red_FOR_SUBAGENTS_ONLY: 'rgb(240,60,80)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(60,140,230)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(40,180,100)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(240,160,30)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(140,80,230)',
  violet_FOR_SUBAGENTS_ONLY: 'rgb(180,60,200)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(200,60,140)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(80,180,240)',
  // Grove colors
  professionalBlue: 'rgb(80,140,230)',
  // Chrome colors
  chromeYellow: 'rgb(240,160,30)',
  // TUI V2 colors
  clawd_body: 'rgb(50,120,200)', // Electric blue
  clawd_background: 'rgb(230,238,250)', // Light ice bg
  userMessageBackground: 'rgb(215, 228, 245)', // Ice surface
  userMessageBackgroundHover: 'rgb(200, 218, 240)', // Slightly darker
  messageActionsBackground: 'rgb(210, 224, 242)', // Subtle gray-blue
  selectionBg: 'rgb(80,140,220)', // Blue selection
  bashMessageBackgroundColor: 'rgb(220, 232, 248)', // Lighter ice tone

  memoryBackgroundColor: 'rgb(218, 230, 246)', // Light ice
  rate_limit_fill: 'rgb(200,60,140)', // Magenta neon
  rate_limit_empty: 'rgb(100,130,170)', // Dim blue-gray
  fastMode: 'rgb(50,120,200)', // Brand blue
  fastModeShimmer: 'rgb(100,160,230)', // Lighter blue shimmer
  // Brief/assistant mode
  briefLabelYou: 'rgb(80,160,230)', // Cool blue
  briefLabelaiko: 'rgb(50,120,200)', // Brand blue
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'rgb(240,60,80)',
  rainbow_violet: 'rgb(160,40,220)',
  rainbow_yellow: 'rgb(240,180,30)',
  rainbow_green: 'rgb(40,180,100)',
  rainbow_blue: 'rgb(60,120,230)',
  rainbow_indigo: 'rgb(100,60,220)',
  rainbow_violet: 'rgb(200,60,180)',
  rainbow_red_shimmer: 'rgb(255,120,130)',
  rainbow_violet_shimmer: 'rgb(200,130,245)',
  rainbow_yellow_shimmer: 'rgb(255,220,100)',
  rainbow_green_shimmer: 'rgb(100,210,140)',
  rainbow_blue_shimmer: 'rgb(120,170,245)',
  rainbow_indigo_shimmer: 'rgb(160,120,240)',
  rainbow_violet_shimmer: 'rgb(230,140,210)',
}

/**
 * Light ANSI theme using only the 16 standard ANSI colors
 * for terminals without true color support
 */
const lightAnsiTheme: Theme = {
  autoAccept: 'ansi:greenBright', // Teal green approx
  bashBorder: 'ansi:magentaBright', // Purple neon
  aiko: 'ansi:blueBright', // Electric blue
  aikoShimmer: 'ansi:blueBright', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'ansi:cyanBright', // Bright cyan-blue
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'ansi:cyanBright', // Soft cyan shimmer
  permission: 'ansi:magentaBright', // Magenta neon
  permissionShimmer: 'ansi:magentaBright', // Light magenta shimmer
  planMode: 'ansi:greenBright', // Teal green
  ide: 'ansi:cyanBright', // Sky blue neon
  promptBorder: 'ansi:whiteBright', // Subtle blue-gray
  promptBorderShimmer: 'ansi:whiteBright', // Lighter blue shimmer
  text: 'ansi:black',
  inverseText: 'ansi:whiteBright',
  inactive: 'ansi:blackBright',
  inactiveShimmer: 'ansi:whiteBright',
  subtle: 'ansi:whiteBright',
  suggestion: 'ansi:magentaBright', // Purple neon
  remember: 'ansi:magentaBright', // Purple neon
  background: 'ansi:white', // Light ice
  success: 'ansi:greenBright', // Neon green
  error: 'ansi:redBright', // Neon red
  warning: 'ansi:yellowBright', // Neon amber
  merged: 'ansi:blueBright', // Brand blue
  warningShimmer: 'ansi:yellowBright', // Light amber shimmer
  diffAdded: 'ansi:greenBright',
  diffRemoved: 'ansi:redBright',
  diffAddedDimmed: 'ansi:greenBright',
  diffRemovedDimmed: 'ansi:redBright',
  diffAddedWord: 'ansi:greenBright',
  diffRemovedWord: 'ansi:redBright',
  // Agent colors
  red_FOR_SUBAGENTS_ONLY: 'ansi:redBright',
  blue_FOR_SUBAGENTS_ONLY: 'ansi:cyanBright',
  green_FOR_SUBAGENTS_ONLY: 'ansi:greenBright',
  yellow_FOR_SUBAGENTS_ONLY: 'ansi:yellowBright',
  purple_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  violet_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  pink_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  cyan_FOR_SUBAGENTS_ONLY: 'ansi:cyanBright',
  // Grove colors
  professionalBlue: 'ansi:blueBright',
  // Chrome colors
  chromeYellow: 'ansi:yellowBright',
  // TUI V2 colors
  clawd_body: 'ansi:blueBright', // Electric blue
  clawd_background: 'ansi:white', // Light ice bg
  userMessageBackground: 'ansi:white', // Ice surface
  userMessageBackgroundHover: 'ansi:whiteBright', // Slightly darker
  messageActionsBackground: 'ansi:whiteBright', // Subtle gray-blue
  selectionBg: 'ansi:blueBright', // Blue selection
  bashMessageBackgroundColor: 'ansi:whiteBright', // Lighter ice tone

  memoryBackgroundColor: 'ansi:whiteBright', // Light ice
  rate_limit_fill: 'ansi:magentaBright', // Magenta neon
  rate_limit_empty: 'ansi:whiteBright', // Dim blue-gray
  fastMode: 'ansi:blueBright', // Brand blue
  fastModeShimmer: 'ansi:blueBright', // Lighter blue shimmer
  // Brief/assistant mode
  briefLabelYou: 'ansi:cyanBright', // Cool blue
  briefLabelaiko: 'ansi:blueBright', // Brand blue
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'ansi:redBright',
  rainbow_violet: 'ansi:magentaBright',
  rainbow_yellow: 'ansi:yellowBright',
  rainbow_green: 'ansi:greenBright',
  rainbow_blue: 'ansi:blueBright',
  rainbow_indigo: 'ansi:magentaBright',
  rainbow_violet: 'ansi:magentaBright',
  rainbow_red_shimmer: 'ansi:redBright',
  rainbow_violet_shimmer: 'ansi:magentaBright',
  rainbow_yellow_shimmer: 'ansi:yellowBright',
  rainbow_green_shimmer: 'ansi:greenBright',
  rainbow_blue_shimmer: 'ansi:blueBright',
  rainbow_indigo_shimmer: 'ansi:magentaBright',
  rainbow_violet_shimmer: 'ansi:magentaBright',
}

/**
 * Dark ANSI theme using only the 16 standard ANSI colors
 * for terminals without true color support
 */
const darkAnsiTheme: Theme = {
  autoAccept: 'ansi:greenBright', // Teal green
  bashBorder: 'ansi:magentaBright', // Purple neon
  aiko: 'ansi:blueBright', // Electric blue
  aikoShimmer: 'ansi:blueBright', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'ansi:cyanBright', // Brighter cyan-blue
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'ansi:cyanBright', // Soft cyan shimmer
  permission: 'ansi:magentaBright', // Magenta neon
  permissionShimmer: 'ansi:magentaBright', // Light magenta shimmer
  planMode: 'ansi:greenBright', // Teal green
  ide: 'ansi:cyanBright', // Sky blue neon
  promptBorder: 'ansi:whiteBright', // Subtle blue-gray
  promptBorderShimmer: 'ansi:whiteBright', // Lighter blue shimmer
  text: 'ansi:whiteBright',
  inverseText: 'ansi:black',
  inactive: 'ansi:white',
  inactiveShimmer: 'ansi:whiteBright',
  subtle: 'ansi:whiteBright',
  suggestion: 'ansi:magentaBright', // Purple neon
  remember: 'ansi:magentaBright', // Purple neon
  background: 'ansi:black', // Deep navy
  success: 'ansi:greenBright', // Neon green
  error: 'ansi:redBright', // Neon red
  warning: 'ansi:yellowBright', // Neon amber
  merged: 'ansi:blueBright', // Brand blue
  warningShimmer: 'ansi:yellowBright', // Light amber shimmer
  diffAdded: 'ansi:green',
  diffRemoved: 'ansi:red',
  diffAddedDimmed: 'ansi:green',
  diffRemovedDimmed: 'ansi:red',
  diffAddedWord: 'ansi:greenBright',
  diffRemovedWord: 'ansi:redBright',
  // Agent colors
  red_FOR_SUBAGENTS_ONLY: 'ansi:redBright',
  blue_FOR_SUBAGENTS_ONLY: 'ansi:cyanBright',
  green_FOR_SUBAGENTS_ONLY: 'ansi:greenBright',
  yellow_FOR_SUBAGENTS_ONLY: 'ansi:yellowBright',
  purple_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  violet_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  pink_FOR_SUBAGENTS_ONLY: 'ansi:magentaBright',
  cyan_FOR_SUBAGENTS_ONLY: 'ansi:cyanBright',
  // Grove colors
  professionalBlue: 'rgb(80,140,230)',
  // Chrome colors
  chromeYellow: 'ansi:yellowBright',
  // TUI V2 colors
  clawd_body: 'ansi:blueBright', // Electric blue
  clawd_background: 'ansi:black', // Deep navy bg
  userMessageBackground: 'ansi:black', // Ice surface
  userMessageBackgroundHover: 'ansi:whiteBright', // Slightly lighter
  messageActionsBackground: 'ansi:whiteBright', // Subtle gray-blue
  selectionBg: 'ansi:blueBright', // Blue selection
  bashMessageBackgroundColor: 'ansi:blackBright', // Darker navy tone

  memoryBackgroundColor: 'ansi:whiteBright', // Light ice
  rate_limit_fill: 'ansi:magentaBright', // Magenta neon
  rate_limit_empty: 'ansi:whiteBright', // Dim blue-gray
  fastMode: 'ansi:blueBright', // Brand blue
  fastModeShimmer: 'ansi:blueBright', // Lighter blue shimmer
  // Brief/assistant mode
  briefLabelYou: 'ansi:cyanBright', // Cool blue
  briefLabelaiko: 'ansi:blueBright', // Brand blue
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'ansi:redBright',
  rainbow_violet: 'ansi:magentaBright',
  rainbow_yellow: 'ansi:yellowBright',
  rainbow_green: 'ansi:greenBright',
  rainbow_blue: 'ansi:blueBright',
  rainbow_indigo: 'ansi:magentaBright',
  rainbow_violet: 'ansi:magentaBright',
  rainbow_red_shimmer: 'ansi:redBright',
  rainbow_violet_shimmer: 'ansi:magentaBright',
  rainbow_yellow_shimmer: 'ansi:yellowBright',
  rainbow_green_shimmer: 'ansi:greenBright',
  rainbow_blue_shimmer: 'ansi:blueBright',
  rainbow_indigo_shimmer: 'ansi:magentaBright',
  rainbow_violet_shimmer: 'ansi:magentaBright',
}

/**
 * Light daltonized theme — color-blind friendly (deuteranopia)
 */
const lightDaltonizedTheme: Theme = {
  autoAccept: 'rgb(60,200,120)', // Teal green
  bashBorder: 'rgb(140,80,230)', // Purple neon
  aiko: 'rgb(60,160,220)', // Electric blue shifted toward cyan for deuteranopia
  aikoShimmer: 'rgb(110,180,240)', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'rgb(90,190,250)', // Brighter cyan-blue
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(140,210,250)', // Soft cyan shimmer
  permission: 'rgb(200,60,140)', // Magenta neon
  permissionShimmer: 'rgb(220,110,180)', // Light magenta shimmer
  planMode: 'rgb(60,200,120)', // Teal green (color-blind friendly)
  ide: 'rgb(60,140,230)', // Sky blue neon
  promptBorder: 'rgb(100,140,200)', // Subtle blue-gray
  promptBorderShimmer: 'rgb(120,160,210)', // Lighter blue shimmer
  text: 'rgb(20,30,50)', // Cool dark
  inverseText: 'rgb(180,200,230)', // Cool white
  inactive: 'rgb(120,140,170)', // Cool gray
  inactiveShimmer: 'rgb(150,170,200)', // Lighter cool gray
  subtle: 'rgb(140,160,190)', // Dimmed blue-gray
  suggestion: 'rgb(140,80,230)', // Purple neon
  remember: 'rgb(140,80,230)', // Purple neon
  background: 'rgb(230,238,250)', // Light ice (color-blind friendly)
  success: 'rgb(40,180,100)', // Neon green
  error: 'rgb(230,60,80)', // Neon red
  warning: 'rgb(240,160,30)', // Neon amber
  merged: 'rgb(60,160,220)', // Brand blue (adjusted)
  warningShimmer: 'rgb(250,190,80)', // Light amber shimmer
  diffAdded: 'rgb(50,180,100)', // Light neon green
  diffRemoved: 'rgb(200,60,80)', // Light neon red
  diffAddedDimmed: 'rgb(100,200,140)', // Medium green
  diffRemovedDimmed: 'rgb(180,100,110)', // Medium red
  diffAddedWord: 'rgb(40,180,100)', // Deep green
  diffRemovedWord: 'rgb(180,100,120)', // Deep red
  // Agent colors (daltonism-friendly)
  red_FOR_SUBAGENTS_ONLY: 'rgb(240,60,80)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(60,140,230)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(40,180,100)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(240,160,30)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(140,80,230)',
  violet_FOR_SUBAGENTS_ONLY: 'rgb(200,60,180)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(200,60,140)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(80,180,240)',
  // Grove colors
  professionalBlue: 'rgb(80,140,230)',
  // Chrome colors
  chromeYellow: 'rgb(240,160,30)',
  // TUI V2 colors
  clawd_body: 'rgb(60,160,220)', // Electric blue (adjusted)
  clawd_background: 'rgb(230,238,250)', // Light ice
  userMessageBackground: 'rgb(215, 228, 245)', // Ice surface
  userMessageBackgroundHover: 'rgb(200, 218, 240)',
  messageActionsBackground: 'rgb(210, 224, 242)', // Subtle gray-blue
  selectionBg: 'rgb(80,140,220)', // Blue selection
  bashMessageBackgroundColor: 'rgb(220, 232, 248)', // Lighter ice tone

  memoryBackgroundColor: 'rgb(218, 230, 246)', // Light ice
  rate_limit_fill: 'rgb(200,60,140)', // Magenta neon
  rate_limit_empty: 'rgb(100,130,170)', // Dim blue-gray
  fastMode: 'rgb(60,160,220)', // Brand blue (adjusted)
  fastModeShimmer: 'rgb(110,180,240)', // Lighter blue shimmer
  // Brief/assistant mode
  briefLabelYou: 'rgb(80,160,230)', // Cool blue
  briefLabelaiko: 'rgb(60,160,220)', // Brand blue (adjusted for deuteranopia)
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'rgb(240,60,80)',
  rainbow_violet: 'rgb(160,40,220)',
  rainbow_yellow: 'rgb(240,180,30)',
  rainbow_green: 'rgb(40,180,100)',
  rainbow_blue: 'rgb(60,120,230)',
  rainbow_indigo: 'rgb(100,60,220)',
  rainbow_violet: 'rgb(200,60,180)',
  rainbow_red_shimmer: 'rgb(255,120,130)',
  rainbow_violet_shimmer: 'rgb(200,130,245)',
  rainbow_yellow_shimmer: 'rgb(255,220,100)',
  rainbow_green_shimmer: 'rgb(100,210,140)',
  rainbow_blue_shimmer: 'rgb(120,170,245)',
  rainbow_indigo_shimmer: 'rgb(160,120,240)',
  rainbow_violet_shimmer: 'rgb(230,140,210)',
}

/**
 * Dark theme — Neon Glow: deep navy background, electric blue brand, cool tones throughout
 */
const darkTheme: Theme = {
  autoAccept: 'rgb(80,220,140)', // Teal green neon
  bashBorder: 'rgb(160,100,255)', // Purple glow neon
  aiko: 'rgb(74,144,217)', // Electric blue brand
  aikoShimmer: 'rgb(120,180,240)', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'rgb(100,200,255)', // Brighter cyan-blue glow
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(150,220,255)', // Soft cyan shimmer
  permission: 'rgb(220,80,160)', // Magenta neon
  permissionShimmer: 'rgb(240,130,200)', // Light magenta shimmer
  planMode: 'rgb(80,220,140)', // Teal green neon
  ide: 'rgb(80,160,255)', // Sky blue neon
  promptBorder: 'rgb(60,90,140)', // Subtle blue-gray
  promptBorderShimmer: 'rgb(80,110,160)', // Lighter blue shimmer
  text: 'rgb(180,200,230)', // Cool white (not pure white)
  inverseText: 'rgb(20,30,50)', // Cool dark
  inactive: 'rgb(100,120,150)', // Cool gray
  inactiveShimmer: 'rgb(130,150,180)', // Lighter cool gray
  subtle: 'rgb(70,85,110)', // Dimmed blue-gray
  suggestion: 'rgb(160,100,255)', // Purple neon
  remember: 'rgb(160,100,255)', // Purple neon
  background: 'rgb(12,16,28)', // Deep navy
  success: 'rgb(60,200,120)', // Neon green
  error: 'rgb(255,80,100)', // Neon red
  warning: 'rgb(255,180,50)', // Neon amber
  merged: 'rgb(74,144,217)', // Brand blue
  warningShimmer: 'rgb(255,210,100)', // Light amber shimmer
  diffAdded: 'rgb(30,120,70)', // Dark neon green
  diffRemoved: 'rgb(140,40,60)', // Dark neon red
  diffAddedDimmed: 'rgb(40,100,80)', // Medium green
  diffRemovedDimmed: 'rgb(110,60,75)', // Medium red
  diffAddedWord: 'rgb(50,160,100)', // Bright green
  diffRemovedWord: 'rgb(180,80,100)', // Bright red
  // Agent colors
  red_FOR_SUBAGENTS_ONLY: 'rgb(255,80,100)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(80,160,255)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(60,200,120)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(255,180,50)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(160,100,255)',
  violet_FOR_SUBAGENTS_ONLY: 'rgb(200,80,220)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(220,80,160)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(100,200,255)',
  // Grove colors
  professionalBlue: 'rgb(100,160,255)',
  // Chrome colors
  chromeYellow: 'rgb(255,180,50)',
  // TUI V2 colors
  clawd_body: 'rgb(74,144,217)', // Electric blue
  clawd_background: 'rgb(12,16,28)', // Deep navy bg
  userMessageBackground: 'rgb(20, 28, 48)', // Slightly lighter navy
  userMessageBackgroundHover: 'rgb(28, 38, 58)', // Hover state
  messageActionsBackground: 'rgb(24, 32, 52)', // Action menus
  selectionBg: 'rgb(60,120,200)', // Blue selection
  bashMessageBackgroundColor: 'rgb(18, 24, 42)', // Darker navy tone

  memoryBackgroundColor: 'rgb(18, 26, 44)', // Light navy
  rate_limit_fill: 'rgb(220,80,160)', // Magenta neon
  rate_limit_empty: 'rgb(80,100,130)', // Dim blue-gray
  fastMode: 'rgb(74,144,217)', // Brand blue
  fastModeShimmer: 'rgb(120,180,240)', // Lighter blue shimmer
  // Brief/assistant mode
  briefLabelYou: 'rgb(100,180,255)', // Cool blue
  briefLabelaiko: 'rgb(74,144,217)', // Brand blue
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'rgb(255,80,100)',
  rainbow_violet: 'rgb(180,60,240)',
  rainbow_yellow: 'rgb(255,200,50)',
  rainbow_green: 'rgb(60,200,120)',
  rainbow_blue: 'rgb(80,140,255)',
  rainbow_indigo: 'rgb(120,80,240)',
  rainbow_violet: 'rgb(220,60,200)',
  rainbow_red_shimmer: 'rgb(255,140,150)',
  rainbow_violet_shimmer: 'rgb(220,130,250)',
  rainbow_yellow_shimmer: 'rgb(255,230,120)',
  rainbow_green_shimmer: 'rgb(100,220,150)',
  rainbow_blue_shimmer: 'rgb(130,180,255)',
  rainbow_indigo_shimmer: 'rgb(170,120,250)',
  rainbow_violet_shimmer: 'rgb(240,140,220)',
}

/**
 * Dark daltonized theme — color-blind friendly (deuteranopia)
 */
const darkDaltonizedTheme: Theme = {
  autoAccept: 'rgb(80,220,140)', // Teal green
  bashBorder: 'rgb(160,100,255)', // Purple neon
  aiko: 'rgb(80,180,230)', // Electric blue shifted toward cyan for deuteranopia
  aikoShimmer: 'rgb(130,190,245)', // Lighter blue shimmer
  aikoBlue_FOR_SYSTEM_SPINNER: 'rgb(110,210,255)', // Brighter cyan-blue
  aikoBlueShimmer_FOR_SYSTEM_SPINNER: 'rgb(160,230,255)', // Soft cyan shimmer
  permission: 'rgb(220,80,160)', // Magenta neon
  permissionShimmer: 'rgb(240,130,200)', // Light magenta shimmer
  planMode: 'rgb(80,220,140)', // Teal green (color-blind friendly)
  ide: 'rgb(80,160,255)', // Sky blue neon
  promptBorder: 'rgb(60,90,140)', // Subtle blue-gray
  promptBorderShimmer: 'rgb(80,110,160)', // Lighter blue shimmer
  text: 'rgb(180,200,230)', // Cool white
  inverseText: 'rgb(20,30,50)', // Cool dark
  inactive: 'rgb(100,120,150)', // Cool gray
  inactiveShimmer: 'rgb(130,150,180)', // Lighter cool gray
  subtle: 'rgb(70,85,110)', // Dimmed blue-gray
  suggestion: 'rgb(160,100,255)', // Purple neon
  remember: 'rgb(160,100,255)', // Purple neon
  background: 'rgb(12,16,28)', // Deep navy (color-blind friendly)
  success: 'rgb(60,200,120)', // Neon green
  error: 'rgb(255,80,100)', // Neon red
  warning: 'rgb(255,180,50)', // Neon amber
  merged: 'rgb(80,180,230)', // Brand blue (adjusted)
  warningShimmer: 'rgb(255,210,100)', // Light amber shimmer
  diffAdded: 'rgb(30,120,70)', // Dark neon green
  diffRemoved: 'rgb(140,40,60)', // Dark neon red
  diffAddedDimmed: 'rgb(40,100,80)', // Medium green
  diffRemovedDimmed: 'rgb(110,60,75)', // Medium red
  diffAddedWord: 'rgb(50,160,100)', // Bright green
  diffRemovedWord: 'rgb(180,80,100)', // Bright red
  // Agent colors (daltonism-friendly, dark mode)
  red_FOR_SUBAGENTS_ONLY: 'rgb(255,80,100)', // Bright red
  blue_FOR_SUBAGENTS_ONLY: 'rgb(80,160,255)', // Bright blue
  green_FOR_SUBAGENTS_ONLY: 'rgb(60,200,120)', // Bright green
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(255,180,50)', // Bright yellow
  purple_FOR_SUBAGENTS_ONLY: 'rgb(160,100,255)', // Bright purple
  violet_FOR_SUBAGENTS_ONLY: 'rgb(220,60,180)', // Bright magenta
  pink_FOR_SUBAGENTS_ONLY: 'rgb(220,80,160)', // Bright magenta
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(100,200,255)', // Bright cyan
  // Grove colors
  professionalBlue: 'rgb(100,160,255)',
  // Chrome colors
  chromeYellow: 'rgb(255,180,50)',
  // TUI V2 colors
  clawd_body: 'rgb(80,180,230)', // Electric blue (adjusted)
  clawd_background: 'rgb(12,16,28)', // Deep navy
  userMessageBackground: 'rgb(20, 28, 48)',
  userMessageBackgroundHover: 'rgb(28, 38, 58)',
  messageActionsBackground: 'rgb(24, 32, 52)',
  selectionBg: 'rgb(60,120,200)', // Blue selection
  bashMessageBackgroundColor: 'rgb(18, 24, 42)',

  memoryBackgroundColor: 'rgb(18, 26, 44)',
  rate_limit_fill: 'rgb(220,80,160)', // Magenta neon
  rate_limit_empty: 'rgb(80,100,130)', // Dim blue-gray
  fastMode: 'rgb(80,180,230)', // Brand blue (adjusted)
  fastModeShimmer: 'rgb(130,190,245)', // Lighter blue shimmer
  briefLabelYou: 'rgb(100,180,255)',
  briefLabelaiko: 'rgb(80,180,230)', // Brand blue (adjusted for deuteranopia)
  // Rainbow colors for ultrathink keyword highlighting
  rainbow_red: 'rgb(255,80,100)',
  rainbow_violet: 'rgb(180,60,240)',
  rainbow_yellow: 'rgb(255,200,50)',
  rainbow_green: 'rgb(60,200,120)',
  rainbow_blue: 'rgb(80,140,255)',
  rainbow_indigo: 'rgb(120,80,240)',
  rainbow_violet: 'rgb(220,60,200)',
  rainbow_red_shimmer: 'rgb(255,140,150)',
  rainbow_violet_shimmer: 'rgb(220,130,250)',
  rainbow_yellow_shimmer: 'rgb(255,230,120)',
  rainbow_green_shimmer: 'rgb(100,220,150)',
  rainbow_blue_shimmer: 'rgb(130,180,255)',
  rainbow_indigo_shimmer: 'rgb(170,120,250)',
  rainbow_violet_shimmer: 'rgb(240,140,220)',
}

export function getTheme(themeName: ThemeName): Theme {
  switch (themeName) {
    case 'light':
      return lightTheme
    case 'light-ansi':
      return lightAnsiTheme
    case 'dark-ansi':
      return darkAnsiTheme
    case 'light-daltonized':
      return lightDaltonizedTheme
    case 'dark-daltonized':
      return darkDaltonizedTheme
    default:
      return darkTheme
  }
}

// Create a chalk instance with 256-color level for Apple Terminal
// Apple Terminal doesn't handle 24-bit color escape sequences well
const chalkForChart =
  env.terminal === 'Apple_Terminal'
    ? new Chalk({ level: 2 }) // 256 colors
    : chalk

/**
 * Converts a theme color to an ANSI escape sequence for use with asciichart.
 * Uses chalk to generate the escape codes, with 256-color mode for Apple Terminal.
 */
export function themeColorToAnsi(themeColor: string): string {
  const rgbMatch = themeColor.match(/rgb\(\s?(\d+),\s?(\d+),\s?(\d+)\s?\)/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]!, 10)
    const g = parseInt(rgbMatch[2]!, 10)
    const b = parseInt(rgbMatch[3]!, 10)
    // Use chalk.rgb which auto-converts to 256 colors when level is 2
    // Extract just the opening escape sequence by using a marker
    const colored = chalkForChart.rgb(r, g, b)('X')
    return colored.slice(0, colored.indexOf('X'))
  }
  // Fallback to magenta if parsing fails
  return '\x1b[35m'
}
