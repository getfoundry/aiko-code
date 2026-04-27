import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mock } from 'bun:test'

import { resetModelStringsForTestingOnly } from '../../bootstrap/state.js'
import { saveGlobalConfig } from '../config.js'

async function importFreshModelOptionsModule() {
  mock.restore()
  mock.module('./providers.js', () => ({
    getAPIProvider: () => 'github',
  }))
  const nonce = `${Date.now()}-${Math.random()}`
  return import(`./modelOptions.js?ts=${nonce}`)
}

const originalEnv = {
  aiko_CODE_USE_GITHUB: process.env.aiko_CODE_USE_GITHUB,
  aiko_CODE_USE_OPENAI: process.env.aiko_CODE_USE_OPENAI,
  aiko_CODE_USE_GEMINI: process.env.aiko_CODE_USE_GEMINI,
  aiko_CODE_USE_BEDROCK: process.env.aiko_CODE_USE_BEDROCK,
  aiko_CODE_USE_VERTEX: process.env.aiko_CODE_USE_VERTEX,
  aiko_CODE_USE_FOUNDRY: process.env.aiko_CODE_USE_FOUNDRY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  ANTHROPIC_CUSTOM_MODEL_OPTION: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION,
}

beforeEach(() => {
  mock.restore()
  delete process.env.aiko_CODE_USE_GITHUB
  delete process.env.aiko_CODE_USE_OPENAI
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY
  delete process.env.OPENAI_MODEL
  delete process.env.OPENAI_BASE_URL
  delete process.env.ANTHROPIC_CUSTOM_MODEL_OPTION
  resetModelStringsForTestingOnly()
})

afterEach(() => {
  mock.restore()
  process.env.aiko_CODE_USE_GITHUB = originalEnv.aiko_CODE_USE_GITHUB
  process.env.aiko_CODE_USE_OPENAI = originalEnv.aiko_CODE_USE_OPENAI
  process.env.aiko_CODE_USE_GEMINI = originalEnv.aiko_CODE_USE_GEMINI
  process.env.aiko_CODE_USE_BEDROCK = originalEnv.aiko_CODE_USE_BEDROCK
  process.env.aiko_CODE_USE_VERTEX = originalEnv.aiko_CODE_USE_VERTEX
  process.env.aiko_CODE_USE_FOUNDRY = originalEnv.aiko_CODE_USE_FOUNDRY
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
  process.env.ANTHROPIC_CUSTOM_MODEL_OPTION =
    originalEnv.ANTHROPIC_CUSTOM_MODEL_OPTION
  saveGlobalConfig(current => ({
    ...current,
    additionalModelOptionsCache: [],
    additionalModelOptionsCacheScope: undefined,
    openaiAdditionalModelOptionsCache: [],
    openaiAdditionalModelOptionsCacheByProfile: {},
    providerProfiles: [],
    activeProviderProfileId: undefined,
  }))
  resetModelStringsForTestingOnly()
})

test('GitHub provider exposes default + all Copilot models in /model options', async () => {
  process.env.aiko_CODE_USE_GITHUB = '1'
  delete process.env.aiko_CODE_USE_OPENAI
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY

  process.env.OPENAI_MODEL = 'gpt-4o'
  delete process.env.ANTHROPIC_CUSTOM_MODEL_OPTION

  const { getModelOptions } = await importFreshModelOptionsModule()
  const options = getModelOptions(false)
  const nonDefault = options.filter(
    (option: { value: unknown }) => option.value !== null,
  )

  expect(nonDefault.length).toBeGreaterThan(1)
  expect(nonDefault.some((o: { value: unknown }) => o.value === 'gpt-4o')).toBe(true)
  expect(nonDefault.some((o: { value: unknown }) => o.value === 'gpt-5.3-codex')).toBe(true)
})
