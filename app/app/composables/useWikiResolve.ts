import type { NoteRef } from '#shared/types/wiki'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Matches `MAX_NAMES` in `server/api/resolve.get.ts` — the route rejects a
 * request over that many names, so a page whose aggregated name list exceeds
 * it must be split into multiple requests rather than fail outright.
 */
const CHUNK_SIZE = 200

/**
 * Resolve plain page names (as written in an MDC block's YAML) to note refs.
 *
 * Batched: every name on a page goes out in as few requests as possible — one,
 * unless the page's unique name count exceeds the route's cap, in which case
 * it's chunked and the chunks are fetched in parallel. Keyed by the original
 * string so a component can look up exactly what its YAML said. Names with no
 * matching note — or whose chunk request failed — are simply absent from the
 * map; callers render plain text.
 */
export function useWikiResolve(names: MaybeRefOrGetter<string[]>) {
  const list = computed(() => {
    const seen = new Set<string>()
    for (const name of toValue(names)) {
      const clean = name.trim()
      if (clean) seen.add(clean)
    }
    return [...seen].sort()
  })

  const key = computed(() => `resolve:${list.value.join('|')}`)

  const { data } = useAsyncData(
    () => key.value,
    async (): Promise<(NoteRef | null)[]> => {
      if (!list.value.length) return []

      const chunks: string[][] = []
      for (let i = 0; i < list.value.length; i += CHUNK_SIZE) {
        chunks.push(list.value.slice(i, i + CHUNK_SIZE))
      }

      const settled = await Promise.allSettled(
        chunks.map(chunk =>
          $fetch<(NoteRef | null)[]>('/api/resolve', {
            query: { names: chunk.join(',') },
          }),
        ),
      )

      // Concatenate in chunk order so the result stays positionally aligned
      // with `list`. A chunk that fails degrades to nulls for just its own
      // names, rather than dropping every link on the page.
      return settled.flatMap((result, i) =>
        result.status === 'fulfilled' ? result.value : chunks[i]!.map(() => null),
      )
    },
    { watch: [list], default: () => [] },
  )

  const refs = computed(() => {
    const map = new Map<string, NoteRef>()
    const rows = data.value ?? []
    list.value.forEach((name, i) => {
      const ref = rows[i]
      if (ref) map.set(name, ref)
    })
    return map
  })

  return { refs }
}
