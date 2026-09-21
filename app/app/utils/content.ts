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

/** One entry in `page.body.toc.links` (from `@nuxt/content`'s TOC generator). */
export interface TocLink { id: string, text: string, depth: number, children?: TocLink[] }

/**
 * Flattens a note's TOC to h2/h3 entries only — deeper levels make a rail
 * noisier than the page it's navigating. Shared by `WikiTocRail` (which
 * renders the list) and the wiki page (which uses its length to decide
 * whether the rail's layout column should exist at all — see
 * `app/pages/wiki/[...slug].vue`).
 */
export function tocLinks(toc?: { links?: TocLink[] } | null): TocLink[] {
  const out: TocLink[] = []
  for (const link of toc?.links ?? []) {
    out.push(link)
    for (const child of link.children ?? []) {
      if (child.depth <= 3) out.push(child)
    }
  }
  return out
}

/**
 * Below this many headings, `WikiTocRail` renders nothing — a rail navigating
 * one or two sections is noise, not a table of contents. Kept private: the
 * page and the component both need to agree on whether a rail exists, so
 * neither gets to know the number — they call `hasTocRail()` instead.
 */
const MIN_TOC_LINKS = 3

/**
 * Whether a note has enough headings for `WikiTocRail` to render anything.
 * The wiki page uses this to decide whether to reserve the rail's layout
 * column at all — see `app/pages/wiki/[...slug].vue`. Reserving the column
 * for a rail that turns out empty leaves an off-centre gutter on every short
 * note, so this must be the single source of truth the component's own
 * `v-if` agrees with, not a second copy of the threshold.
 */
export function hasTocRail(toc?: { links?: TocLink[] } | null): boolean {
  return tocLinks(toc).length >= MIN_TOC_LINKS
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

/**
 * Split a body at its first `<h2>`: the nodes before it, and that heading
 * onwards. The Home note carries its intro and its Maps of Content list in one
 * body, and the home page slots the featured entry between the two.
 */
export function splitAtFirstH2(body: unknown): { intro: MinimalNode[], rest: MinimalNode[] } {
  const nodes = bodyNodes(body)
  const at = nodes.findIndex(node => isElement(node) && node[0] === 'h2')
  return at < 0 ? { intro: nodes, rest: [] } : { intro: nodes.slice(0, at), rest: nodes.slice(at) }
}
