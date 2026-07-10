import type { NoteLinks, NoteRef } from '#shared/types/wiki'
import { graph, links } from '#wiki-data'

export default defineEventHandler((event): NoteLinks => {
  const { path } = getQuery(event)
  if (typeof path !== 'string' || !path.startsWith('/wiki/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const index = nodeIndexByPath().get(path)
  if (index === undefined) {
    throw createError({ statusCode: 404, statusMessage: 'Note not found' })
  }

  const toRef = (i: number): NoteRef | undefined => {
    const node = graph.nodes[i]
    return node ? { path: node.p, title: node.l, category: node.c } : undefined
  }
  const resolve = (indices: number[]): NoteRef[] =>
    indices.map(toRef).filter((ref): ref is NoteRef => ref !== undefined)

  return {
    outgoing: resolve(links.outgoing[index] ?? []),
    backlinks: resolve(links.backlinks[index] ?? []),
  }
})
