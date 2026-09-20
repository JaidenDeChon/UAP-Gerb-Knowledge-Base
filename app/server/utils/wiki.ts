import type { GraphNode } from '#shared/types/wiki'
import { graph } from '#wiki-data'
import { buildLabelIndex } from '~~/wiki/resolve'

let byPath: Map<string, number> | undefined

/** Route path -> index into `graph.nodes`. Built once per server process. */
export function nodeIndexByPath(): Map<string, number> {
  return (byPath ??= new Map(graph.nodes.map(node => [node.p, node.i])))
}

let byLabel: Map<string, GraphNode> | undefined

/** Lowercased label -> node. Built once per server process, like nodeIndexByPath. */
export function nodeIndexByLabel(): Map<string, GraphNode> {
  return (byLabel ??= buildLabelIndex(graph.nodes))
}
