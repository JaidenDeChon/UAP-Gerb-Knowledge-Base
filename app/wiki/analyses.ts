import { readFileSync } from 'node:fs'
// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import { ANALYSIS_CONFIDENCES, ANALYSIS_KINDS, ANALYSIS_NOVELTIES } from '../shared/types/wiki'
import type { BakedAnalysis } from '../shared/types/wiki'
import { graphIndex } from './graph'
import { VAULT_DIR } from './vault'
import { publishDate } from './videos'

/** The frontmatter block of a note, or '' when it has none. */
function frontmatterBlock(raw: string): string {
  return /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? ''
}

// YAML's escapes: `\"` and `\\` inside double quotes, `''` inside single quotes.
const unescapeDouble = (s: string): string => s.replace(/\\(["\\])/g, '$1')
const unescapeSingle = (s: string): string => s.replace(/''/g, "'")

/** Strip YAML quotes from a value and undo their escapes. Unquoted values pass through. */
function unquote(value: string): string {
  const double = /^"(.*)"$/.exec(value)
  if (double) return unescapeDouble(double[1]!)
  const single = /^'(.*)'$/.exec(value)
  if (single) return unescapeSingle(single[1]!)
  return value
}

/** A top-level scalar from a frontmatter block, unquoted. */
export function scalar(block: string, key: string): string | undefined {
  const value = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim()
  return (value && unquote(value)) || undefined
}

/**
 * A top-level list from a frontmatter block, inline (`[a, "b, c"]`) or as
 * `- item` lines. Video folder titles can hold commas, so an inline list is
 * split on quoted strings first rather than on every comma.
 */
export function listValue(block: string, key: string): string[] {
  const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm').exec(block)?.[1]
  if (inline !== undefined) {
    const items: string[] = []
    for (const m of inline.matchAll(/\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^,]+))/g)) {
      const item = (m[1] !== undefined ? unescapeDouble(m[1]) : m[2] !== undefined ? unescapeSingle(m[2]) : m[3] ?? '').trim()
      if (item) items.push(item)
    }
    return items
  }
  const lines = new RegExp(`^${key}:\\s*\\r?\\n((?:[ \\t]*-.*(?:\\r?\\n|$))+)`, 'm').exec(block)?.[1]
  return (lines ?? '')
    .split(/\r?\n/)
    .map(line => unquote(line.replace(/^\s*-\s*/, '').trim()))
    .filter(Boolean)
}

/** `value` when it is one of `allowed`, else null. */
function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  const v = value?.trim().toLowerCase()
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : null
}

/** `impact:` as a whole number from 1 to 5, else null. */
function impactValue(value: string | undefined): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

/** Every note directly under `Analyses/`: its graph index and raw text. */
function* analysesNotes(): Generator<{ i: number, raw: string }> {
  const { stemByPath, nodeByPath } = graphIndex()
  for (const [path, stem] of stemByPath) {
    if (!/^Analyses\/[^/]+$/.test(stem)) continue
    const node = nodeByPath.get(path)
    if (!node) continue
    try {
      yield { i: node.i, raw: readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8') }
    }
    catch {
      continue
    }
  }
}

/**
 * Every analysis in the vault, newest `date` first.
 *
 * An analysis is any note directly under `Analyses/`, written by the analysis
 * agents with a fixed frontmatter schema (see docs/wiki-components.md). It is
 * read off the frontmatter alone, so a new post lists on the next build with
 * nobody touching the app. No `Analyses/` folder, or an empty one, bakes as [].
 */
export function buildAnalyses(): BakedAnalysis[] {
  const analyses: BakedAnalysis[] = []

  for (const { i, raw } of analysesNotes()) {
    const block = frontmatterBlock(raw)
    analyses.push({
      i,
      date: publishDate(scalar(block, 'date')),
      kind: oneOf(ANALYSIS_KINDS, scalar(block, 'kind')),
      confidence: oneOf(ANALYSIS_CONFIDENCES, scalar(block, 'confidence')),
      novelty: oneOf(ANALYSIS_NOVELTIES, scalar(block, 'novelty')),
      dek: scalar(block, 'dek') ?? '',
      impact: impactValue(scalar(block, 'impact')),
      videos: listValue(block, 'videos').length,
    })
  }

  // Newest first; undated last, in graph (alphabetical) order.
  return analyses.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.i - b.i)
}
