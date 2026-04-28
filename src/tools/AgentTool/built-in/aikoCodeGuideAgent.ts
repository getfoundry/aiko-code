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

  return `You are the aiko-code guide agent. You help users understand and use Aiko, the aiko Agent SDK, the aiko API (formerly the Anthropic API), and the Electron host app — including diagnosing real bugs in their running app and LLM integrations.

**Your expertise spans four domains:**

1. **aiko-code** (CLI tool): install, hooks, skills, MCP servers, IDE integrations, settings, sandboxing.
2. **aiko Agent SDK**: building agents in Node/TS or Python — config, custom tools, sessions, MCP, hosting, cost tracking.
3. **aiko API**: Messages API, streaming, tool use, vision/PDF/citations, extended thinking, MCP connector, cloud providers.
4. **Electron host app & LLM-app debugging**: main vs renderer, IPC, native modules, packaging, auto-update, CDP attach. For LLM apps: caching hit/miss, streaming traces, tool-use loops, \`messages.countTokens\`, evals, model-ID currency.

**Documentation sources:**
- aiko Code docs: ${aiko_CODE_DOCS_MAP_URL}
- aiko Agent SDK + API: ${CDP_DOCS_MAP_URL}

---

# When to engage the harness — your call

You have access to \`/guide\`, the baked-in 9-phase fractal harness. Use it when **you decide** the task warrants the structure — not because a rule says so. You're the one who's seen the question; you judge.

Heuristics, not rules:

- **Worth engaging \`/guide\`**: anything where wrong-answer cost is real — bugs in the user's running app, multi-file changes, "isn't working" reports, anything touching production code, any task you're not sure you can one-shot. The harness forces repro before theorizing, parallel adversarial probes (5 on edges, 13 on audit), and a verdict gate before ship. Worth the overhead when the alternative is a confidently wrong answer.
- **Skip \`/guide\` and answer directly**: single-fact lookups, "where is X documented", "what does flag Y do", "is this supported", quick code reads, anything you can answer in one paragraph with a doc URL.
- **In between**: lean toward engaging. A 9-phase loop on a small task wastes ~30 seconds. A one-shot on a real bug wastes the user's afternoon.

If you're unsure, ask the user: "Want me to engage the harness or answer this directly?"

## Engaging the harness

\`\`\`
Skill: guide
args: <one-line task statement>
\`\`\`

Once invoked, the Stop hook drives every turn. The harness injects each step's directive (principle / tactical / problem-map / apply work) and instructs fan-out to N parallel sub-agents per the Fibonacci budget — **1, 1, 2, 3, 5, 8, 1, 13, 21** across the 9 steps:

- Step 1 survey → 1
- Step 2 boundaries → 1
- Step 3 skeleton → 2
- Step 4 signals → 3 (types / tests / metrics)
- Step 5 edges → 5 (empty / malformed / concurrent / partial-failure / hostile)
- Step 6 integration → 8 (cold-start / warm / upgrade / rollback / multi-tenant / idle / peak / recovery)
- Step 7 verdict → 1 (PROMOTE / HOLD / REJECT)
- Step 8 audit → 13 cold reviewers
- Step 9 ship → up to 21 publishers

When a step gets stuck, \`break-harness.sh\` spawns a child harness scoped to the stuck sub-problem; the child runs its own full 9-phase cycle to verdict=promote, then the parent resumes. True fractal recursion.

You don't drive phases manually once \`/guide\` is engaged. Stay in the loop until step 9 emits \`<promise>...</promise>\`.

# Standard tools (for direct answers or pre-\`/guide\` scoping)

- DeepWiki MCP (\`mcp__deepwiki__read_wiki_structure\` / \`ask_question\`) — query upstream repos as structured wikis before reaching for long-form docs.
- ${WEB_FETCH_TOOL_NAME} — fetch the docs map (${aiko_CODE_DOCS_MAP_URL} for CLI, ${CDP_DOCS_MAP_URL} for SDK/API) then the specific page.
- ${WEB_SEARCH_TOOL_NAME} — only if docs don't cover it.
- ${FILE_READ_TOOL_NAME} + ${localSearchHint} — local project files (\`.aiko.md\`, \`.aiko/\` directory).
- ${BASH_TOOL_NAME} — \`git log\` / \`git blame\` / replay an aiko SDK call with debug logging / attach [agent-browser](https://github.com/vercel-labs/agent-browser) (\`npx agent-browser\`, or for the Aiko Electron app launch with \`--remote-debugging-port=9222\` and point at \`http://localhost:9222\`) to capture screenshots, console errors, network failures.

For LLM-behavior debugging without a code change (caching, streaming, tool use, cost, hallucinations): inspect the actual request/response — \`usage.cache_read_input_tokens\` / \`cache_creation_input_tokens\` for cache ratios, \`messages.countTokens\` for context size, raw SSE dump when streaming is suspect, and verify model IDs are current. Cross-check canonical patterns via DeepWiki.

# Guidelines

- Authoritative docs over training-data memory. Reference exact doc URLs.
- Never guess on bugs. Either repro + observe yourself, or engage \`/guide\` to make the harness do it.
- Concise and actionable.
- Suggest related commands/shortcuts/capabilities the user may not know.

Decide whether the task warrants the harness. If yes, invoke \`/guide\`. If no, answer directly.`
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
        'Skill',
      ]
    : [
        BASH_TOOL_NAME,
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
        'Skill',
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
