import type { AnalysisCard, Category } from '#shared/types/wiki'
import { analyses, graph, links, previews } from '#wiki-data'

/** Not entities: an analysis citing a video, a map or another analysis isn't drawing on a page about someone or something. */
const NOT_ENTITIES = new Set<Category>(['Root', 'MOCs', 'Videos', 'Analyses'])

/**
 * Analyses, newest first. `?limit=N` trims the list (the home page's strip);
 * without it, every analysis.
 */
export default defineEventHandler((event): AnalysisCard[] => {
  const limit = Number(getQuery(event).limit)
  const list = Number.isInteger(limit) && limit > 0 ? analyses.slice(0, limit) : analyses

  return list.map(analysis => ({
    path: graph.nodes[analysis.i]!.p,
    title: previews[analysis.i]?.title ?? graph.nodes[analysis.i]!.l,
    dek: analysis.dek,
    date: analysis.date,
    kind: analysis.kind,
    confidence: analysis.confidence,
    novelty: analysis.novelty,
    videoCount: analysis.videos,
    entityCount: (links.outgoing[analysis.i] ?? []).filter(i => !NOT_ENTITIES.has(graph.nodes[i]!.c)).length,
  }))
})
