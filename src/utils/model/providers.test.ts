import { afterEach, expect, test } from 'bun:test'

const originalEnv = {
  aiko_CODE_USE_GEMINI: process.env.aiko_CODE_USE_GEMINI,
  aiko_CODE_USE_GITHUB: process.env.aiko_CODE_USE_GITHUB,
  aiko_CODE_USE_OPENAI: process.env.aiko_CODE_USE_OPENAI,
  aiko_CODE_USE_BEDROCK: process.env.aiko_CODE_USE_BEDROCK,
  aiko_CODE_USE_VERTEX: process.env.aiko_CODE_USE_VERTEX,
  aiko_CODE_USE_FOUNDRY: process.env.aiko_CODE_USE_FOUNDRY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_BASE: process.env.OPENAI_API_BASE,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  XAI_API_KEY: process.env.XAI_API_KEY,
}

afterEach(() => {
  process.env.aiko_CODE_USE_GEMINI = originalEnv.aiko_CODE_USE_GEMINI
  process.env.aiko_CODE_USE_GITHUB = originalEnv.aiko_CODE_USE_GITHUB
  process.env.aiko_CODE_USE_OPENAI = originalEnv.aiko_CODE_USE_OPENAI
  process.env.aiko_CODE_USE_BEDROCK = originalEnv.aiko_CODE_USE_BEDROCK
  process.env.aiko_CODE_USE_VERTEX = originalEnv.aiko_CODE_USE_VERTEX
  process.env.aiko_CODE_USE_FOUNDRY = originalEnv.aiko_CODE_USE_FOUNDRY
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
  process.env.OPENAI_API_BASE = originalEnv.OPENAI_API_BASE
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  process.env.XAI_API_KEY = originalEnv.XAI_API_KEY
})

async function importFreshProvidersModule() {
  return import(`./providers.js?ts=${Date.now()}-${Math.random()}`)
}

function clearProviderEnv(): void {
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_GITHUB
  delete process.env.aiko_CODE_USE_OPENAI
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY
  delete process.env.OPENAI_BASE_URL
  delete process.env.OPENAI_API_BASE
  delete process.env.OPENAI_MODEL
  delete process.env.XAI_API_KEY
}

test('first-party provider keeps Anthropic account setup flow enabled', () => {
  clearProviderEnv()
  return importFreshProvidersModule().then(
    ({ getAPIProvider, usesAnthropicAccountFlow }) => {
      expect(getAPIProvider()).toBe('firstParty')
      expect(usesAnthropicAccountFlow()).toBe(true)
    },
  )
})

test.each([
  ['aiko_CODE_USE_OPENAI', 'openai'],
  ['aiko_CODE_USE_GITHUB', 'github'],
  ['aiko_CODE_USE_GEMINI', 'gemini'],
  ['aiko_CODE_USE_BEDROCK', 'bedrock'],
  ['aiko_CODE_USE_VERTEX', 'vertex'],
  ['aiko_CODE_USE_FOUNDRY', 'foundry'],
] as const)(
  '%s disables Anthropic account setup flow',
  async (envKey, provider) => {
    clearProviderEnv()
    process.env[envKey] = '1'
    const { getAPIProvider, usesAnthropicAccountFlow } =
      await importFreshProvidersModule()

    expect(getAPIProvider()).toBe(provider)
    expect(usesAnthropicAccountFlow()).toBe(false)
  },
)

test('GEMINI takes precedence over GitHub when both are set', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GEMINI = '1'
  process.env.aiko_CODE_USE_GITHUB = '1'
  const { getAPIProvider } = await importFreshProvidersModule()

  expect(getAPIProvider()).toBe('gemini')
})

test('explicit local openai-compatible base URLs stay on the openai provider', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8080/v1'
  process.env.OPENAI_MODEL = 'gpt-5.4'

  const { getAPIProvider } = await importFreshProvidersModule()
  expect(getAPIProvider()).toBe('openai')
})

test('codex aliases still resolve to the codex provider without a non-codex base URL', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_OPENAI = '1'
  process.env.OPENAI_MODEL = 'codexplan'

  const { getAPIProvider } = await importFreshProvidersModule()
  expect(getAPIProvider()).toBe('codex')
})

test('XAI_API_KEY resolves to the xai provider', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_OPENAI = '1'
  process.env.XAI_API_KEY = 'xai-test-key'
  process.env.OPENAI_BASE_URL = 'https://api.x.ai/v1'
  process.env.OPENAI_MODEL = 'grok-4'

  const { getAPIProvider } = await importFreshProvidersModule()
  expect(getAPIProvider()).toBe('xai')
})

test('official OpenAI base URLs now keep provider detection on openai for aliases', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_OPENAI = '1'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
  process.env.OPENAI_MODEL = 'gpt-5.4'

  const { getAPIProvider } = await importFreshProvidersModule()
  expect(getAPIProvider()).toBe('openai')
})

// isGithubNativeAnthropicMode

test('isGithubNativeAnthropicMode: false when aiko_CODE_USE_GITHUB is not set', async () => {
  clearProviderEnv()
  process.env.OPENAI_MODEL = 'aiko-sonnet-4-5'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(false)
})

test('isGithubNativeAnthropicMode: true for bare aiko- model via OPENAI_MODEL', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'aiko-sonnet-4-5'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(true)
})

test('isGithubNativeAnthropicMode: true for github:copilot:aiko- compound format', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'github:copilot:aiko-sonnet-4'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(true)
})

test('isGithubNativeAnthropicMode: true when resolvedModel is a aiko- model', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'github:copilot'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode('aiko-haiku-4-5')).toBe(true)
})

test('isGithubNativeAnthropicMode: false for generic github:copilot alias', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'github:copilot'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(false)
})

test('isGithubNativeAnthropicMode: false for non-aiko model', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'gpt-4o'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(false)
})

test('isGithubNativeAnthropicMode: false for github:copilot:gpt- model', async () => {
  clearProviderEnv()
  process.env.aiko_CODE_USE_GITHUB = '1'
  process.env.OPENAI_MODEL = 'github:copilot:gpt-4o'
  const { isGithubNativeAnthropicMode } = await importFreshProvidersModule()
  expect(isGithubNativeAnthropicMode()).toBe(false)
})
