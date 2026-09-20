import type { NoteRef } from '#shared/types/wiki'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Matches `MAX_NAMES` in `server/api/resolve.get.ts` — the route rejects a
 * request over that many names, so a page whose aggregated name list exceeds
 * it must be split into multiple requests rather than fail outright.
 */
const CHUNK_SIZE = 200

/** Splits `list` into ordered, contiguous chunks of at most `size` items.
 * Pure — no Nuxt runtime involved — so it's unit-tested directly. */
export function chunkNames(list: string[], size = CHUNK_SIZE): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size))
  }
  return chunks
}

/**
 * Flattens each chunk's settled `/api/resolve` result back into one array,
 * positionally aligned with the original (pre-chunking) name list — chunk 0's
 * results first, then chunk 1's, and so on, exactly the order `chunkNames`
 * sliced them from. A rejected chunk degrades to `null` for just its own
 * names rather than dropping every link on the page. Pure, like `chunkNames`.
 */
export function mergeChunkResults(
  chunks: string[][],
  settled: PromiseSettledResult<(NoteRef | null)[]>[],
): (NoteRef | null)[] {
  return settled.flatMap((result, i) =>
    result.status === 'fulfilled' ? result.value : chunks[i]!.map(() => null),
  )
}

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

      const chunks = chunkNames(list.value)

      const settled = await Promise.allSettled(
        chunks.map(chunk =>
          $fetch<(NoteRef | null)[]>('/api/resolve', {
            query: { names: chunk.join(',') },
          }),
        ),
      )

      return mergeChunkResults(chunks, settled)
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
