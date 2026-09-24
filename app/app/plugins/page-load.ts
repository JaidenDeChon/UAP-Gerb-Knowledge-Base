import type { ComputedRef } from 'vue'

/**
 * The app's one loading state. While any part of the page on screen is not
 * ready (see `usePageReady`), the page is "loading": `<html>` carries
 * `data-page-loading`, which hides everything in the page area and shows the
 * UFO loader (the layout's `AppLoadingMark`; main.css has the rules). When
 * the last part becomes ready the attribute goes, and the loader blurs out as
 * the page unblurs in, both at once (`data-page-revealing`).
 *
 * The attribute is written two ways, from the same state:
 * - on the server through `useHead`, which resolves after the page has
 *   rendered, so a fresh visit's HTML already shows the loader alone;
 * - on the client directly and synchronously, the moment the state
 *   changes, so a page that starts loading is hidden before it can paint.
 *
 * A load that ends before the loader has faded in (`LOADER_DELAY`) skips the
 * transition: the page is just there.
 */

/** Matches the loader's fade-in delay in main.css. */
const LOADER_DELAY = 250
/** The reveal's length: the veil's unblur, the longer of the two in main.css. */
const REVEAL_MS = 620

export interface PageLoad {
  /** Readiness checks registered by `usePageReady`, by owner. */
  registry: Map<symbol, () => boolean>
  loading: ComputedRef<boolean>
}

export default defineNuxtPlugin((nuxtApp) => {
  const registry = shallowReactive(new Map<symbol, () => boolean>())
  const loading = computed(() => {
    for (const ready of registry.values()) {
      if (!ready()) return true
    }
    return false
  })

  // Server only: on the client the watcher below owns the attribute, and a
  // second writer (unhead patches the DOM on its own schedule) would show
  // the page without the hand-over.
  if (import.meta.server) {
    useHead({
      htmlAttrs: { 'data-page-loading': computed(() => (loading.value ? 'true' : undefined)) },
    })
  }

  if (import.meta.client) {
    const html = document.documentElement
    // A server-rendered page that arrives loading has been loading since
    // navigation start: `since` 0 makes its reveal a real transition.
    let since = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    /**
     * Shows the page, if it's still ready. Run just before the next paint,
     * not the moment the last check passes: the content that check was
     * waiting for renders in the same turn and may bring parts of its own
     * that register (the home page's recent-videos strip mounts with the
     * page body), and the page must stay hidden until they're ready too.
     */
    function reveal(): void {
      if (loading.value || !html.hasAttribute('data-page-loading')) return
      html.removeAttribute('data-page-loading')
      const shown = performance.now() - since >= LOADER_DELAY
      if (!shown || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      html.setAttribute('data-page-revealing', 'true')
      timer = setTimeout(() => html.removeAttribute('data-page-revealing'), REVEAL_MS + 80)
    }

    watch(loading, (now) => {
      if (!now) {
        requestAnimationFrame(reveal)
        return
      }
      // Hide at once: this runs as the part registers, before its page can paint.
      if (html.hasAttribute('data-page-loading')) return
      clearTimeout(timer)
      since = performance.now()
      html.removeAttribute('data-page-revealing')
      html.setAttribute('data-page-loading', 'true')
    }, { flush: 'sync' })

    // A server-rendered page that arrived loading and is already ready once
    // hydrated never changes state, so nothing above would show it. Checked
    // when the page itself has hydrated (its suspense resolved), not when the
    // app mounts: the page component comes later, and until it has
    // registered, an empty registry reads as "ready".
    nuxtApp.hook('app:suspense:resolve', () => {
      requestAnimationFrame(reveal)
    })
  }

  return { provide: { pageLoad: { registry, loading } satisfies PageLoad } }
})
