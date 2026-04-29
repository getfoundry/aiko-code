#!/usr/bin/env node
/**
 * Install pre-built tree-sitter grammar WASMs into dist/grammars/.
 *
 * Source: the `tree-sitter-wasms` npm package, which bundles ~50 grammars
 * compiled to WASM. We pull only the grammars aiko-code's harness uses for
 * cross-language AST queries:
 *   - typescript / tsx
 *   - python
 *   - go
 *   - rust
 *   - java
 *   - ruby
 *
 * Best-effort: failure (offline, missing dep) logs and exits 0. The runtime
 * tree-sitter wrapper falls back to TypeScript compiler API or LSP when a
 * grammar isn't bundled.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const DIST_GRAMMARS = join(REPO_ROOT, 'dist', 'grammars')
const NODE_MODULES = join(REPO_ROOT, 'node_modules')

// Source paths in tree-sitter-wasms package and our canonical dist names.
const GRAMMARS = [
  ['tree-sitter-typescript.wasm', 'typescript.wasm'],
  ['tree-sitter-tsx.wasm', 'tsx.wasm'],
  ['tree-sitter-javascript.wasm', 'javascript.wasm'],
  ['tree-sitter-python.wasm', 'python.wasm'],
  ['tree-sitter-go.wasm', 'go.wasm'],
  ['tree-sitter-rust.wasm', 'rust.wasm'],
  ['tree-sitter-java.wasm', 'java.wasm'],
  ['tree-sitter-ruby.wasm', 'ruby.wasm'],
]

function findGrammarSource(name) {
  // tree-sitter-wasms publishes the WASMs at out/<name>.wasm or similar.
  // Probe known locations.
  const candidates = [
    join(NODE_MODULES, 'tree-sitter-wasms', 'out', name),
    join(NODE_MODULES, 'tree-sitter-wasms', 'wasms', name),
    join(NODE_MODULES, 'tree-sitter-wasms', 'dist', name),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function listAvailable() {
  const baseDirs = [
    join(NODE_MODULES, 'tree-sitter-wasms', 'out'),
    join(NODE_MODULES, 'tree-sitter-wasms', 'wasms'),
    join(NODE_MODULES, 'tree-sitter-wasms', 'dist'),
  ]
  for (const d of baseDirs) {
    if (existsSync(d)) {
      try {
        return { dir: d, files: readdirSync(d).filter(n => n.endsWith('.wasm')) }
      } catch {}
    }
  }
  return null
}

function copyTreeSitterRuntime() {
  // web-tree-sitter ships its own runtime WASM (the parser core, not a
  // grammar). Required by the runtime loader. Probe and copy.
  const candidates = [
    join(NODE_MODULES, 'web-tree-sitter', 'tree-sitter.wasm'),
    join(NODE_MODULES, 'web-tree-sitter', 'lib', 'tree-sitter.wasm'),
    join(NODE_MODULES, 'web-tree-sitter', 'dist', 'tree-sitter.wasm'),
  ]
  for (const src of candidates) {
    if (!existsSync(src)) continue
    const dest = join(DIST_GRAMMARS, 'tree-sitter.wasm')
    copyFileSync(src, dest)
    return dest
  }
  return null
}

function main() {
  const tswExists = existsSync(join(NODE_MODULES, 'tree-sitter-wasms'))
  if (!tswExists) {
    console.warn(
      '[install-tree-sitter-grammars] tree-sitter-wasms not installed — skipping. Add it as a devDependency to bundle grammar WASMs.',
    )
  }

  if (!existsSync(DIST_GRAMMARS)) mkdirSync(DIST_GRAMMARS, { recursive: true })

  const runtime = copyTreeSitterRuntime()
  if (runtime) {
    console.log('[install-tree-sitter-grammars] runtime → dist/grammars/tree-sitter.wasm')
  } else {
    console.warn(
      '[install-tree-sitter-grammars] web-tree-sitter runtime WASM not found in node_modules. Run `bun install` then rebuild.',
    )
  }

  if (!tswExists) {
    console.warn('[install-tree-sitter-grammars] available languages will be limited to those bundled with web-tree-sitter directly.')
    return
  }

  const available = listAvailable()
  if (!available) {
    console.warn('[install-tree-sitter-grammars] tree-sitter-wasms package layout unrecognized — skipping')
    return
  }

  let installed = 0
  for (const [src, dest] of GRAMMARS) {
    const srcPath = findGrammarSource(src)
    if (!srcPath) {
      console.warn(`[install-tree-sitter-grammars] missing ${src} — skipping`)
      continue
    }
    const destPath = join(DIST_GRAMMARS, dest)
    copyFileSync(srcPath, destPath)
    installed += 1
  }
  console.log(
    `[install-tree-sitter-grammars] installed ${installed}/${GRAMMARS.length} grammars → dist/grammars/`,
  )
}

main()
