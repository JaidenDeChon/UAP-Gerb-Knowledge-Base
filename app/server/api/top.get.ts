import type { TopEntries } from '#shared/types/wiki'
import { graph, links, portraits, previews } from '#wiki-data'
import { buildTopEntries } from '../utils/topEntries'

/** The most referenced entries of each kind (`?per=N`, default 6, at most 24), for the home page. */
export default defineEventHandler((event): TopEntries => {
  const per = Number(getQuery(event).per)
  const n = Number.isInteger(per) && per > 0 ? Math.min(per, 24) : 6
  return buildTopEntries(n, { nodes: graph.nodes, links, previews, portraits })
})
