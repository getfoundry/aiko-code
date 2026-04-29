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

/**
 * Walk an AST collecting every identifier-shaped node, classifying it as
 * declaration, call, or JSX-element by parent context. Used by the boundary
 * audit to find producer/consumer candidates in any language tree-sitter
 * supports — replaces the TS-only tsAstScanner for cross-language coverage.
 */
export type IdentifierHit = {
  name: string
  role: 'declaration' | 'call' | 'jsx' | 'other'
  line: number
  column: number
}

export async function collectIdentifiers(
  filePath: string,
): Promise<IdentifierHit[] | null> {
  const parsed = await parseFile(filePath)
  if (!parsed) return null

  type Node = {
    type: string
    text: string
    startPosition: { row: number; column: number }
    children?: Node[]
    childForFieldName?: (name: string) => Node | null
    namedChildren?: Node[]
  }

  const out: IdentifierHit[] = []

  function visit(node: Node, parent: Node | null): void {
    const t = node.type
    const isIdentLike =
      t === 'identifier' ||
      t === 'type_identifier' ||
      t === 'property_identifier' ||
      t === 'shorthand_property_identifier'

    if (isIdentLike) {
      const role = classify(node, parent)
      out.push({
        name: node.text,
        role,
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
      })
    }

    const children = (node.namedChildren ?? node.children ?? []) as Node[]
    for (const c of children) visit(c, node)
  }

  function classify(_node: Node, parent: Node | null): IdentifierHit['role'] {
    if (!parent) return 'other'
    const pt = parent.type
    if (
      pt === 'class_declaration' ||
      pt === 'class_definition' ||
      pt === 'function_declaration' ||
      pt === 'function_definition' ||
      pt === 'method_definition' ||
      pt === 'function_item' ||
      pt === 'struct_item' ||
      pt === 'enum_item' ||
      pt === 'interface_declaration' ||
      pt === 'type_alias_declaration' ||
      pt === 'variable_declarator' ||
      pt === 'lexical_declaration' ||
      pt === 'type_declaration'
    ) {
      return 'declaration'
    }
    if (
      pt === 'call_expression' ||
      pt === 'call' ||
      pt === 'function_call'
    ) {
      return 'call'
    }
    if (
      pt === 'jsx_opening_element' ||
      pt === 'jsx_self_closing_element' ||
      pt === 'jsx_closing_element'
    ) {
      return 'jsx'
    }
    return 'other'
  }

  const tree = parsed.tree as { rootNode: Node }
  visit(tree.rootNode, null)
  return out
}
