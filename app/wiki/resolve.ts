import type { GraphNode } from '../shared/types/wiki'
import { fold, FOLDER_PRIORITY } from './vault'

/** Rank a node's category against FOLDER_PRIORITY; unlisted sorts last. */
function rank(category: string): number {
  const i = FOLDER_PRIORITY.indexOf(category)
  return i === -1 ? FOLDER_PRIORITY.length : i
}

/**
 * Lowercased label -> node, plus diacritic-folded aliases under the same map.
 * When two notes share a label, the higher-priority folder wins — the same rule
 * `resolveWikiTarget` applies to a bare `[[wikilink]]`, so a plain name in YAML
 * and a wikilink to that name always land on the same page.
 */
export function buildLabelIndex(nodes: GraphNode[]): Map<string, GraphNode> {
  const index = new Map<string, GraphNode>()

  const offer = (key: string, node: GraphNode): void => {
    const held = index.get(key)
    if (!held || rank(node.c) < rank(held.c)) index.set(key, node)
  }

  for (const node of nodes) {
    offer(node.l.toLowerCase(), node)
  }
  // Folded keys are a fallback only, so they are added second and never
  // overwrite an exact-label entry.
  for (const node of nodes) {
    const key = fold(node.l)
    if (!index.has(key)) offer(key, node)
  }

  return index
}

/** Resolve a plain page name to its node, or null when the vault has no such note. */
export function resolveName(
  name: string,
  index: Map<string, GraphNode>,
): GraphNode | null {
  const clean = name.trim()
  if (!clean) return null
  return index.get(clean.toLowerCase()) ?? index.get(fold(clean)) ?? null
}
