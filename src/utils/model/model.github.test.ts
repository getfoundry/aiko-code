import { afterEach, beforeEach, expect, test } from 'bun:test'

import { saveGlobalConfig } from '../config.js'
import { getDefaultMainLoopModelSetting, getUserSpecifiedModelSetting } from './model.js'

const env = {
  aiko_CODE_USE_GITHUB: process.env.aiko_CODE_USE_GITHUB,
  aiko_CODE_USE_OPENAI: process.env.aiko_CODE_USE_OPENAI,
  aiko_CODE_USE_GEMINI: process.env.aiko_CODE_USE_GEMINI,
  aiko_CODE_USE_BEDROCK: process.env.aiko_CODE_USE_BEDROCK,
  aiko_CODE_USE_VERTEX: process.env.aiko_CODE_USE_VERTEX,
  aiko_CODE_USE_FOUNDRY: process.env.aiko_CODE_USE_FOUNDRY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
}

beforeEach(() => {
  process.env.aiko_CODE_USE_GITHUB = '1'
  delete process.env.aiko_CODE_USE_OPENAI
  delete process.env.aiko_CODE_USE_GEMINI
  delete process.env.aiko_CODE_USE_BEDROCK
  delete process.env.aiko_CODE_USE_VERTEX
  delete process.env.aiko_CODE_USE_FOUNDRY
  delete process.env.OPENAI_MODEL
  saveGlobalConfig(current => ({
    ...current,
    model: ({ bad: true } as unknown) as string,
  }))
})

afterEach(() => {
  process.env.aiko_CODE_USE_GITHUB = env.aiko_CODE_USE_GITHUB
  process.env.aiko_CODE_USE_OPENAI = env.aiko_CODE_USE_OPENAI
  process.env.aiko_CODE_USE_GEMINI = env.aiko_CODE_USE_GEMINI
  process.env.aiko_CODE_USE_BEDROCK = env.aiko_CODE_USE_BEDROCK
  process.env.aiko_CODE_USE_VERTEX = env.aiko_CODE_USE_VERTEX
  process.env.aiko_CODE_USE_FOUNDRY = env.aiko_CODE_USE_FOUNDRY
  process.env.OPENAI_MODEL = env.OPENAI_MODEL
  saveGlobalConfig(current => ({
    ...current,
    model: undefined,
  }))
})

test('github default model setting ignores non-string saved model', () => {
  const model = getDefaultMainLoopModelSetting()
  expect(typeof model).toBe('string')
  expect(model).not.toBe('[object Object]')
  expect(model.length).toBeGreaterThan(0)
})

test('user specified model ignores non-string saved model', () => {
  const model = getUserSpecifiedModelSetting()
  if (model !== undefined && model !== null) {
    expect(typeof model).toBe('string')
    expect(model).not.toBe('[object Object]')
  }
})
