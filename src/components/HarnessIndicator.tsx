import { c as _c } from "react-compiler-runtime";
import * as fs from 'fs';
import { memo, useState, useEffect } from 'react';
import { Text } from '../ink.js';

/** Parses the harness frontmatter state file and returns { active, step, task } or null. */
function parseHarnessState(filePath: string): { active: boolean; step: number; task: string } | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    let active = false;
    let step = 0;
    let task = '';
    let inFrontmatter = false;
    let afterDashes = false;
    let inTask = false;

    for (const line of lines) {
      if (line === '---') {
        if (!inFrontmatter) { inFrontmatter = true; afterDashes = false; }
        else { afterDashes = true; }
        continue;
      }
      if (!inFrontmatter) continue;
      if (afterDashes) {
        // Task is the first non-empty line after the closing ---
        if (line.trim()) {
          task = line.trim();
          // Truncate if too long
          if (task.length > 40) task = task.slice(0, 37) + '...';
        }
        break;
      }
      if (line.startsWith('active: true')) active = true;
      if (line.startsWith('step:')) {
        const m = line.match(/step:\s*(\d+)/);
        if (m) step = parseInt(m[1]!, 10);
      }
    }
    return { active, step, task };
  } catch {
    return null;
  }
}

let cached: { active: boolean; step: number; task: string } | null = null;
let lastModified = 0;

function getHarnessState(): { active: boolean; step: number; task: string } | null {
  // Check all possible state directories
  const dirs = ['.aiko'];
  for (const dir of dirs) {
    const files = [`${dir}/aiko-code.default.local.md`, `${dir}/aiko-code.local.md`];
    for (const f of files) {
      try {
        const stat = fs.statSync(f);
        if (stat.mtimeMs !== lastModified || cached === null) {
          lastModified = stat.mtimeMs;
          cached = parseHarnessState(f);
        }
        if (cached?.active) return cached;
      } catch { /* not found */ }
    }
  }
  return cached?.active ? cached : null;
}

const PHASE_NAMES = [
  'Survey',      // 0
  'Boundaries',  // 1
  'Skeleton',    // 2
  'Signals',     // 3
  'Edges',       // 4
  'Integration', // 5
  'Verdict',     // 6
  'Audit',       // 7
  'Ship',        // 8
];

function getPhaseName(step: number): string {
  const i = Math.max(0, Math.min(step - 1, PHASE_NAMES.length - 1));
  return PHASE_NAMES[i] || '?';
}

export const HarnessIndicator = memo(function HarnessIndicator() {
  const state = getHarnessState();
  if (!state) return null;
  const phase = getPhaseName(state.step);
  // Don't show Survey 0/9 — harness is idle, not in progress
  if (state.step === 0) return null;
  return (
    <Text color="aiko" dimColor={true}>
      {'⟐ '}
      <Text bold={true}>{phase}</Text>
      {' '}{state.step}/9
      {state.task ? ` — ${state.task}` : ''}
    </Text>
  );
});
