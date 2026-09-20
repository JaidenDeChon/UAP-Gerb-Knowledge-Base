import type { RouterConfig } from '@nuxt/schema'
import { onRouteArrived, scrollHashIntoView } from './composables/useScrollRestore'

/**
 * The reader's content scrolls inside `<main>`, not the window (see
 * layouts/default.vue), so Vue Router's built-in scrollBehavior — which
 * always computes positions against `window`/`document.documentElement` —
 * can't restore it. This override makes the same POP/PUSH/hash decision
 * Vue Router already knows how to make, using `savedPosition` (non-null
 * only on a POP, i.e. browser back/forward), but hands the actual scrolling
 * off to useScrollRestore, which operates on the container directly.
 *
 * The container's scroll is *captured* on the way out by a `router.beforeEach`
 * guard the layout registers on mount — this file only ever runs on arrival,
 * so it has no hook for "leaving" a route.
 */
export default <RouterConfig>{
  scrollBehavior(to, _from, savedPosition) {
    if (to.hash) {
      // TOC rail links: jump the target heading into view rather than
      // restoring/resetting the container's own scroll.
      scrollHashIntoView(to.hash)
      onRouteArrived(false)
      return false
    }

    // savedPosition is set only when Vue Router determines this navigation
    // is a POP — that's the router's decision, not a guess made here.
    onRouteArrived(Boolean(savedPosition))
    return false
  },
}
