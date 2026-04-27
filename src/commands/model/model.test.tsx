import { afterEach, expect, mock, test } from 'bun:test'

import { getAdditionalModelOptionsCacheScope } from '../../services/api/providerConfig.js'
import { getAPIProvider } from '../../utils/model/providers.js'

const originalEnv = {
  aiko_CODE_USE_OPENAI: process.env.aiko_CODE_USE_OPENAI,
  aiko_CODE_USE_GEMINI: process.env.aiko_CODE_USE_GEMINI,
  aiko_CODE_USE_GITHUB: process.env.aiko_CODE_USE_GITHUB,
  aiko_CODE_USE_MISTRAL: process.env.aiko_CODE_USE_MISTRAL,
  aiko_CODE_USE_BEDROCK: process.env.aiko_CODE_USE_BEDROCK,
  aiko_CODE_USE_VERTEX: process.env.aiko_CODE_USE_VERTEX,
  aiko_CODE_USE_FOUNDRY: process.env.aiko_CODE_USE_FOUNDRY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_BASE: process.env.OPENAI_API_BASE,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
}

afterEach(() => {
  mock.restore()
  process.env.aiko_CODE_USE_OPENAI = originalEnv.aiko_CODE_USE_OPENAI
  process.env.aiko_CODE_USE_GEMINI = originalEnv.aiko_CODE_USE_GEMINI
  process.env.aiko_CODE_USE_GITHUB = originalEnv.aiko_CODE_USE_GITHUB
  process.env.aiko_CODE_USE_MISTRAL = originalEnv.aiko_CODE_USE_MISTRAL
  process.env.aiko_CODE_USE_BEDROCK = originalEnv.aiko_CODE_USE_BEDROCK
  process.env.aiko_CODE_USE_VERTEX = originalEnv.aiko_CODE_USE_VERTEX
  process.env.aiko_CODE_USE_FOUNDRY = originalEnv.aiko_CODE_USE_FOUNDRY
  process.env.OPENAI_BASE_URL = originalEnv.OPENAI_BASE_URL
  process.env.OPENAI_API_BASE = originalEnv.OPENAI_API_BASE
  process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
})

test('opens the model picker without awaiting local model discovery refresh', async () => {
  process.env.aiko_CODE_USE_OPENAI = '1'
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_GITHUB
  delete process.env.aiko_CODE_USE_MISTRAL
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY
  delete process.env.OPENAI_API_BASE
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:8080/v1'
  process.env.OPENAI_MODEL = 'qwen2.5-coder-7b-instruct'

  let resolveDiscovery: (() => void) | undefined
  const discoverOpenAICompatibleModelOptions = mock(
    () =>
      new Promise<void>(resolve => {
        resolveDiscovery = resolve
      }),
  )

  mock.module('../../utils/model/openaiModelDiscovery.js', () => ({
    discoverOpenAICompatibleModelOptions,
  }))

  expect(getAdditionalModelOptionsCacheScope()).toBe('openai:http://127.0.0.1:8080/v1')

  const { call } = await import('./model.js')
  const result = await Promise.race([
    call(() => {}, {} as never, ''),
    new Promise(resolve => setTimeout(() => resolve('timeout'), 50)),
  ])

  resolveDiscovery?.()

  expect(result).not.toBe('timeout')
})
