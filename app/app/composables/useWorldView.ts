import type { WritableComputedRef } from 'vue'

export type WorldMode = 'pins' | 'heat'

/**
 * The `/world` page's shared state: which place is selected (by its slug,
 * `placeSlug(path)`) and whether the maps show pins or heat. Both live in the
 * URL query (`?at=area-51&mode=heat`), so a view can be linked to and Back
 * returns to it. `router.replace`, not push: changing either is adjusting a
 * control, not going somewhere, and a same-path replace leaves the reader's
 * scroll alone (router.options.ts).
 */
export function useWorldView(): {
  selected: WritableComputedRef<string | null>
  mode: WritableComputedRef<WorldMode>
} {
  const route = useRoute()
  const router = useRouter()

  function set(key: string, value: string | null): void {
    const query = { ...route.query }
    if (value) query[key] = value
    else delete query[key]
    router.replace({ query })
  }

  const selected = computed<string | null>({
    get: () => (typeof route.query.at === 'string' && route.query.at ? route.query.at : null),
    set: v => set('at', v),
  })

  const mode = computed<WorldMode>({
    get: () => (route.query.mode === 'heat' ? 'heat' : 'pins'),
    set: v => set('mode', v === 'heat' ? 'heat' : null),
  })

  return { selected, mode }
}
