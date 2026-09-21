/**
 * A heading may carry an MDC component — the timeline's
 * `## Chronology :wiki-info[…]{label="How to read this timeline"}` — and
 * @nuxt/content builds each TOC entry by flattening the whole heading, the
 * component's body text included. That put a 572-character paragraph of
 * reading instructions in the 200px sidebar rail. The label a reader needs is
 * the heading's own words; the component is an aside that belongs on the page,
 * where it renders, and nowhere else.
 *
 * So re-derive every TOC label from the heading node, skipping component
 * children. Done at parse time (see `content:file:afterParse` in nuxt.config)
 * so the prose never reaches the database or the page payload.
 *
 * The anchor id gets the same treatment, because @nuxt/content slugs the
 * whole flattened heading too — `#chronology-entries-are-colour-tinted-by-…`
 * (300+ characters) for a heading whose words are "Chronology". The rail's
 * `href` and the rendered heading's `id` are two separate copies of the same
 * string, so both are rewritten together, from the cleaned label, using the
 * same slug rules @nuxtjs/mdc applies (github-slugger, then hyphen collapse).
 * A cleaned id that would collide with another heading on the page is left
 * as generated rather than risk two headings sharing one anchor.
 */

/** A minimark node: a text string, or `[tag, props, ...children]`. */
export type MinimarkNode = string | MinimarkElement
export type MinimarkElement = [string, Record<string, unknown>, ...MinimarkNode[]]

export interface TocLink { id: string, depth: number, text: string, children?: TocLink[] }
export interface TocBody { value?: MinimarkNode[], toc?: { links?: TocLink[] } | null }

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function isElement(node: MinimarkNode | undefined): node is MinimarkElement {
  return Array.isArray(node) && typeof node[0] === 'string'
}

/**
 * MDC names components with a dash (`wiki-info`, `wiki-cue`), and no HTML
 * inline element has one — so the hyphen is what separates "an aside embedded
 * in this heading" from the `<strong>`/`<em>`/`<code>` that are part of its
 * wording and must be kept.
 */
function isComponent(node: MinimarkElement): boolean {
  return node[0].includes('-')
}

/**
 * Mirror of the id @nuxtjs/mdc's compiler assigns a heading: github-slugger's
 * `slug()` (lowercase; strip everything but letters, numbers, marks, space,
 * hyphen and underscore; spaces to hyphens) followed by mdc's own cleanup
 * (collapse hyphen runs, trim edge hyphens, prefix a leading digit).
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/^(\d)/, '_$1')
}

function label(node: MinimarkElement): string {
  let out = ''
  for (let i = 2; i < node.length; i++) {
    const child = node[i] as MinimarkNode
    if (typeof child === 'string') out += child
    else if (isElement(child) && !isComponent(child)) out += label(child)
  }
  return out.replace(/\s+/g, ' ').trim()
}

function hasComponent(node: MinimarkElement): boolean {
  for (let i = 2; i < node.length; i++) {
    const child = node[i] as MinimarkNode
    if (isElement(child) && (isComponent(child) || hasComponent(child))) return true
  }
  return false
}

interface Cleaned { text: string, id: string }

function collect(nodes: MinimarkNode[] | undefined, headings: MinimarkElement[]): void {
  for (const node of nodes ?? []) {
    if (!isElement(node)) continue
    if (HEADINGS.has(node[0]) && typeof node[1]?.id === 'string') {
      headings.push(node)
      continue
    }
    collect(node.slice(2) as MinimarkNode[], headings)
  }
}

function apply(links: TocLink[] | undefined, cleaned: Map<string, Cleaned>): void {
  for (const link of links ?? []) {
    const entry = cleaned.get(link.id)
    if (entry) {
      link.text = entry.text
      link.id = entry.id
    }
    apply(link.children, cleaned)
  }
}

/**
 * Rewrite `body.toc` labels — and, for headings that embed a component, the
 * heading's id in both `body.value` and `body.toc` — from the heading nodes.
 */
export function cleanTocLabels(body: TocBody | null | undefined): void {
  if (!body?.toc?.links?.length) return
  const headings: MinimarkElement[] = []
  collect(body.value, headings)

  const taken = new Set(headings.map(h => h[1].id as string))
  const cleaned = new Map<string, Cleaned>()
  for (const node of headings) {
    const originalId = node[1].id as string
    const text = label(node)
    // An empty result means the heading was nothing but a component; keeping
    // @nuxt/content's own text beats blanking the entry out.
    if (!text) continue
    let id = originalId
    if (hasComponent(node)) {
      const candidate = headingSlug(text)
      if (candidate && candidate !== originalId && !taken.has(candidate)) {
        taken.delete(originalId)
        taken.add(candidate)
        node[1].id = candidate
        id = candidate
      }
    }
    cleaned.set(originalId, { text, id })
  }
  apply(body.toc.links, cleaned)
}
