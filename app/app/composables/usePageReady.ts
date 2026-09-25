import type { MaybeRefOrGetter } from 'vue'

/**
 * Holds the page on the UFO loader until `ready` is true.
 *
 * Call it from a page, or from any component the page renders, for each
 * thing the page needs before it's worth showing: its data, a map's
 * outlines, a canvas that has drawn. The app shows the loader alone until
 * every registered check passes, then blurs it out as the whole page unblurs
 * in (see plugins/page-load.ts). A component that unmounts takes its check
 * with it.
 *
 * `ready` should settle on failure too (an error status counts as done), or
 * a failed request would hold the page on the loader.
 *
 * Content rendered only on the client (inside `<ClientOnly>`) can't register
 * during the server render, so its page should register for it instead,
 * with a flag the component sets: otherwise the server's HTML shows the page
 * before that content exists.
 */
export function usePageReady(ready: MaybeRefOrGetter<boolean>): void {
  const { registry } = useNuxtApp().$pageLoad
  const id = Symbol('page-ready')
  registry.set(id, () => toValue(ready))
  if (getCurrentScope()) onScopeDispose(() => registry.delete(id))
}
