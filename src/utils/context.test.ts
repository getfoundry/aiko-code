import { afterEach, expect, test } from 'bun:test'

import { getMaxOutputTokensForModel } from '../services/api/claude.ts'
import {
  getContextWindowForModel,
  getModelMaxOutputTokens,
} from './context.ts'

const originalEnv = {
  CLAUDE_CODE_USE_OPENAI: process.env.CLAUDE_CODE_USE_OPENAI,
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
}

afterEach(() => {
  process.env.CLAUDE_CODE_USE_OPENAI = originalEnv.CLAUDE_CODE_USE_OPENAI
  process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS =
    originalEnv.CLAUDE_CODE_MAX_OUTPUT_TOKENS
})

test('deepseek-chat uses provider-specific context and output caps', () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS

  expect(getContextWindowForModel('deepseek-chat')).toBe(128_000)
  expect(getModelMaxOutputTokens('deepseek-chat')).toEqual({
    default: 8_192,
    upperLimit: 8_192,
  })
  expect(getMaxOutputTokensForModel('deepseek-chat')).toBe(8_192)
})

test('deepseek-chat clamps oversized max output overrides to the provider limit', () => {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '32000'

  expect(getMaxOutputTokensForModel('deepseek-chat')).toBe(8_192)
})
