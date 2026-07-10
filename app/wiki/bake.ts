// Relative rather than the `#shared` alias — see the note in ./graph.ts.
import type { BakedPreview, WikiData } from '../shared/types/wiki'
import { graphIndex } from './graph'
import { buildPreviews } from './preview'
import { buildTree } from './tree'

/**
 * Scan the vault and derive everything the server routes serve.
 *
 * The Obsidian vault sits beside the Nuxt app in the repo, so it exists on the
 * build machine — but Nitro bundles the server into a single function and the
 * 1,092 markdown files are not traced into it. Reading them per request works in
 * dev and 500s in production. So we run the scan once, here, and inline the
 * result into the bundle as a virtual module (see `nitro.virtual` in nuxt.config).
 *
 * Links and previews are stored as arrays indexed by `GraphNode.i` rather than
 * keyed by route path: paths are long, and every one of them already appears in
 * `graph.nodes`. Keying by path costs ~600 KB of duplicated strings.
 */
export function bakeWikiData(): WikiData {
  const { payload, linkMap, nodeByPath } = graphIndex()

  const indexOf = (path: string): number | undefined => nodeByPath.get(path)?.i
  const toIndices = (paths: string[]): number[] =>
    paths.map(indexOf).filter((i): i is number => i !== undefined)

  const outgoing: number[][] = payload.nodes.map(() => [])
  const backlinks: number[][] = payload.nodes.map(() => [])
  for (const [path, directed] of linkMap) {
    const i = indexOf(path)
    if (i === undefined) continue
    outgoing[i] = toIndices(directed.outgoing)
    backlinks[i] = toIndices(directed.backlinks)
  }

  const byPath = buildPreviews()
  const previews: BakedPreview[] = payload.nodes.map((node) => {
    const preview = byPath[node.p]
    return {
      title: preview?.title ?? node.l,
      lead: preview?.lead ?? '',
      tags: preview?.tags ?? [],
    }
  })

  return { tree: buildTree(), graph: payload, links: { outgoing, backlinks }, previews }
}

/**
 * `bakeWikiData()` serialized as an ES module.
 *
 * The payload is emitted as `JSON.parse` of a single string literal rather than
 * an object literal: engines parse JSON substantially faster than the equivalent
 * JS source, which matters on a cold serverless start.
 */
export function bakeWikiDataModule(): string {
  const json = JSON.stringify(bakeWikiData())
  return [
    `const data = JSON.parse(${JSON.stringify(json)})`,
    'export const tree = data.tree',
    'export const graph = data.graph',
    'export const links = data.links',
    'export const previews = data.previews',
  ].join('\n')
}
