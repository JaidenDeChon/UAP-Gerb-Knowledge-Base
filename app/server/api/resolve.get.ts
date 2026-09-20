import type { NoteRef } from '#shared/types/wiki'
import { resolveName } from '~~/wiki/resolve'

/** Cap the batch so a malformed query cannot walk the whole vault. */
const MAX_NAMES = 200

export default defineEventHandler((event): (NoteRef | null)[] => {
  const { names } = getQuery(event)
  if (typeof names !== 'string' || !names.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing names' })
  }

  const requested = names.split(',').map(n => n.trim()).filter(Boolean)
  if (requested.length > MAX_NAMES) {
    throw createError({ statusCode: 400, statusMessage: 'Too many names' })
  }

  const index = nodeIndexByLabel()
  return requested.map((name) => {
    const node = resolveName(name, index)
    return node ? { path: node.p, title: node.l, category: node.c } : null
  })
})
