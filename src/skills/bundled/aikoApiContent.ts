// Content for the aiko-api bundled skill.
// Each .md file is inlined as a string at build time via Bun's text loader.

import csharpaikoApi from './aiko-api/csharp/aiko-api.md'
import curlExamples from './aiko-api/curl/examples.md'
import goaikoApi from './aiko-api/go/aiko-api.md'
import javaaikoApi from './aiko-api/java/aiko-api.md'
import phpaikoApi from './aiko-api/php/aiko-api.md'
import pythonAgentSdkPatterns from './aiko-api/python/agent-sdk/patterns.md'
import pythonAgentSdkReadme from './aiko-api/python/agent-sdk/README.md'
import pythonaikoApiBatches from './aiko-api/python/aiko-api/batches.md'
import pythonaikoApiFilesApi from './aiko-api/python/aiko-api/files-api.md'
import pythonaikoApiReadme from './aiko-api/python/aiko-api/README.md'
import pythonaikoApiStreaming from './aiko-api/python/aiko-api/streaming.md'
import pythonaikoApiToolUse from './aiko-api/python/aiko-api/tool-use.md'
import rubyaikoApi from './aiko-api/ruby/aiko-api.md'
import skillPrompt from './aiko-api/SKILL.md'
import sharedErrorCodes from './aiko-api/shared/error-codes.md'
import sharedLiveSources from './aiko-api/shared/live-sources.md'
import sharedModels from './aiko-api/shared/models.md'
import sharedPromptCaching from './aiko-api/shared/prompt-caching.md'
import sharedToolUseConcepts from './aiko-api/shared/tool-use-concepts.md'
import typescriptAgentSdkPatterns from './aiko-api/typescript/agent-sdk/patterns.md'
import typescriptAgentSdkReadme from './aiko-api/typescript/agent-sdk/README.md'
import typescriptaikoApiBatches from './aiko-api/typescript/aiko-api/batches.md'
import typescriptaikoApiFilesApi from './aiko-api/typescript/aiko-api/files-api.md'
import typescriptaikoApiReadme from './aiko-api/typescript/aiko-api/README.md'
import typescriptaikoApiStreaming from './aiko-api/typescript/aiko-api/streaming.md'
import typescriptaikoApiToolUse from './aiko-api/typescript/aiko-api/tool-use.md'

// @[MODEL LAUNCH]: Update the model IDs/names below. These are substituted into {{VAR}}
// placeholders in the .md files at runtime before the skill prompt is sent.
// After updating these constants, manually update the two files that still hardcode models:
//   - aiko-api/SKILL.md (Current Models pricing table)
//   - aiko-api/shared/models.md (full model catalog with legacy versions and alias mappings)
export const SKILL_MODEL_VARS = {
  OPUS_ID: 'aiko-opus-4-6',
  OPUS_NAME: 'aiko Opus 4.6',
  SONNET_ID: 'aiko-sonnet-4-6',
  SONNET_NAME: 'aiko Sonnet 4.6',
  HAIKU_ID: 'aiko-haiku-4-5',
  HAIKU_NAME: 'aiko Haiku 4.5',
  // Previous Sonnet ID — used in "do not append date suffixes" example in SKILL.md.
  PREV_SONNET_ID: 'aiko-sonnet-4-5',
} satisfies Record<string, string>

export const SKILL_PROMPT: string = skillPrompt

export const SKILL_FILES: Record<string, string> = {
  'csharp/aiko-api.md': csharpaikoApi,
  'curl/examples.md': curlExamples,
  'go/aiko-api.md': goaikoApi,
  'java/aiko-api.md': javaaikoApi,
  'php/aiko-api.md': phpaikoApi,
  'python/agent-sdk/README.md': pythonAgentSdkReadme,
  'python/agent-sdk/patterns.md': pythonAgentSdkPatterns,
  'python/aiko-api/README.md': pythonaikoApiReadme,
  'python/aiko-api/batches.md': pythonaikoApiBatches,
  'python/aiko-api/files-api.md': pythonaikoApiFilesApi,
  'python/aiko-api/streaming.md': pythonaikoApiStreaming,
  'python/aiko-api/tool-use.md': pythonaikoApiToolUse,
  'ruby/aiko-api.md': rubyaikoApi,
  'shared/error-codes.md': sharedErrorCodes,
  'shared/live-sources.md': sharedLiveSources,
  'shared/models.md': sharedModels,
  'shared/prompt-caching.md': sharedPromptCaching,
  'shared/tool-use-concepts.md': sharedToolUseConcepts,
  'typescript/agent-sdk/README.md': typescriptAgentSdkReadme,
  'typescript/agent-sdk/patterns.md': typescriptAgentSdkPatterns,
  'typescript/aiko-api/README.md': typescriptaikoApiReadme,
  'typescript/aiko-api/batches.md': typescriptaikoApiBatches,
  'typescript/aiko-api/files-api.md': typescriptaikoApiFilesApi,
  'typescript/aiko-api/streaming.md': typescriptaikoApiStreaming,
  'typescript/aiko-api/tool-use.md': typescriptaikoApiToolUse,
}
