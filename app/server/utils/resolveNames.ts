import type { GraphNode, NoteRef } from '../../shared/types/wiki'
import { resolveName } from '../../wiki/resolve'

/**
 * h3's `getQuery` returns a bare string when a query param occurs once and
 * an array when it repeats several times. Repeated `name=` params are the
 * wire format `useWikiResolve` sends, specifically because a vault page name
 * can itself contain a comma (e.g. "Crane, Indiana") — a comma-joined query
 * string would split such a name into extra, unresolvable fragments and
 * silently shift every result after it out of position. Normalise both
 * shapes to a trimmed, non-empty array here. Pure — no h3/Nuxt runtime
 * involved — so it's unit-tested directly.
 */
export function normalizeNameParam(name: string | string[] | undefined): string[] {
  if (name === undefined) return []
  const raw = Array.isArray(name) ? name : [name]
  return raw.map(n => String(n).trim()).filter(Boolean)
}

/**
 * Resolve each requested name to its note ref, positionally aligned with
 * `requested` — index i of the result answers index i of the request,
 * including a name that repeats. Throws rather than ever returning a
 * shorter or longer array: callers (`useWikiResolve`) key results
 * positionally against the request list, so any length mismatch would
 * silently shift every link after the divergence — exactly the failure mode
 * a comma-joined query string used to cause. Pure, like `normalizeNameParam`.
 */
export function resolveNames(
  requested: string[],
  index: Map<string, GraphNode>,
): (NoteRef | null)[] {
  const result = requested.map((name) => {
    const node = resolveName(name, index)
    return node ? { path: node.p, title: node.l, category: node.c } : null
  })

  if (result.length !== requested.length) {
    throw new Error('Resolve count mismatch')
  }

  return result
}
