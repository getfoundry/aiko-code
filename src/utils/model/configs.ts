import type { ModelName } from './model.js'
import type { APIProvider } from './providers.js'

export type ModelConfig = Record<APIProvider, ModelName>

// ---------------------------------------------------------------------------
// OpenAI-compatible model mappings
// Maps aiko model tiers to sensible defaults for popular providers.
// Override with OPENAI_MODEL, ANTHROPIC_MODEL, or settings.model
// ---------------------------------------------------------------------------
export const OPENAI_MODEL_DEFAULTS = {
  opus: 'gpt-4o',           // best reasoning
  sonnet: 'gpt-4o-mini',    // balanced
  haiku: 'gpt-4o-mini',     // fast & cheap
} as const

// ---------------------------------------------------------------------------
// Gemini model mappings
// Maps aiko model tiers to Google Gemini equivalents.
// Override with GEMINI_MODEL env var.
// ---------------------------------------------------------------------------
export const GEMINI_MODEL_DEFAULTS = {
  opus: 'gemini-2.5-pro',   // most capable
  sonnet: 'gemini-2.0-flash',              // balanced
  haiku: 'gemini-2.0-flash-lite',          // fast & cheap
} as const

// @[MODEL LAUNCH]: Add a new aiko_*_CONFIG constant here. Double check the correct model strings
// here since the pattern may change.

export const aiko_3_7_SONNET_CONFIG = {
  firstParty: 'aiko-3-7-sonnet-20250219',
  bedrock: 'us.anthropic.aiko-3-7-sonnet-20250219-v1:0',
  vertex: 'aiko-3-7-sonnet@20250219',
  foundry: 'aiko-3-7-sonnet',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_3_5_V2_SONNET_CONFIG = {
  firstParty: 'aiko-3-5-sonnet-20241022',
  bedrock: 'anthropic.aiko-3-5-sonnet-20241022-v2:0',
  vertex: 'aiko-3-5-sonnet-v2@20241022',
  foundry: 'aiko-3-5-sonnet',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_3_5_HAIKU_CONFIG = {
  firstParty: 'aiko-3-5-haiku-20241022',
  bedrock: 'us.anthropic.aiko-3-5-haiku-20241022-v1:0',
  vertex: 'aiko-3-5-haiku@20241022',
  foundry: 'aiko-3-5-haiku',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash-lite',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_HAIKU_4_5_CONFIG = {
  firstParty: 'aiko-haiku-4-5-20251001',
  bedrock: 'us.anthropic.aiko-haiku-4-5-20251001-v1:0',
  vertex: 'aiko-haiku-4-5@20251001',
  foundry: 'aiko-haiku-4-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash-lite',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_SONNET_4_CONFIG = {
  firstParty: 'aiko-sonnet-4-20250514',
  bedrock: 'us.anthropic.aiko-sonnet-4-20250514-v1:0',
  vertex: 'aiko-sonnet-4@20250514',
  foundry: 'aiko-sonnet-4',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_SONNET_4_5_CONFIG = {
  firstParty: 'aiko-sonnet-4-5-20250929',
  bedrock: 'us.anthropic.aiko-sonnet-4-5-20250929-v1:0',
  vertex: 'aiko-sonnet-4-5@20250929',
  foundry: 'aiko-sonnet-4-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_OPUS_4_CONFIG = {
  firstParty: 'aiko-opus-4-20250514',
  bedrock: 'us.anthropic.aiko-opus-4-20250514-v1:0',
  vertex: 'aiko-opus-4@20250514',
  foundry: 'aiko-opus-4',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_OPUS_4_1_CONFIG = {
  firstParty: 'aiko-opus-4-1-20250805',
  bedrock: 'us.anthropic.aiko-opus-4-1-20250805-v1:0',
  vertex: 'aiko-opus-4-1@20250805',
  foundry: 'aiko-opus-4-1',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_OPUS_4_5_CONFIG = {
  firstParty: 'aiko-opus-4-5-20251101',
  bedrock: 'us.anthropic.aiko-opus-4-5-20251101-v1:0',
  vertex: 'aiko-opus-4-5@20251101',
  foundry: 'aiko-opus-4-5',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_OPUS_4_6_CONFIG = {
  firstParty: 'aiko-opus-4-6',
  bedrock: 'us.anthropic.aiko-opus-4-6-v1',
  vertex: 'aiko-opus-4-6',
  foundry: 'aiko-opus-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

export const aiko_SONNET_4_6_CONFIG = {
  firstParty: 'aiko-sonnet-4-6',
  bedrock: 'us.anthropic.aiko-sonnet-4-6',
  vertex: 'aiko-sonnet-4-6',
  foundry: 'aiko-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  github: 'github:copilot',
  codex: 'gpt-5.5',
  'nvidia-nim': 'nvidia/llama-3.1-nemotron-70b-instruct',
  minimax: 'MiniMax-M2.5',
} as const satisfies ModelConfig

// @[MODEL LAUNCH]: Register the new config here.
export const ALL_MODEL_CONFIGS = {
  haiku35: aiko_3_5_HAIKU_CONFIG,
  haiku45: aiko_HAIKU_4_5_CONFIG,
  sonnet35: aiko_3_5_V2_SONNET_CONFIG,
  sonnet37: aiko_3_7_SONNET_CONFIG,
  sonnet40: aiko_SONNET_4_CONFIG,
  sonnet45: aiko_SONNET_4_5_CONFIG,
  sonnet46: aiko_SONNET_4_6_CONFIG,
  opus40: aiko_OPUS_4_CONFIG,
  opus41: aiko_OPUS_4_1_CONFIG,
  opus45: aiko_OPUS_4_5_CONFIG,
  opus46: aiko_OPUS_4_6_CONFIG,
} as const satisfies Record<string, ModelConfig>

export type ModelKey = keyof typeof ALL_MODEL_CONFIGS

/** Union of all canonical first-party model IDs, e.g. 'aiko-opus-4-6' | 'aiko-sonnet-4-5-20250929' | … */
export type CanonicalModelId =
  (typeof ALL_MODEL_CONFIGS)[ModelKey]['firstParty']

/** Runtime list of canonical model IDs — used by comprehensiveness tests. */
export const CANONICAL_MODEL_IDS = Object.values(ALL_MODEL_CONFIGS).map(
  c => c.firstParty,
) as [CanonicalModelId, ...CanonicalModelId[]]

/** Map canonical ID → internal short key. Used to apply settings-based modelOverrides. */
export const CANONICAL_ID_TO_KEY: Record<CanonicalModelId, ModelKey> =
  Object.fromEntries(
    (Object.entries(ALL_MODEL_CONFIGS) as [ModelKey, ModelConfig][]).map(
      ([key, cfg]) => [cfg.firstParty, key],
    ),
  ) as Record<CanonicalModelId, ModelKey>