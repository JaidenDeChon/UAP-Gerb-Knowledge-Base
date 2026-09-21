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
 * Anchor ids are left exactly as @nuxt/content generated them: the rail's
 * `href` and the rendered heading's `id` are two separate copies of the same
 * string, and rewriting one without the other breaks every in-page link.
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

function label(node: MinimarkElement): string {
  let out = ''
  for (let i = 2; i < node.length; i++) {
    const child = node[i] as MinimarkNode
    if (typeof child === 'string') out += child
    else if (isElement(child) && !isComponent(child)) out += label(child)
  }
  return out.replace(/\s+/g, ' ').trim()
}

function collect(nodes: MinimarkNode[] | undefined, into: Map<string, string>): void {
  for (const node of nodes ?? []) {
    if (!isElement(node)) continue
    const id = node[1]?.id
    if (HEADINGS.has(node[0]) && typeof id === 'string') {
      const text = label(node)
      // An empty result means the heading was nothing but a component; keeping
      // @nuxt/content's own text beats blanking the entry out.
      if (text) into.set(id, text)
      continue
    }
    collect(node.slice(2) as MinimarkNode[], into)
  }
}

function apply(links: TocLink[] | undefined, labels: Map<string, string>): void {
  for (const link of links ?? []) {
    const text = labels.get(link.id)
    if (text) link.text = text
    apply(link.children, labels)
  }
}

/** Rewrite `body.toc` labels in place from the heading nodes in `body.value`. */
export function cleanTocLabels(body: TocBody | null | undefined): void {
  if (!body?.toc?.links?.length) return
  const labels = new Map<string, string>()
  collect(body.value, labels)
  apply(body.toc.links, labels)
}
