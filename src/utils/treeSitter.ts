/**
 * Tree-sitter wrapper — universal AST parsing across languages.
 *
 * Loads grammar WASMs from `dist/grammars/` (bundled via
 * scripts/install-tree-sitter-grammars.mjs at build time) and exposes a
 * minimal `parse + query` API that the boundary audit + future tools
 * shell into.
 *
 * Deliberately small surface:
 *   - `loadGrammar(lang)` — singleton-cached parser for a given language
 *   - `parse(parser, source)` — returns a Tree
 *   - `runQuery(tree, lang, querySource)` — runs an S-expression query and
 *     returns matches as plain JSON (file/line/column/captures)
 *
 * Languages bundled today: typescript, tsx, javascript, python, go, rust,
 * java, ruby. Adding more: extend `GRAMMARS` in
 * scripts/install-tree-sitter-grammars.mjs and rebuild.
 *
 * Why not LSP for everything: serena handles cross-file semantic queries
 * but requires uvx + a running language server. Tree-sitter parses a single
 * file in <1ms with zero subprocess overhead. The two compose:
 * tree-sitter for fast structural queries, serena for cross-file references.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type SupportedLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'ruby'

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'typescript',
  'tsx',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'ruby',
]

const EXTENSION_TO_LANG: Record<string, SupportedLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyi: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  rb: 'ruby',
}

export function langForExtension(ext: string): SupportedLanguage | null {
  const e = ext.replace(/^\./, '').toLowerCase()
  return EXTENSION_TO_LANG[e] ?? null
}

let parserModule: typeof import('web-tree-sitter') | null = null
const grammarCache = new Map<SupportedLanguage, unknown>()

/**
 * Resolve the directory containing the bundled grammar WASMs. Probes both
 * the production install layout (sibling of dist/cli.mjs) and the dev
 * layout (repo root). Returns null when grammars haven't been installed —
 * callers should handle this by falling back to LSP / TS compiler API.
 */
export function grammarsDir(): string | null {
  const probes: string[] = []
  try {
    const here = fileURLToPath(import.meta.url)
    const repoRoot = join(dirname(here), '..', '..')
    probes.push(join(repoRoot, 'dist', 'grammars'))
  } catch {
    /* ignore */
  }
  const argv1 = process.argv[1]
  if (argv1) {
    probes.push(join(dirname(argv1), 'grammars'))
    probes.push(join(dirname(argv1), '..', 'grammars'))
  }
  for (const dir of probes) {
    if (existsSync(join(dir, 'tree-sitter.wasm'))) return dir
  }
  return null
}

async function ensureRuntime(): Promise<typeof import('web-tree-sitter') | null> {
  if (parserModule) return parserModule
  try {
    const mod = (await import('web-tree-sitter')) as unknown as {
      Parser: { init: (opts?: unknown) => Promise<void> }
      Language: { load: (path: string | Uint8Array) => Promise<unknown> }
    }
    const dir = grammarsDir()
    if (!dir) return null
    // Tell web-tree-sitter where to find tree-sitter.wasm.
    await mod.Parser.init({
      locateFile: (file: string) => join(dir, file),
    })
    parserModule = mod as unknown as typeof import('web-tree-sitter')
    return parserModule
  } catch {
    return null
  }
}

/**
 * Load and cache a grammar for the given language. Returns null when the
 * grammar isn't bundled or the runtime failed to initialize. Callers
 * should treat null as "tree-sitter unavailable for this file" and route
 * to the next fallback (TS compiler API for TS/JS, serena for everything
 * else).
 */
export async function loadGrammar(
  lang: SupportedLanguage,
): Promise<unknown | null> {
  const cached = grammarCache.get(lang)
  if (cached) return cached

  const mod = await ensureRuntime()
  if (!mod) return null

  const dir = grammarsDir()
  if (!dir) return null
  const wasmPath = join(dir, `${lang}.wasm`)
  if (!existsSync(wasmPath)) return null

  try {
    const buf = readFileSync(wasmPath)
    // Cast around the runtime's Language.load signature differences across
    // versions; some accept Uint8Array, some only accept paths.
    const Language = (mod as unknown as { Language: { load: (x: unknown) => Promise<unknown> } }).Language
    const grammar = await Language.load(buf as unknown as Uint8Array)
    grammarCache.set(lang, grammar)
    return grammar
  } catch {
    return null
  }
}

/**
 * Parse a file and return a tree. Returns null on any error (binary file,
 * grammar not loaded, runtime not initialized).
 */
export async function parseFile(
  filePath: string,
): Promise<{
  lang: SupportedLanguage
  tree: unknown
  source: string
} | null> {
  const ext = filePath.split('.').pop() ?? ''
  const lang = langForExtension(ext)
  if (!lang) return null

  const mod = await ensureRuntime()
  if (!mod) return null
  const grammar = await loadGrammar(lang)
  if (!grammar) return null

  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  try {
    const Parser = (mod as unknown as { Parser: new () => { setLanguage: (g: unknown) => void; parse: (s: string) => unknown } }).Parser
    const parser = new Parser()
    parser.setLanguage(grammar)
    const tree = parser.parse(source)
    return { lang, tree, source }
  } catch {
    return null
  }
}

/**
 * Run an S-expression query against a parsed tree. Returns flattened match
 * results: one entry per capture with file/line/column metadata.
 *
 * Example queries:
 *   `(call_expression function: (identifier) @hook (#match? @hook "^use[A-Z]"))`
 *   `(class_declaration name: (type_identifier) @cls (#match? @cls "Provider$"))`
 *
 * The query language is tree-sitter's standard. See
 * https://tree-sitter.github.io/tree-sitter/using-parsers#query-syntax.
 */
export async function runQuery(
  parsed: { lang: SupportedLanguage; tree: unknown; source: string },
  querySource: string,
): Promise<
  Array<{
    captureName: string
    text: string
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
  }>
> {
  const grammar = await loadGrammar(parsed.lang)
  if (!grammar) return []
  try {
    const Query = (grammar as unknown as { query: (q: string) => { matches: (n: unknown) => Array<{ captures: Array<{ name: string; node: { startPosition: { row: number; column: number }; endPosition: { row: number; column: number }; text: string } }> }> } }).query
    const query = Query.call(grammar, querySource)
    const tree = parsed.tree as { rootNode: unknown }
    const matches = query.matches(tree.rootNode)
    const out: Array<{
      captureName: string
      text: string
      startLine: number
      startColumn: number
      endLine: number
      endColumn: number
    }> = []
    for (const m of matches) {
      for (const c of m.captures) {
        out.push({
          captureName: c.name,
          text: c.node.text,
          startLine: c.node.startPosition.row + 1,
          startColumn: c.node.startPosition.column + 1,
          endLine: c.node.endPosition.row + 1,
          endColumn: c.node.endPosition.column + 1,
        })
      }
    }
    return out
  } catch {
    return []
  }
}

/**
 * Convenience: check whether any grammar is bundled. Useful for the
 * boundary audit's diagnostic note ("tree-sitter unavailable, falling
 * back to TS compiler API + serena").
 */
export function isAvailable(): boolean {
  return grammarsDir() !== null
}
