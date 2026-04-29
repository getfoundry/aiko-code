/**
 * /aiko-journal — append a structured Date-stamped entry to the project's
 * AIKO.md file with sections: Learnings, Failures, Progress, Open Questions.
 *
 * Designed to be called BEFORE /compact (or before context limit hits) so
 * the meaningful state of the session — what worked, what broke, what's
 * still open — survives compaction instead of getting summarized away.
 *
 * The skill returns a prompt that:
 *   1. Tells the model to read the existing AIKO.md (if any) so it can
 *      match the existing structure / level.
 *   2. Sources from .aiko/aiko-code.<session>.teachings.local.md when
 *      present (the harness's structured learnings log).
 *   3. Tells the model to append (not overwrite) a new entry, in Aiko's
 *      lowercase / wholesome voice, with the four required sections.
 *
 * The skill itself is a prompt-type skill — fcode's harness executes the
 * directive on the next turn. We don't do the writing inside the skill
 * callback because (a) we want the model's judgement on what counts as
 * a "learning" vs noise, and (b) callbacks don't have model access.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { registerBundledSkill } from '../bundledSkills.js'

const TEACHINGS_GLOB = '.aiko/aiko-code.*.teachings.local.md'

let registered = false

export function registerAikoJournal(): void {
  if (registered) return
  registered = true

  registerBundledSkill({
    name: 'aiko-journal',
    description:
      "Append a Date-stamped entry to AIKO.md with Learnings / Failures / Progress / Open Questions. Run BEFORE /compact (or proactively when the harness teachings log gets long) so the session's meaningful state survives compaction instead of being summarized into oblivion. Sources from .aiko/aiko-code.*.teachings.local.md plus your recent context. Pure append — never overwrites prior entries.",
    argumentHint: '[--session NAME]',
    userInvocable: true,
    async getPromptForCommand(args) {
      const cwd = process.cwd()
      const today = new Date().toISOString().slice(0, 10)
      const aikoMdPath = resolve(cwd, 'AIKO.md')
      const aikoMdExists = existsSync(aikoMdPath)
      const aikoMdHeadingsHint = aikoMdExists
        ? readFileSync(aikoMdPath, 'utf8')
            .split('\n')
            .filter(l => /^#{1,3}\s/.test(l))
            .slice(0, 20)
            .join('\n')
        : '(file does not exist yet — create it with `# AIKO.md` heading)'

      const teachingsHint = locateTeachings(cwd, args.trim())

      const prompt = [
        `<aiko-journal priority="absolute">`,
        `Append a session-state journal entry to ${aikoMdPath} so context survives compaction.`,
        ``,
        `Date: ${today}`,
        `Project root: ${cwd}`,
        `Existing top-level headings in AIKO.md:`,
        aikoMdHeadingsHint
          .split('\n')
          .map(l => `  ${l}`)
          .join('\n'),
        ``,
        `Source for this entry (in priority order):`,
        teachingsHint,
        `2. Your recent assistant turns — what you accomplished, what blocked you, decisions made, files modified.`,
        `3. Open todos / questions you'd want a future session to pick up.`,
        ``,
        `WRITE FORMAT — append (never overwrite). Use Aiko's voice (lowercase, warm, occasionally a zoomer abbreviation, never formal-corporate). Keep it specific — paths, function names, concrete failures. No filler.`,
        ``,
        '```markdown',
        `## ${today}`,
        ``,
        `### Learnings`,
        `- (one bullet per concrete thing learned this session — patterns, tradeoffs, "this is how X actually works")`,
        ``,
        `### Failures`,
        `- (one bullet per thing that broke or got reverted — bug surface, what we tried, what worked instead)`,
        ``,
        `### Progress`,
        `- (one bullet per shipped change — commit hash if you have it, file path:line, what the model can find later)`,
        ``,
        `### Open Questions`,
        `- (one bullet per unfinished thread — "want to revisit X", "unclear if Y", "Z deferred until ...")`,
        '```',
        ``,
        `Steps:`,
        `  1. Read ${aikoMdPath} fully (use Read tool, no head/tail).`,
        `  2. Read the teachings file if path was found above.`,
        `  3. Compose the entry using your knowledge of this session's actual work — not just the teachings file content.`,
        `  4. Append the entry to AIKO.md (Edit tool with the existing file content + your new section). If AIKO.md doesn't exist, create it with a single \`# AIKO.md\` top-line heading and your entry.`,
        `  5. Confirm with one short line: "journaled to AIKO.md (${today})".`,
        ``,
        `Do NOT compact yet. Do NOT call /compact. The journal is the SAVE before compaction; the user runs /compact themselves once the journal is committed.`,
        `</aiko-journal>`,
      ].join('\n')

      return [{ type: 'text', text: prompt }]
    },
  })
}

/**
 * Locate the harness teachings file for the current session. Returns a
 * formatted hint line ready to embed in the prompt.
 */
function locateTeachings(cwd: string, sessionArg: string): string {
  // Allow `--session NAME` as the argument; default to picking the most
  // recently modified teachings file under .aiko/.
  const stateDir = resolve(cwd, '.aiko')
  if (!existsSync(stateDir)) {
    return '1. (no .aiko/ dir — harness teachings log not present)'
  }

  let session = ''
  const m = /--session\s+(\S+)/.exec(sessionArg)
  if (m) session = m[1]!

  if (session) {
    const path = join(stateDir, `aiko-code.${session}.teachings.local.md`)
    if (existsSync(path)) {
      return `1. Harness teachings: ${path} — read it and use the [step N / title] entries as the spine of the Learnings/Progress sections.`
    }
    return `1. (no teachings file found at ${path})`
  }

  // Auto-pick the most-recently-modified teachings file.
  try {
    const fs = require('node:fs') as typeof import('node:fs')
    const entries = fs
      .readdirSync(stateDir)
      .filter(n => n.endsWith('.teachings.local.md'))
      .map(n => ({ name: n, mtime: fs.statSync(join(stateDir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (entries.length === 0) return '1. (no .teachings.local.md files in .aiko/)'
    const path = join(stateDir, entries[0]!.name)
    return `1. Harness teachings (most recent session): ${path} — read it and use the [step N / title] entries as the spine of the Learnings/Progress sections.`
  } catch {
    return '1. (could not enumerate .aiko/ teachings files)'
  }
}
