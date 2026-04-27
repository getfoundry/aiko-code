import { afterEach, expect, test } from 'bun:test'

// MACRO is replaced at build time by Bun.define but not in test mode.
// Define it globally so tests that import modules using MACRO don't crash.
;(globalThis as Record<string, unknown>).MACRO = {
  VERSION: '99.0.0',
  DISPLAY_VERSION: '0.0.0-test',
  BUILD_TIME: new Date().toISOString(),
  ISSUES_EXPLAINER: 'report the issue at https://github.com/anthropics/aiko-code/issues',
  PACKAGE_URL: '@getfoundry/aiko',
  NATIVE_PACKAGE_URL: undefined,
}

import { clearSystemPromptSections } from './systemPromptSections.js'
import { getSystemPrompt, DEFAULT_AGENT_PROMPT } from './prompts.js'
import { CLI_SYSPROMPT_PREFIXES, getCLISyspromptPrefix } from './system.js'
import { aiko_CODE_GUIDE_AGENT } from '../tools/AgentTool/built-in/aikoCodeGuideAgent.js'
import { GENERAL_PURPOSE_AGENT } from '../tools/AgentTool/built-in/generalPurposeAgent.js'
import { EXPLORE_AGENT } from '../tools/AgentTool/built-in/exploreAgent.js'
import { PLAN_AGENT } from '../tools/AgentTool/built-in/planAgent.js'
import { STATUSLINE_SETUP_AGENT } from '../tools/AgentTool/built-in/statuslineSetup.js'

const originalSimpleEnv = process.env.aiko_CODE_SIMPLE

afterEach(() => {
  process.env.aiko_CODE_SIMPLE = originalSimpleEnv
  clearSystemPromptSections()
})

test('CLI identity prefixes describe aiko-code instead of aiko Code', () => {
  expect(getCLISyspromptPrefix()).toContain('aiko-code')
  expect(getCLISyspromptPrefix()).not.toContain('aiko Code')
  expect(getCLISyspromptPrefix()).not.toContain("Anthropic's official CLI for aiko")

  for (const prefix of CLI_SYSPROMPT_PREFIXES) {
    expect(prefix).toContain('aiko-code')
    expect(prefix).not.toContain('aiko Code')
    expect(prefix).not.toContain("Anthropic's official CLI for aiko")
  }
})

test('simple mode identity describes aiko-code instead of aiko Code', async () => {
  process.env.aiko_CODE_SIMPLE = '1'

  const prompt = await getSystemPrompt([], 'gpt-4o')

  expect(prompt[0]).toContain('aiko-code')
  expect(prompt[0]).not.toContain('aiko Code')
  expect(prompt[0]).not.toContain("Anthropic's official CLI for aiko")
})

test('system prompt model identity updates when model changes mid-session', async () => {
  delete process.env.aiko_CODE_SIMPLE
  clearSystemPromptSections()

  const firstPrompt = await getSystemPrompt([], 'old-test-model')
  const secondPrompt = await getSystemPrompt([], 'new-test-model')

  const firstText = firstPrompt.join('\n')
  const secondText = secondPrompt.join('\n')

  expect(firstText).toContain('You are powered by the model old-test-model.')
  expect(secondText).toContain('You are powered by the model new-test-model.')
  expect(secondText).not.toContain('You are powered by the model old-test-model.')
})

test('built-in agent prompts describe aiko-code instead of aiko Code', () => {
  expect(DEFAULT_AGENT_PROMPT).toContain('aiko-code')
  expect(DEFAULT_AGENT_PROMPT).not.toContain('aiko Code')
  expect(DEFAULT_AGENT_PROMPT).not.toContain("Anthropic's official CLI for aiko")

  const generalPrompt = GENERAL_PURPOSE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(generalPrompt).toContain('aiko-code')
  expect(generalPrompt).not.toContain('aiko Code')
  expect(generalPrompt).not.toContain("Anthropic's official CLI for aiko")

  const explorePrompt = EXPLORE_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(explorePrompt).toContain('aiko-code')
  expect(explorePrompt).not.toContain('aiko Code')
  expect(explorePrompt).not.toContain("Anthropic's official CLI for aiko")

  const planPrompt = PLAN_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(planPrompt).toContain('aiko-code')
  expect(planPrompt).not.toContain('aiko Code')

  const statuslinePrompt = STATUSLINE_SETUP_AGENT.getSystemPrompt({
    toolUseContext: { options: {} as never },
  })
  expect(statuslinePrompt).toContain('aiko-code')
  expect(statuslinePrompt).not.toContain('aiko Code')

  const guidePrompt = aiko_CODE_GUIDE_AGENT.getSystemPrompt({
    toolUseContext: {
      options: {
        commands: [],
        agentDefinitions: { activeAgents: [] },
        mcpClients: [],
      } as never,
    },
  })
  expect(guidePrompt).toContain('aiko-code')
  expect(guidePrompt).toContain('You are the aiko-code guide agent.')
  expect(guidePrompt).toContain('**aiko-code** (the CLI tool)')
  expect(guidePrompt).not.toContain('You are the aiko guide agent.')
  expect(guidePrompt).not.toContain('**aiko Code** (the CLI tool)')
})
