/**
 * TypeScript-AST-based boundary scanner.
 *
 * Tier-2 backend for the dependency-boundary audit. Uses the bundled
 * TypeScript compiler API (already a project dep) to extract producer/
 * consumer candidates from .ts/.tsx/.js/.jsx with proper AST precision.
 *
 * Beats the regex scanner on:
 *   - JSX element name resolution (handles aliased imports)
 *   - Comment / string literal exclusion (no false positives)
 *   - Import alias resolution (`import { Foo as Bar }` → both names tracked)
 *   - Decorator and tagged-template syntax
 *
 * Loaded lazily via dynamic import — keeps the audit fast when no TS files
 * exist in the workspace and avoids forcing the bundler to inline TS.
 *
 * For non-TS languages (Python, Java, Go, Rust, …) the audit falls through
 * to the regex scanner. Full multi-language AST precision belongs to serena
 * MCP (tier-1) when configured.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

import type { BoundaryPattern } from './boundaryAudit.js'

export type AstSymbolHit = {
  symbol: string
  file: string
  line: number
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

/**
 * Scan TS/JS/JSX files in `cwd` for symbols matching the pattern's
 * producer/consumer regex. Returns null when:
 *   - the pattern doesn't apply to any TS-family extension, OR
 *   - the typescript package fails to load (extremely unlikely; it's a dep).
 *
 * Falls back to the regex scanner via the boundaryAudit dispatcher when null.
 */
export async function scanWithTsAst(
  cwd: string,
  pattern: BoundaryPattern,
  cap: number,
): Promise<{ producers: AstSymbolHit[]; consumers: AstSymbolHit[] } | null> {
  const tsExts = pattern.extensions.filter(e =>
    TS_EXTENSIONS.has(`.${e.replace(/^\./, '')}`),
  )
  if (tsExts.length === 0) return null

  let ts: typeof import('typescript')
  try {
    ts = (await import('typescript')) as unknown as typeof import('typescript')
  } catch {
    return null
  }

  const files = walkAllFiles(cwd, tsExts, 8, cap * 20)
  if (files.length === 0) {
    return { producers: [], consumers: [] }
  }

  const producers: AstSymbolHit[] = []
  const consumers: AstSymbolHit[] = []
  const seen = new Set<string>()

  for (const file of files) {
    if (producers.length + consumers.length >= cap * 4) break
    let content: string
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (content.length > 1_000_000) continue

    const sf = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      file.endsWith('.tsx') || file.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    )

    const aliasMap = new Map<string, string>()

    const recordHit = (
      bucket: AstSymbolHit[],
      kind: 'p' | 'c',
      symbol: string,
      pos: number,
    ): void => {
      const lc = sf.getLineAndCharacterOfPosition(pos)
      const line = lc.line + 1
      const key = `${kind}:${symbol}@${file}:${line}`
      if (seen.has(key)) return
      seen.add(key)
      bucket.push({ symbol, file, line })
    }

    const resolveName = (raw: string): string => aliasMap.get(raw) ?? raw

    const visit = (node: import('typescript').Node): void => {
      if (producers.length + consumers.length >= cap * 4) return

      // Imports: track alias → original name so JSX/call sites that use the
      // alias get matched against the canonical regex.
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
        const bindings = node.importClause.namedBindings
        if (ts.isNamedImports(bindings)) {
          for (const spec of bindings.elements) {
            const local = spec.name.text
            const original = spec.propertyName?.text ?? local
            aliasMap.set(local, original)
          }
        }
      }

      // Producer: declarations.
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text
        if (pattern.producer.test(name)) {
          recordHit(producers, 'p', name, node.name.getStart(sf))
        }
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text
        if (pattern.producer.test(name)) {
          recordHit(producers, 'p', name, node.name.getStart(sf))
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text
        if (pattern.producer.test(name)) {
          recordHit(producers, 'p', name, node.name.getStart(sf))
        }
      }
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text
        if (pattern.producer.test(name)) {
          recordHit(producers, 'p', name, node.name.getStart(sf))
        }
      }
      if (ts.isEnumDeclaration(node)) {
        const name = node.name.text
        if (pattern.producer.test(name)) {
          recordHit(producers, 'p', name, node.name.getStart(sf))
        }
      }

      // Producer: JSX element usage <FooProvider> — capitalized, alias-resolved.
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName)
      ) {
        const raw = node.tagName.text
        const canonical = resolveName(raw)
        if (pattern.producer.test(canonical) || pattern.producer.test(raw)) {
          recordHit(producers, 'p', canonical, node.tagName.getStart(sf))
        }
      }

      // Consumer: call expressions.
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const raw = node.expression.text
        const canonical = resolveName(raw)
        if (pattern.consumer.test(canonical) || pattern.consumer.test(raw)) {
          recordHit(consumers, 'c', canonical, node.expression.getStart(sf))
        }
      }

      // Consumer: decorator usage @Autowired (kept for Java-ish patterns
      // even though main Java path uses regex).
      if (ts.isDecorator(node) && ts.isIdentifier(node.expression)) {
        const raw = node.expression.text
        const canonical = resolveName(raw)
        if (pattern.consumer.test(canonical)) {
          recordHit(consumers, 'c', canonical, node.expression.getStart(sf))
        }
      }
      if (
        ts.isDecorator(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression)
      ) {
        const raw = node.expression.expression.text
        const canonical = resolveName(raw)
        if (pattern.consumer.test(canonical)) {
          recordHit(consumers, 'c', canonical, node.expression.expression.getStart(sf))
        }
      }

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(sf, visit)
  }

  return { producers, consumers }
}

/**
 * Mirrors the walker in boundaryAudit.ts — kept local so this module has no
 * cross-imports to the dispatcher (avoids cycles).
 */
function walkAllFiles(
  cwd: string,
  extensions: readonly string[],
  maxDepth: number,
  cap: number,
): string[] {
  const exts = new Set(extensions.map(e => `.${e.replace(/^\./, '')}`))
  const out: string[] = []
  const stack: Array<{ dir: string; depth: number }> = [{ dir: cwd, depth: 0 }]
  while (stack.length > 0 && out.length < cap) {
    const { dir, depth } = stack.pop()!
    if (depth > maxDepth) continue
    if (!existsSync(dir)) continue
    let names: string[]
    try {
      if (!statSync(dir).isDirectory()) continue
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      if (
        name === 'node_modules' ||
        name === 'dist' ||
        name === 'build' ||
        name === 'target' ||
        name === '__pycache__' ||
        name === 'vendor'
      ) {
        continue
      }
      const full = resolve(dir, name)
      if (exts.has(extname(name))) {
        out.push(full)
        if (out.length >= cap) break
      } else {
        stack.push({ dir: full, depth: depth + 1 })
      }
    }
  }
  return out
}
