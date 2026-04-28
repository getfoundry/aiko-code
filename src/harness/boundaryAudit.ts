/**
 * Language-agnostic dependency-boundary audit driven by LSP.
 *
 * Answers: "is every <consumer> in scope of its required <producer> at runtime?"
 *
 * Producer/consumer pairs are language-specific patterns (React Context's
 * `*Provider` and `use*`, Spring's `@Component`/`@Autowired`, pytest fixtures
 * vs `def test_*`, etc.). This module ships a small default registry; users
 * can extend it via .aiko/boundary-patterns.json in the workspace.
 *
 * Discovery uses LSP `workspace/symbol` + `textDocument/references`. The
 * containment check (whether a consumer's runtime tree includes its producer's
 * mount point) is the part LSP doesn't natively answer — it requires
 * tree-sitter-grade structural analysis on top. For now we emit the
 * producer/consumer pairs the LSP found and let the consumer of this output
 * (the harness step 1 directive, or a human reviewer) reason about containment.
 *
 * Future extensions:
 *  - Tree-sitter JSX tree analysis for React-specific containment.
 *  - DI graph reasoning for Spring/Guice via class-hierarchy queries.
 *  - Module-init-order containment for FFI / dotenv / lazy-load patterns.
 */
import { existsSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import {
  getLspServerManager,
  isLspConnected,
  waitForInitialization,
} from '../services/lsp/manager.js'
import { scanWithTsAst } from './tsAstScanner.js'

export type BoundaryPattern = {
  /** Stable identifier — used in findings output and config overrides. */
  name: string
  /** Display name. */
  description: string
  /** File extensions this pattern applies to (without leading dot). */
  extensions: readonly string[]
  /** Producer matches — symbol-name regex. */
  producer: RegExp
  /** Consumer matches — symbol-name regex. */
  consumer: RegExp
  /** Human-friendly fix hint shown in the audit report. */
  fixHint: string
  /**
   * Optional docs grounding. When LSP + scanner both fail to find producers
   * or consumers, the audit emits a structured "ask DeepWiki <repo>" hint
   * with this template. The model executes the actual DeepWiki call during
   * step 1 (it has MCP access; the stop hook doesn't). The placeholders
   * `${producer}` and `${consumer}` are interpolated from the pattern's
   * regex source string for human-readable framing.
   */
  docs?: {
    /** GitHub owner/repo slug for DeepWiki queries (e.g. "wevm/wagmi"). */
    repo: string
    /** Question template for `mcp__deepwiki__ask_question`. */
    questionTemplate: string
  }
}

/**
 * Default pattern registry. Conservative — only patterns that are well-defined
 * cross-codebase. Workspaces can extend via .aiko/boundary-patterns.json.
 */
export const DEFAULT_PATTERNS: readonly BoundaryPattern[] = [
  {
    name: 'react-context',
    description: 'React Context provider / consumer (e.g. WagmiProvider + useConfig)',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    producer: /Provider$/,
    consumer: /^use[A-Z]/,
    fixHint:
      'Hoist the provider to a common ancestor of every consumer (root layout for app-wide context), or wrap the specific consumer subtree.',
    docs: {
      repo: 'facebook/react',
      questionTemplate:
        'For a React Context provider matching pattern "${producer}" with hook consumer "${consumer}", what are the standard mount-point patterns and which components in a Next.js App Router or Vite SPA typically consume it? Cite source files and line numbers.',
    },
  },
  {
    name: 'spring-di',
    description: 'Spring DI — @Component / @Service / @Repository vs @Autowired',
    extensions: ['java', 'kt'],
    producer: /^(Component|Service|Repository|Configuration|Bean)$/,
    consumer: /^Autowired$|^Inject$/,
    fixHint:
      'Ensure the consumer class is in the @ComponentScan path of the configuration that registers the producer, or annotate it with @Component itself.',
    docs: {
      repo: 'spring-projects/spring-framework',
      questionTemplate:
        'How does Spring resolve "${consumer}" against "${producer}" beans? What scope/component-scan rules govern visibility, and what are the canonical failure modes when a consumer is outside the producer\'s scan path?',
    },
  },
  {
    name: 'pytest-fixture',
    description: 'pytest fixture vs test function consumer',
    extensions: ['py'],
    producer: /^pytest\.fixture$/,
    consumer: /^test_[a-zA-Z_]+$/,
    fixHint:
      'Move the fixture into conftest.py at or above the test directory, or import it explicitly in the test module.',
    docs: {
      repo: 'pytest-dev/pytest',
      questionTemplate:
        'Where should a pytest fixture decorated with @pytest.fixture be defined so that test functions matching "${consumer}" can consume it? What conftest.py placement rules govern fixture visibility and what is the canonical failure when placement is wrong?',
    },
  },
  {
    name: 'react-hook-client-only',
    description: 'React hook called from a non-"use client" file (Next.js App Router)',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    producer: /^['"]use client['"]$/,
    consumer: /^use[A-Z]/,
    fixHint: 'Add `"use client"` directive to the top of the file containing the hook call site.',
    docs: {
      repo: 'vercel/next.js',
      questionTemplate:
        'In Next.js App Router, when can a React hook like "${consumer}" be called and what happens if the file lacks the "use client" directive? Cite canonical guidance and typical error shapes.',
    },
  },
]

export type BoundaryFinding = {
  pattern: string
  producer: { symbol: string; file: string; line: number }
  consumer: { symbol: string; file: string; line: number }
  inScopeHeuristic: 'unknown' | 'likely' | 'unlikely'
  fixHint: string
}

export type AuditOptions = {
  cwd: string
  patterns?: readonly BoundaryPattern[]
  /** Maximum producer/consumer pairs to enumerate per pattern. Cap protects against giant workspaces. */
  maxPairsPerPattern?: number
}

export type AuditResult = {
  findings: BoundaryFinding[]
  /**
   * DeepWiki follow-up queries the model should run during step 1. Emitted
   * when LSP + bundled scanner both came up empty for a pattern that has a
   * `docs.repo` configured. Tier-3 fallback: when local code analysis can't
   * find producer/consumer symbols, ask the canonical upstream repo's docs
   * what the patterns should look like.
   */
  docsFollowups: Array<{
    pattern: string
    repo: string
    question: string
    reason: string
  }>
  diagnostics: {
    lspReachable: boolean
    languagesProbed: string[]
    patternsApplied: string[]
    notes: string[]
  }
}

/**
 * Run the boundary audit against the workspace at `opts.cwd`. Returns
 * findings + diagnostics. Never throws — degrades gracefully when LSP
 * isn't reachable for a given language.
 */
export async function runBoundaryAudit(
  opts: AuditOptions,
): Promise<AuditResult> {
  const cwd = resolve(opts.cwd)
  const patterns = loadPatterns(cwd, opts.patterns ?? DEFAULT_PATTERNS)
  const maxPairs = opts.maxPairsPerPattern ?? 50

  const notes: string[] = []
  const findings: BoundaryFinding[] = []
  const languagesProbed = new Set<string>()
  const patternsApplied: string[] = []
  const backends: string[] = []
  const docsFollowups: AuditResult['docsFollowups'] = []

  await waitForInitialization()
  const lsp = getLspServerManager()
  const lspReachable = lsp != null && isLspConnected()

  if (!lspReachable) {
    notes.push(
      'LSP not reachable in this aiko-code session (no plugin contributing language servers). Falling back to the bundled regex/AST-light scanner. For full AST precision, configure serena MCP server (https://github.com/oraios/serena) — adds semantic queries with alias / re-export resolution across every language with an LSP server installed.',
    )
  }

  for (const pattern of patterns) {
    patternsApplied.push(pattern.name)
    for (const ext of pattern.extensions) languagesProbed.add(ext)

    const sampleFile = findSampleFile(cwd, pattern.extensions)
    if (!sampleFile) {
      notes.push(`pattern=${pattern.name}: no files with extensions ${pattern.extensions.join(',')} — skipping`)
      continue
    }

    let producers: SymbolHit[] = []
    let consumers: SymbolHit[] = []
    let usedBackend: 'lsp' | 'ts-ast' | 'docs-only' = 'docs-only'

    // Tier-1: LSP (semantic, alias-aware). Best precision when configured —
    // serena MCP is the recommended way to get this without an fcode plugin.
    if (lsp && lspReachable) {
      producers = await querySymbols(lsp, sampleFile, pattern.producer, maxPairs)
      consumers = await querySymbols(lsp, sampleFile, pattern.consumer, maxPairs)
      if (producers.length > 0 || consumers.length > 0) {
        usedBackend = 'lsp'
      }
    }

    // Tier-2: TypeScript AST (proper syntax tree, alias resolution for
    // imports). Runs when LSP came up empty AND the pattern targets TS-family
    // extensions. Returns null when no matching files exist or TS module
    // unavailable.
    if (producers.length === 0 && consumers.length === 0) {
      const ast = await scanWithTsAst(cwd, pattern, maxPairs)
      if (ast && (ast.producers.length > 0 || ast.consumers.length > 0)) {
        producers = ast.producers
        consumers = ast.consumers
        usedBackend = 'ts-ast'
      }
    }

    // No tier-3 regex fallback — regex scanning produces noisy false
    // positives without semantic precision. If LSP+AST both came up empty,
    // emit a DeepWiki query (handled below) so the model grounds the pattern
    // in canonical docs rather than guessing from grep results.

    // Tier-3 fallback: if both LSP and scanner came up empty AND the pattern
    // has docs configured, emit a structured DeepWiki query the model should
    // run during step 1. The stop hook can't call MCP itself; the model can.
    if (
      (producers.length === 0 || consumers.length === 0) &&
      pattern.docs != null
    ) {
      docsFollowups.push({
        pattern: pattern.name,
        repo: pattern.docs.repo,
        question: pattern.docs.questionTemplate
          .replace(/\$\{producer\}/g, pattern.producer.source)
          .replace(/\$\{consumer\}/g, pattern.consumer.source),
        reason:
          producers.length === 0 && consumers.length === 0
            ? 'no producer or consumer symbols found locally'
            : producers.length === 0
              ? 'no producer symbols found locally'
              : 'no consumer symbols found locally',
      })
    }

    if (producers.length === 0) {
      notes.push(`pattern=${pattern.name}: no producer symbols found (backend=${usedBackend})`)
      continue
    }
    if (consumers.length === 0) {
      notes.push(`pattern=${pattern.name}: no consumer symbols found (backend=${usedBackend})`)
      continue
    }

    backends.push(`${pattern.name}=${usedBackend}`)

    for (const consumer of consumers) {
      for (const producer of producers) {
        findings.push({
          pattern: pattern.name,
          producer,
          consumer,
          inScopeHeuristic: heuristicScope(producer, consumer, cwd),
          fixHint: pattern.fixHint,
        })
        if (findings.length >= maxPairs * 4) break
      }
      if (findings.length >= maxPairs * 4) break
    }
  }

  return {
    findings,
    docsFollowups,
    diagnostics: {
      lspReachable,
      languagesProbed: [...languagesProbed],
      patternsApplied,
      notes: backends.length > 0 ? [`Backends used: ${backends.join(', ')}`, ...notes] : notes,
    },
  }
}

/**
 * Load pattern overrides from .aiko/boundary-patterns.json if present, else
 * return the defaults. The override file shape mirrors BoundaryPattern but
 * uses string regex source instead of compiled RegExp.
 */
function loadPatterns(
  cwd: string,
  defaults: readonly BoundaryPattern[],
): readonly BoundaryPattern[] {
  const overridePath = resolve(cwd, '.aiko/boundary-patterns.json')
  if (!existsSync(overridePath)) return defaults
  try {
    const raw = readFileSync(overridePath, 'utf8')
    const parsed = JSON.parse(raw) as Array<{
      name: string
      description: string
      extensions: string[]
      producer: string
      consumer: string
      fixHint: string
    }>
    return parsed.map(p => ({
      name: p.name,
      description: p.description,
      extensions: p.extensions,
      producer: new RegExp(p.producer),
      consumer: new RegExp(p.consumer),
      fixHint: p.fixHint,
    }))
  } catch {
    return defaults
  }
}

type SymbolHit = { symbol: string; file: string; line: number }

/**
 * Query the LSP server registered for `sampleFile`'s language for
 * workspace-wide symbols whose name matches `nameRegex`. Returns hits
 * deduplicated by file:line.
 */
async function querySymbols(
  lsp: ReturnType<typeof getLspServerManager>,
  sampleFile: string,
  nameRegex: RegExp,
  cap: number,
): Promise<SymbolHit[]> {
  if (!lsp) return []
  type WorkspaceSymbol = {
    name: string
    location: { uri: string; range: { start: { line: number } } }
  }
  // Ensure the language server for this file's language is actually running.
  // The LSP manager loads configured server _definitions_ at CLI startup, but
  // each server is spun up lazily on first file access. Without this call,
  // workspace/symbol returns nothing because the server hasn't been started.
  try {
    await lsp.ensureServerStarted(sampleFile)
  } catch {
    return []
  }
  let results: WorkspaceSymbol[] | undefined
  try {
    results = await lsp.sendRequest<WorkspaceSymbol[]>(
      sampleFile,
      'workspace/symbol',
      { query: '' },
    )
  } catch {
    return []
  }
  if (!Array.isArray(results)) return []
  const seen = new Set<string>()
  const hits: SymbolHit[] = []
  for (const sym of results) {
    if (!sym?.name || !sym.location?.uri) continue
    if (!nameRegex.test(sym.name)) continue
    const file = uriToPath(sym.location.uri)
    const line = (sym.location.range?.start?.line ?? 0) + 1
    const key = `${sym.name}@${file}:${line}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ symbol: sym.name, file, line })
    if (hits.length >= cap) break
  }
  return hits
}

function uriToPath(uri: string): string {
  if (uri.startsWith('file://')) return decodeURIComponent(uri.slice(7))
  return uri
}

/**
 * Heuristic scope check. LSP can't tell us whether a JSX consumer is mounted
 * inside a JSX provider's tree — that's structural. We approximate with:
 *   - same file → 'likely' in scope
 *   - same directory → 'likely'
 *   - cross-package → 'unlikely'
 *   - else → 'unknown' (the harness step 1 directive should escalate to
 *     tree-sitter or have the model reason about it)
 */
function heuristicScope(
  producer: SymbolHit,
  consumer: SymbolHit,
  cwd: string,
): 'unknown' | 'likely' | 'unlikely' {
  if (producer.file === consumer.file) return 'likely'
  const pRel = relative(cwd, producer.file).split('/')
  const cRel = relative(cwd, consumer.file).split('/')
  if (pRel[0] !== cRel[0]) return 'unlikely'
  return 'unknown'
}

/**
 * Find one file in `cwd` matching the given extensions. Used as the routing
 * key for the LSP server (the manager picks the server based on the file's
 * extension, then the workspace/symbol query is workspace-scoped).
 */
function findSampleFile(cwd: string, extensions: readonly string[]): string | null {
  const exts = new Set(extensions.map(e => `.${e.replace(/^\./, '')}`))
  // Conservative walk — only top-level src/ + cwd, no node_modules.
  const candidates = ['src', '.']
  for (const dir of candidates) {
    const found = walkOnce(resolve(cwd, dir), exts, 4)
    if (found) return found
  }
  return null
}

function walkOnce(
  root: string,
  exts: Set<string>,
  maxDepth: number,
): string | null {
  if (!existsSync(root)) return null
  if (maxDepth < 0) return null
  let entries: string[]
  try {
    entries = readdirSafe(root)
  } catch {
    return null
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    if (name === 'node_modules' || name === 'dist' || name === 'build') continue
    const full = resolve(root, name)
    if (exts.has(extname(name))) return full
    const sub = walkOnce(full, exts, maxDepth - 1)
    if (sub) return sub
  }
  return null
}

function readdirSafe(dir: string): string[] {
  // Lazy import — avoids pulling node:fs into the top of the module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  if (!statSync(dir).isDirectory()) return []
  return readdirSync(dir)
}

/**
 * Format an audit result as a markdown report suitable for direct inclusion
 * in a step 1 inventory or as a /audit-boundaries skill response.
 */
export function formatAuditMarkdown(result: AuditResult): string {
  const lines: string[] = []
  lines.push('# Dependency-Boundary Audit')
  lines.push('')
  lines.push(`LSP reachable: ${result.diagnostics.lspReachable ? 'yes' : 'no'}`)
  lines.push(`Languages probed: ${result.diagnostics.languagesProbed.join(', ') || '(none)'}`)
  lines.push(`Patterns applied: ${result.diagnostics.patternsApplied.join(', ') || '(none)'}`)
  if (result.diagnostics.notes.length > 0) {
    lines.push('')
    lines.push('## Notes')
    for (const n of result.diagnostics.notes) lines.push(`- ${n}`)
  }
  lines.push('')
  lines.push(`## Findings (${result.findings.length})`)
  if (result.findings.length === 0) {
    lines.push('')
    lines.push('No producer/consumer pairs found locally for the active patterns.')
  } else {
    lines.push('')
    lines.push('| pattern | scope | producer | consumer | fix |')
    lines.push('|---|---|---|---|---|')
    for (const f of result.findings) {
      lines.push(
        `| ${f.pattern} | ${f.inScopeHeuristic} | \`${f.producer.symbol}\` @ ${f.producer.file}:${f.producer.line} | \`${f.consumer.symbol}\` @ ${f.consumer.file}:${f.consumer.line} | ${f.fixHint} |`,
      )
    }
    lines.push('')
    lines.push(
      'Heuristic scope: `likely` = same file/dir; `unlikely` = cross-package; `unknown` = needs structural analysis (e.g. JSX-tree containment via tree-sitter or serena).',
    )
  }
  if (result.docsFollowups.length > 0) {
    lines.push('')
    lines.push(`## DeepWiki follow-ups (${result.docsFollowups.length}) — REQUIRED`)
    lines.push('')
    lines.push(
      'The local code analysis (LSP + bundled scanner) returned empty for these patterns. Before declaring step 1 inventory complete, run each query against DeepWiki and incorporate the cited answer into your inventory. The model has MCP access; the stop hook does not — that is why this is your job, not the harness\'s.',
    )
    lines.push('')
    for (const fu of result.docsFollowups) {
      lines.push(`### \`${fu.pattern}\` → \`${fu.repo}\``)
      lines.push(`Reason: ${fu.reason}`)
      lines.push('')
      lines.push('Run:')
      lines.push('```')
      lines.push(`mcp__deepwiki__ask_question owner="${fu.repo.split('/')[0]}" repo="${fu.repo.split('/')[1]}" question="${fu.question.replace(/"/g, '\\"')}"`)
      lines.push('```')
      lines.push('')
    }
  }
  return lines.join('\n')
}
