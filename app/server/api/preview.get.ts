import type { NotePreview } from '#shared/types/wiki'
import { graph, previews } from '#wiki-data'

export default defineEventHandler((event): NotePreview => {
  const { path } = getQuery(event)
  if (typeof path !== 'string' || !path.startsWith('/wiki/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const index = nodeIndexByPath().get(path)
  const node = index === undefined ? undefined : graph.nodes[index]
  const preview = index === undefined ? undefined : previews[index]
  if (!node || !preview) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  return {
    path: node.p,
    title: preview.title,
    category: node.c,
    lead: preview.lead,
    tags: preview.tags,
  }
})
