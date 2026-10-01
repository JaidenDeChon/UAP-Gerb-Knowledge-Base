import type { PersonProfile } from '#shared/types/wiki'
import { graph, links, portraits, previews, videos } from '#wiki-data'
import { buildPersonProfile } from '../utils/personProfile'

/**
 * A People note's videos and connections, derived from the baked link graph
 * (see `buildPersonProfile`). Every People page gets these with no authoring.
 */
export default defineEventHandler((event): PersonProfile => {
  const { path } = getQuery(event)
  if (typeof path !== 'string' || !path.startsWith('/wiki/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const index = nodeIndexByPath().get(path)
  if (index === undefined || graph.nodes[index]!.c !== 'People') {
    throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  }

  return buildPersonProfile(index, { nodes: graph.nodes, links, previews, videos, portraits })
})
