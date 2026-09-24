import type { RouterConfig } from '@nuxt/schema'
import { markRouteArrived, onRouteArrived, scrollHashIntoView } from './composables/useScrollRestore'

/**
 * Vue Router's built-in scrollBehavior applies a saved position once, which
 * lands short on articles that keep growing after the route resolves (see
 * useScrollRestore). This override makes the same POP/PUSH/hash decision
 * Vue Router already knows how to make, using `savedPosition` (non-null
 * only on a POP, i.e. browser back/forward), but hands the actual scrolling
 * off to useScrollRestore, which keeps re-applying it until the page settles.
 *
 * The container's scroll is *captured* on the way out by a `router.beforeEach`
 * guard the layout registers on mount — this file only ever runs on arrival,
 * so it has no hook for "leaving" a route.
 */
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (to.hash) {
      // TOC rail links: jump the target heading into view rather than
      // restoring/resetting the container's own scroll. `markRouteArrived`,
      // not `onRouteArrived` — the latter resets the container to the top,
      // which landed on the heading and then snapped straight back, so every
      // rail link only ever changed the URL.
      scrollHashIntoView(to.hash)
      markRouteArrived()
      return false
    }

    // savedPosition is set only when Vue Router determines this navigation
    // is a POP — that's the router's decision, not a guess made here.
    if (savedPosition) {
      onRouteArrived(true)
      return false
    }

    // Same path, different query: the reader hasn't gone anywhere, they've
    // changed a control that keeps its state in the URL (the timeline's
    // category/major filters use `router.replace` for exactly that). Treating
    // it as arrival would fire the PUSH branch below and throw them back to
    // the top mid-read. Leave the container where it is — and don't touch
    // `currentKey`, since `replace` reuses the same history entry.
    if (to.path === from.path) return false

    onRouteArrived(false)
    return false
  },
}
