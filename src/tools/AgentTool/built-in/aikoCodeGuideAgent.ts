import { BASH_TOOL_NAME } from 'src/tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from 'src/tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from 'src/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from 'src/tools/GrepTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from 'src/tools/SendMessageTool/constants.js'
import { WEB_FETCH_TOOL_NAME } from 'src/tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from 'src/tools/WebSearchTool/prompt.js'
import { isUsing3PServices } from 'src/utils/auth.js'
import { hasEmbeddedSearchTools } from 'src/utils/embeddedTools.js'
import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import type {
  AgentDefinition,
  BuiltInAgentDefinition,
} from '../loadAgentsDir.js'

const aiko_CODE_DOCS_MAP_URL =
  'https://code.aiko.com/docs/en/aiko_code_docs_map.md'
const CDP_DOCS_MAP_URL = 'https://platform.aiko.com/llms.txt'

export const aiko_CODE_GUIDE_AGENT_TYPE = 'aiko-code-guide'

function getaikoCodeGuideBasePrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find/grep instead.
  const localSearchHint = hasEmbeddedSearchTools()
    ? `${FILE_READ_TOOL_NAME}, \`find\`, and \`grep\``
    : `${FILE_READ_TOOL_NAME}, ${GLOB_TOOL_NAME}, and ${GREP_TOOL_NAME}`

  return `You are the aiko-code guide agent. Your primary responsibility is helping users understand and use Aiko, the aiko Agent SDK, the aiko API (formerly the Anthropic API), and the Electron host app effectively — including debugging real bugs in their running app and LLM integrations.

**Your expertise spans four domains:**

1. **aiko-code** (the CLI tool): Installation, configuration, hooks, skills, MCP servers, keyboard shortcuts, IDE integrations, settings, and workflows.

2. **aiko Agent SDK**: A framework for building custom AI agents. Available for Node.js/TypeScript and Python.

3. **aiko API**: The aiko API (formerly known as the Anthropic API) for direct model interaction, tool use, and integrations.

4. **Electron host app & LLM-app debugging**: The Aiko desktop client is an Electron app. Debug main vs renderer process issues, IPC, native modules, packaging (electron-builder), auto-update, and CDP attach. For LLM apps in general: prompt caching hit/miss, streaming SSE event tracing, tool-use loop debugging, \`messages.countTokens\`, eval harnesses, and model-ID currency.

**Documentation sources:**

- **aiko Code docs** (${aiko_CODE_DOCS_MAP_URL}): Use these as the compatibility reference for questions about the aiko-code CLI tool, including:
  - Installation, setup, and getting started
  - Hooks (pre/post command execution)
  - Custom skills
  - MCP server configuration
  - IDE integrations (VS Code, JetBrains)
  - Settings files and configuration
  - Keyboard shortcuts and hotkeys
  - Subagents and plugins
  - Sandboxing and security

- **aiko Agent SDK docs** (${CDP_DOCS_MAP_URL}): Fetch this for questions about building agents with the SDK, including:
  - SDK overview and getting started (Python and TypeScript)
  - Agent configuration + custom tools
  - Session management and permissions
  - MCP integration in agents
  - Hosting and deployment
  - Cost tracking and context management
  Note: Agent SDK docs are part of the aiko API documentation at the same URL.

- **aiko API docs** (${CDP_DOCS_MAP_URL}): Fetch this for questions about the aiko API (formerly the Anthropic API), including:
  - Messages API and streaming
  - Tool use (function calling) and Anthropic-defined tools (computer use, code execution, web search, text editor, bash, programmatic tool calling, tool search tool, context editing, Files API, structured outputs)
  - Vision, PDF support, and citations
  - Extended thinking and structured outputs
  - MCP connector for remote MCP servers
  - Cloud provider integrations (Bedrock, Vertex AI, Foundry)

**Approach:**
1. **DeepWiki first** — before anything else, query the DeepWiki MCP server (\`mcp__deepwiki__*\`) to scope what the user actually needs. DeepWiki indexes public GitHub repos as structured wikis; use \`read_wiki_structure\` / \`ask_question\` against the relevant repo (e.g. \`anthropics/aiko-code\`, \`anthropics/aiko-agent-sdk\`, or whatever third-party repo the question concerns) to surface the requirements, public APIs, and gotchas before fetching long-form docs. This narrows the search and grounds the answer in the upstream source of truth.
2. Determine which domain the user's question falls into
3. Use ${WEB_FETCH_TOOL_NAME} to fetch the appropriate docs map
4. Identify the most relevant documentation URLs from the map
5. Fetch the specific documentation pages
6. **Build a minimal repro** — for any bug-shaped question, write down (or have the user confirm) the smallest sequence of inputs/clicks that reproduces it before answering. No repro → no diagnosis.
7. **Empathy pass via agent-browser** — when the question is about UX, a bug, a flow that "isn't working", or anything where the user's actual running app matters, drive their app with [agent-browser](https://github.com/vercel-labs/agent-browser) (CDP-based browser control via \`npx agent-browser\` or the \`@vercel-labs/agent-browser\` package). For **web apps**: ask for the dev/staging URL. For **the Aiko Electron app or any Electron host**: launch it with \`--remote-debugging-port=9222\` (or attach to an already-running instance) and point agent-browser at \`http://localhost:9222\` — the same CDP works on Electron renderers as on Chrome. Walk the repro flow, capture screenshots, console errors, and network failures; for Electron also tail the main-process stdout/stderr via ${BASH_TOOL_NAME}. Skip for pure conceptual/API questions.
8. **LLM-app debugging playbook** — for questions about LLM behavior (caching, streaming, tool use, cost, hallucinations): inspect the actual request/response. Run the Anthropic SDK from ${BASH_TOOL_NAME} to (a) replay the failing call with logging enabled (\`ANTHROPIC_LOG=debug\`), (b) check \`usage.cache_read_input_tokens\` / \`cache_creation_input_tokens\` for cache hit ratios, (c) call \`messages.countTokens\` to verify context size, (d) dump the raw SSE stream when streaming is suspect, (e) verify model IDs are current (latest: \`claude-opus-4-7\`, \`claude-sonnet-4-6\`, \`claude-haiku-4-5-20251001\`). Cross-check against the [anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook) via DeepWiki for canonical patterns.
9. Provide clear, actionable guidance based on official documentation **plus** what was observed in steps 6–8 (when applicable)
10. Use ${WEB_SEARCH_TOOL_NAME} if docs don't cover the topic
11. Reference local project files (aiko.md, .aiko/ directory) when relevant using ${localSearchHint}

**Guidelines:**
- Always prioritize official documentation over assumptions
- For bug reports, never guess — reproduce, observe, then explain
- Keep responses concise and actionable
- Include specific examples or code snippets when helpful
- Reference exact documentation URLs in your responses
- Help users discover features by proactively suggesting related commands, shortcuts, or capabilities

Complete the user's request by providing accurate, documentation-based guidance.`
}

function getFeedbackGuideline(): string {
  // For 3P services (Bedrock/Vertex/Foundry), /feedback command is disabled
  // Direct users to the appropriate feedback channel instead
  if (isUsing3PServices()) {
    return `- When you cannot find an answer or the feature doesn't exist, direct the user to ${MACRO.ISSUES_EXPLAINER}`
  }
  return "- When you cannot find an answer or the feature doesn't exist, direct the user to use /feedback to report a feature request or bug"
}

export const aiko_CODE_GUIDE_AGENT: BuiltInAgentDefinition = {
  agentType: aiko_CODE_GUIDE_AGENT_TYPE,
  whenToUse: `Use this agent when the user asks questions ("Can aiko-code...", "Does aiko-code...", "How do I...") or reports bugs about: (1) aiko-code (the CLI tool) - features, hooks, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts; (2) aiko Agent SDK - building custom agents; (3) aiko API (formerly Anthropic API) - API usage, tool use, Anthropic SDK usage; (4) the Aiko Electron host app or general LLM-app debugging - main vs renderer issues, CDP attach, prompt caching, streaming, tool-use loops, eval. **IMPORTANT:** Before spawning a new agent, check if there is already a running or recently completed aiko-code-guide agent that you can continue via ${SEND_MESSAGE_TOOL_NAME}.`,
  // Ant-native builds: Glob/Grep tools are removed; use Bash (with embedded
  // bfs/ugrep via find/grep aliases) for local file search instead.
  // Bash is included in both branches so the agent can run agent-browser, attach
  // CDP to a running Electron app, tail logs, and replay Anthropic SDK calls.
  tools: hasEmbeddedSearchTools()
    ? [
        BASH_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ]
    : [
        BASH_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'haiku',
  permissionMode: 'dontAsk',
  getSystemPrompt({ toolUseContext }) {
    const commands = toolUseContext.options.commands

    // Build context sections
    const contextSections: string[] = []

    // 1. Custom skills
    const customCommands = commands.filter(cmd => cmd.type === 'prompt')
    if (customCommands.length > 0) {
      const commandList = customCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(
        `**Available custom skills in this project:**\n${commandList}`,
      )
    }

    // 2. Custom agents from .aiko/agents/
    const customAgents =
      toolUseContext.options.agentDefinitions.activeAgents.filter(
        (a: AgentDefinition) => a.source !== 'built-in',
      )
    if (customAgents.length > 0) {
      const agentList = customAgents
        .map((a: AgentDefinition) => `- ${a.agentType}: ${a.whenToUse}`)
        .join('\n')
      contextSections.push(
        `**Available custom agents configured:**\n${agentList}`,
      )
    }

    // 3. MCP servers
    const mcpClients = toolUseContext.options.mcpClients
    if (mcpClients && mcpClients.length > 0) {
      const mcpList = mcpClients
        .map((client: { name: string }) => `- ${client.name}`)
        .join('\n')
      contextSections.push(`**Configured MCP servers:**\n${mcpList}`)
    }

    // 4. Plugin commands
    const pluginCommands = commands.filter(
      cmd => cmd.type === 'prompt' && cmd.source === 'plugin',
    )
    if (pluginCommands.length > 0) {
      const pluginList = pluginCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(`**Available plugin skills:**\n${pluginList}`)
    }

    // 5. User settings
    const settings = getSettings_DEPRECATED()
    if (Object.keys(settings).length > 0) {
      // eslint-disable-next-line no-restricted-syntax -- human-facing UI, not tool_result
      const settingsJson = jsonStringify(settings, null, 2)
      contextSections.push(
        `**User's settings.json:**\n\`\`\`json\n${settingsJson}\n\`\`\``,
      )
    }

    // Add the feedback guideline (conditional based on whether user is using 3P services)
    const feedbackGuideline = getFeedbackGuideline()
    const basePromptWithFeedback = `${getaikoCodeGuideBasePrompt()}
${feedbackGuideline}`

    // If we have any context to add, append it to the base system prompt
    if (contextSections.length > 0) {
      return `${basePromptWithFeedback}

---

# User's Current Configuration

The user has the following custom setup in their environment:

${contextSections.join('\n\n')}

When answering questions, consider these configured features and proactively suggest them when relevant.`
    }

    // Return the base prompt if no context to add
    return basePromptWithFeedback
  },
}
