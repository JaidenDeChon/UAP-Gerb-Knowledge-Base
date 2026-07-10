import { graph } from '#wiki-data'

let byPath: Map<string, number> | undefined

/** Route path -> index into `graph.nodes`. Built once per server process. */
export function nodeIndexByPath(): Map<string, number> {
  return (byPath ??= new Map(graph.nodes.map(node => [node.p, node.i])))
}
