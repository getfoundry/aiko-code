import { afterEach, expect, test } from 'bun:test'

import { resetModelStringsForTestingOnly } from '../../bootstrap/state.js'
import { parseUserSpecifiedModel } from './model.js'
import { getModelStrings } from './modelStrings.js'

const originalEnv = {
  aiko_CODE_USE_GITHUB: process.env.aiko_CODE_USE_GITHUB,
  aiko_CODE_USE_OPENAI: process.env.aiko_CODE_USE_OPENAI,
  aiko_CODE_USE_GEMINI: process.env.aiko_CODE_USE_GEMINI,
  aiko_CODE_USE_BEDROCK: process.env.aiko_CODE_USE_BEDROCK,
  aiko_CODE_USE_VERTEX: process.env.aiko_CODE_USE_VERTEX,
  aiko_CODE_USE_FOUNDRY: process.env.aiko_CODE_USE_FOUNDRY,
}

function clearProviderFlags(): void {
  delete process.env.aiko_CODE_USE_GITHUB
  delete process.env.aiko_CODE_USE_OPENAI
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY
}

afterEach(() => {
  process.env.aiko_CODE_USE_GITHUB = originalEnv.aiko_CODE_USE_GITHUB
  process.env.aiko_CODE_USE_OPENAI = originalEnv.aiko_CODE_USE_OPENAI
  process.env.aiko_CODE_USE_GEMINI = originalEnv.aiko_CODE_USE_GEMINI
  process.env.aiko_CODE_USE_BEDROCK = originalEnv.aiko_CODE_USE_BEDROCK
  process.env.aiko_CODE_USE_VERTEX = originalEnv.aiko_CODE_USE_VERTEX
  process.env.aiko_CODE_USE_FOUNDRY = originalEnv.aiko_CODE_USE_FOUNDRY
  resetModelStringsForTestingOnly()
})

test('GitHub provider model strings are concrete IDs', () => {
  clearProviderFlags()
  process.env.aiko_CODE_USE_GITHUB = '1'

  const modelStrings = getModelStrings()

  for (const value of Object.values(modelStrings)) {
    expect(typeof value).toBe('string')
    expect(value.trim().length).toBeGreaterThan(0)
  }
})

test('GitHub provider model strings are safe to parse', () => {
  clearProviderFlags()
  process.env.aiko_CODE_USE_GITHUB = '1'

  const modelStrings = getModelStrings()

  expect(() => parseUserSpecifiedModel(modelStrings.sonnet46 as any)).not.toThrow()
})
