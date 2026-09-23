import type { NoteRef } from '#shared/types/wiki'
import { geo } from '#wiki-data'

/** Cap the batch so a malformed query cannot walk the whole vault. */
const MAX_NAMES = 200

export default defineEventHandler((event): (NoteRef | null)[] => {
  const { name } = getQuery(event)
  const requested = normalizeNameParam(name as string | string[] | undefined)

  if (!requested.length) {
    throw createError({ statusCode: 400, statusMessage: 'Missing names' })
  }
  if (requested.length > MAX_NAMES) {
    throw createError({ statusCode: 400, statusMessage: 'Too many names' })
  }

  const index = nodeIndexByLabel()
  try {
    return resolveNames(requested, index, geo)
  }
  catch {
    // The caller keys results positionally against the request list — a
    // mismatched count would silently shift every link after the
    // divergence. Fail loudly instead of ever returning a misaligned array.
    throw createError({ statusCode: 500, statusMessage: 'Resolve count mismatch' })
  }
})
