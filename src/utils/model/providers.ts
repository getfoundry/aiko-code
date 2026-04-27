import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { shouldUseCodexTransport } from '../../services/api/providerConfig.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'github'
  | 'codex'
  | 'nvidia-nim'
  | 'minimax'
  | 'mistral'
  | 'xai'

export function getAPIProvider(): APIProvider {
  // Aiko Code always uses the OpenAI-compatible Aiko LLM endpoint
  return 'openai'
}

export function usesAnthropicAccountFlow(): boolean {
  // Aiko Code never uses Anthropic account flow
  return false
}

/**
 * Returns true when the GitHub provider should use Anthropic's native API
 * format instead of the OpenAI-compatible shim.
 *
 * Enabled when aiko_CODE_USE_GITHUB=1 and the model string contains "aiko-"
 * anywhere (handles bare names like "aiko-sonnet-4" and compound formats like
 * "github:copilot:aiko-sonnet-4" or any future provider-prefixed variants).
 *
 * api.githubcopilot.com supports Anthropic native format for aiko models,
 * enabling prompt caching via cache_control blocks which significantly reduces
 * per-turn token costs by caching the system prompt and tool definitions.
 */
export function isGithubNativeAnthropicMode(resolvedModel?: string): boolean {
  if (!isEnvTruthy(process.env.aiko_CODE_USE_GITHUB)) return false
  const model = resolvedModel?.trim() || process.env.OPENAI_MODEL?.trim() || ''
  return model.toLowerCase().includes('aiko-')
}
function isCodexModel(): boolean {
  return shouldUseCodexTransport(
    process.env.OPENAI_MODEL || '',
    process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE,
  )
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  // Aiko Code doesn't use Anthropic — always false
  return false
}
