import type { Collections, MinimalNode } from '@nuxt/content'
import type { Category } from '#shared/types/wiki'

/** One wiki note, exactly as `queryCollection('wiki')` returns it. */
export type WikiPage = Collections['wiki']

const KNOWN_CATEGORIES = new Set<string>([
  'MOCs',
  'People',
  'Organizations',
  'Operations',
  'Events',
  'Locations',
  'Concepts',
  'Videos',
])

/**
 * Top-level vault folder for a stem, e.g. `wiki/People/AJ Hartley` → `People`.
 * @nuxt/content prefixes stems with the collection folder (`wiki/`), so scan the
 * segments for the first known category rather than assuming a fixed position.
 */
export function categoryFromStem(stem: string): Category {
  for (const part of stem.split('/')) {
    if (KNOWN_CATEGORIES.has(part)) return part as Category
  }
  return 'Root'
}

/** The video title of a `…/Videos/<Title>/{summary,transcript}` note, else null. */
export function videoTitleFromStem(stem: string): string | null {
  const parts = stem.split('/')
  const i = parts.indexOf('Videos')
  return i >= 0 && parts[i + 1] ? parts[i + 1]! : null
}

/* --------------------------------------------------- body AST helpers ----- */
// @nuxt/content bodies are minimark trees: `{ type, value: MinimalNode[] }`,
// where a node is a text string or `[tag, props, ...children]`.

type MinimarkElement = [string, Record<string, unknown>, ...MinimalNode[]]

function isElement(node: MinimalNode | undefined): node is MinimarkElement {
  return Array.isArray(node) && typeof node[0] === 'string'
}

function bodyNodes(body: unknown): MinimalNode[] {
  return body && typeof body === 'object' && 'value' in body
    && Array.isArray((body as { value: unknown }).value)
    ? (body as { value: MinimalNode[] }).value
    : []
}

function collectText(node: MinimalNode, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node)
    return
  }
  if (isElement(node)) {
    for (let i = 2; i < node.length; i++) collectText(node[i] as MinimalNode, out)
  }
}

function flatten(node: MinimalNode): string {
  const parts: string[] = []
  collectText(node, parts)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const slice = text.slice(0, max)
  const cut = slice.lastIndexOf(' ')
  return `${(cut > 0 ? slice.slice(0, cut) : slice).trimEnd()}…`
}

/**
 * First body paragraph as flat text (wikilinks reduced to their labels),
 * trimmed to ~280 chars on a word boundary. Never throws on an empty body.
 */
export function firstParagraph(body: unknown): string {
  for (const node of bodyNodes(body)) {
    if (isElement(node) && node[0] === 'p') {
      const text = flatten(node)
      if (text) return truncate(text, 280)
    }
  }
  return ''
}

/**
 * Split a note into its lead paragraph and the body to render. @nuxt/content
 * derives `description` from the first paragraph but leaves that paragraph (and
 * any leading `# H1`) in the body, so we drop them here to avoid the on-page
 * title/lead being shown twice. Videos/index notes that open on a heading get
 * no lead and keep their body intact.
 */
export function splitLead(
  body: unknown,
  description?: string,
): { lead: string, value: MinimalNode[] } {
  const value = [...bodyNodes(body)]

  if (isElement(value[0]) && value[0][0] === 'h1') value.shift()

  const desc = description?.trim()
  if (desc) {
    if (isElement(value[0]) && value[0][0] === 'p') value.shift()
    return { lead: desc, value }
  }

  if (isElement(value[0]) && value[0][0] === 'p') {
    const lead = firstParagraph({ value: [value[0]] })
    value.shift()
    return { lead, value }
  }

  return { lead: '', value }
}
