import type { NoteRef } from '#shared/types/wiki'
import type { MaybeRefOrGetter } from 'vue'

/**
 * Resolve plain page names (as written in an MDC block's YAML) to note refs.
 *
 * Batched: every name on a page goes out in one request. Keyed by the original
 * string so a component can look up exactly what its YAML said. Names with no
 * matching note are simply absent from the map — callers render plain text.
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
      return await $fetch<(NoteRef | null)[]>('/api/resolve', {
        query: { names: list.value.join(',') },
      })
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
