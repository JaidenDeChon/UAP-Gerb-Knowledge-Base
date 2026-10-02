import type { BakedLinks, BakedPortraits, BakedPreview, Category, GraphNode, TopEntries, TopEntry } from '../../shared/types/wiki'
import { CATEGORY_ORDER } from '../../shared/types/wiki'

/** Kinds that get a list: everything but videos, maps of content and the home page. */
export const TOP_CATEGORIES: Category[] = CATEGORY_ORDER.filter(c => c !== 'Videos' && c !== 'MOCs')

export interface TopSources {
  nodes: GraphNode[]
  links: BakedLinks
  previews: BakedPreview[]
  portraits: BakedPortraits
}

/**
 * The `per` most referenced entries of each kind: most distinct entries
 * linking in first, then most videos among them, then alphabetical. A kind
 * with nothing linked is left out. Pure, so it is unit-tested directly.
 */
export function buildTopEntries(per: number, sources: TopSources): TopEntries {
  const { nodes, links, previews, portraits } = sources
  const out: TopEntries = []
  for (const category of TOP_CATEGORIES) {
    const entries: TopEntry[] = []
    for (const node of nodes) {
      if (node.c !== category) continue
      const back = (links.backlinks[node.i] ?? []).filter(i => i !== node.i)
      if (!back.length) continue
      entries.push({
        path: node.p,
        title: previews[node.i]?.title ?? node.l,
        category,
        lead: previews[node.i]?.lead ?? '',
        ...(portraits[node.i] ? { image: portraits[node.i] } : {}),
        links: back.length,
        videos: back.filter(i => nodes[i]?.c === 'Videos').length,
      })
    }
    entries.sort((a, b) => b.links - a.links || b.videos - a.videos || a.title.localeCompare(b.title))
    if (entries.length) out.push({ category, entries: entries.slice(0, per) })
  }
  return out
}
