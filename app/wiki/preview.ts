import { readFileSync } from 'node:fs'
// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import type { NotePreview } from '../shared/types/wiki'
import { graphIndex } from './graph'
import { VAULT_DIR } from './vault'

/**
 * The hover-card preview for every note, keyed by route path.
 *
 * Built once, at build time, and inlined into the server bundle — the deployed
 * Netlify function has no copy of the vault to read.
 */
export function buildPreviews(): Record<string, NotePreview> {
  const { stemByPath, nodeByPath } = graphIndex()
  const previews: Record<string, NotePreview> = {}

  for (const [path, stem] of stemByPath) {
    const node = nodeByPath.get(path)
    if (!node) continue

    let raw: string
    try {
      raw = readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8')
    }
    catch {
      continue
    }

    const { frontmatter, body } = splitFrontmatter(raw)
    previews[path] = {
      path: node.p,
      title: frontmatter.title || frontmatter.name || node.l,
      category: node.c,
      lead: extractLead(body),
      tags: frontmatter.tags,
    }
  }

  return previews
}

/* --------------------------------------------------------- frontmatter -- */

interface Frontmatter {
  title?: string
  name?: string
  tags: string[]
}

function splitFrontmatter(raw: string): { frontmatter: Frontmatter, body: string } {
  const frontmatter: Frontmatter = { tags: [] }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { frontmatter, body: raw }

  const body = raw.slice(match[0].length)
  let listKey: string | null = null
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) {
      if (listKey === 'tags') frontmatter.tags.push(unquote(item[1]!))
      continue
    }
    const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]!
    const value = kv[2]!.trim()
    if (value === '' || value === '|' || value === '>') {
      listKey = key
      continue
    }
    listKey = null
    if (key === 'title') frontmatter.title = unquote(value)
    else if (key === 'name') frontmatter.name = unquote(value)
    else if (key === 'tags') frontmatter.tags.push(...parseInlineList(value))
  }
  return { frontmatter, body }
}

function unquote(value: string): string {
  const t = value.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
    return t.slice(1, -1)
  }
  return t
}

function parseInlineList(value: string): string[] {
  const t = value.trim()
  if (!t.startsWith('[') || !t.endsWith(']')) return []
  return t.slice(1, -1).split(',').map(s => unquote(s)).filter(Boolean)
}

/* ---------------------------------------------------------------- lead -- */

function extractLead(body: string): string {
  const para: string[] = []
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') {
      if (para.length) break
      continue
    }
    if (isStructural(trimmed)) {
      if (para.length) break
      continue
    }
    para.push(trimmed)
  }
  return truncate(cleanInline(para.join(' ')), 240)
}

function isStructural(line: string): boolean {
  return /^#{1,6}\s/.test(line) // heading
    || /^[-*+]\s/.test(line) // unordered list item
    || /^\d+[.)]\s/.test(line) // ordered list item
    || line.startsWith('>') // blockquote
    || line.startsWith('|') // table row
    || line.startsWith('<!--') // HTML comment
    || line.startsWith('```') // code fence
    || /^-{3,}$/.test(line) // horizontal rule / stray fence
}

function cleanInline(text: string): string {
  return text
    .replace(/!\[\[/g, '[[') // normalize wikilink embeds
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
      (alias ?? target).trim())
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice
  return `${cut.replace(/[\s.,;:—-]+$/, '')}…`
}
