import { existsSync, readFileSync, appendFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { Message } from '../types/message.js'

const JOURNAL_FILE = 'AIKO.md'
const HARNESS_TEACHINGS_DIR = '.aiko'
const HARNESS_TEACHINGS_PATTERN = /^aiko-code\..*\.teachings\.local\.md$/

function isoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoTime(): string {
  return new Date().toISOString().slice(0, 19) + 'Z'
}

function extractTextContent(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const m = message as { content?: unknown }
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return m.content
      .map(block => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object' && 'text' in block) {
          const t = (block as { text?: unknown }).text
          return typeof t === 'string' ? t : ''
        }
        return ''
      })
      .join(' ')
  }
  return ''
}

function findLatestTeachingsFile(cwd: string): string | null {
  const dir = join(cwd, HARNESS_TEACHINGS_DIR)
  if (!existsSync(dir)) return null
  let best: { path: string; mtime: number } | null = null
  for (const name of readdirSync(dir)) {
    if (!HARNESS_TEACHINGS_PATTERN.test(name)) continue
    const p = join(dir, name)
    try {
      const m = statSync(p).mtimeMs
      if (!best || m > best.mtime) best = { path: p, mtime: m }
    } catch {
      /* skip */
    }
  }
  return best?.path ?? null
}

function tailLines(s: string, n: number): string[] {
  const lines = s.split('\n').filter(l => l.trim().length > 0)
  return lines.slice(-n)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/**
 * Deterministic AIKO.md append called by compactConversation right before the
 * actual context summarization fires. No LLM call — pure-data extract from the
 * messages slice + most-recent harness teachings file. Idempotent across
 * concurrent compactions: each entry is timestamped and appended.
 *
 * Trigger semantics:
 *   - 'auto'   → context-pressure compaction (the dangerous one — model didn't
 *                opt-in, may not have prepared anything to journal)
 *   - 'manual' → user typed /compact (model usually has already journaled)
 */
export function appendCompactionJournalEntry(opts: {
  cwd: string
  messages: readonly Message[]
  trigger: 'auto' | 'manual'
}): { written: boolean; path: string; reason?: string } {
  const path = resolve(opts.cwd, JOURNAL_FILE)
  try {
    // last user message (skip tool-results)
    let lastUserText = ''
    for (let i = opts.messages.length - 1; i >= 0; i--) {
      const m = opts.messages[i] as { type?: string; message?: unknown }
      if (m?.type === 'user') {
        const t = extractTextContent(m.message)
        if (t.trim().length > 0 && !t.startsWith('{')) {
          lastUserText = t
          break
        }
      }
    }

    // last assistant text
    let lastAssistantText = ''
    for (let i = opts.messages.length - 1; i >= 0; i--) {
      const m = opts.messages[i] as { type?: string; message?: unknown }
      if (m?.type === 'assistant') {
        const t = extractTextContent(m.message)
        if (t.trim().length > 0) {
          lastAssistantText = t
          break
        }
      }
    }

    const teachingsPath = findLatestTeachingsFile(opts.cwd)
    let teachingsTail: string[] = []
    if (teachingsPath) {
      try {
        const content = readFileSync(teachingsPath, 'utf8')
        teachingsTail = tailLines(content, 6)
      } catch {
        /* skip */
      }
    }

    const entry = [
      ``,
      `## Compaction journal — ${isoTime()}`,
      ``,
      `**Trigger**: ${opts.trigger} (${opts.trigger === 'auto' ? 'context pressure — model did not opt-in' : 'manual /compact'})`,
      `**Messages preserved before summarization**: ${opts.messages.length}`,
      ``,
      `**Last user prompt**:`,
      `> ${truncate(lastUserText.replace(/\n+/g, ' '), 600) || '(none captured)'}`,
      ``,
      `**Last assistant work**:`,
      `> ${truncate(lastAssistantText.replace(/\n+/g, ' '), 800) || '(none captured)'}`,
      ``,
      `**Harness teachings tail**${teachingsPath ? ` (${teachingsPath.replace(opts.cwd + '/', '')})` : ''}:`,
      ...(teachingsTail.length > 0
        ? teachingsTail.map(l => `> ${truncate(l, 600)}`)
        : ['> (no harness teachings file found)']),
      ``,
      `**Open questions / next-session pickups**:`,
      `> _filled by next session — read AIKO.md before resuming, then strike through resolved items._`,
      ``,
    ].join('\n')

    if (!existsSync(path)) {
      const header = `# AIKO.md\n\nShared journal between aiko-code sessions. Pre-compaction snapshots are appended here automatically; read on session start to recover state that compaction summarized away.\n`
      writeFileSync(path, header + entry, 'utf8')
    } else {
      appendFileSync(path, entry, 'utf8')
    }
    return { written: true, path }
  } catch (err) {
    return {
      written: false,
      path,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
