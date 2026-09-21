/**
 * Scroll-position bookkeeping for the reader's `<main>` container.
 *
 * The page scrolls inside `<main>` (see layouts/default.vue), not the
 * window, so Vue Router's built-in scroll restoration — which only ever
 * targets `window`/`document.documentElement` — can't reach it. The
 * POP/PUSH/hash *decision* still comes from the router (app/router.options.ts's
 * `scrollBehavior`, which knows `savedPosition` is non-null only on a POP);
 * this module just holds the state that decision needs: where the
 * container is, and what scrollTop each history entry had.
 *
 * Positions are keyed by `history.state.position` — this app's Vue Router
 * build stores no `.key` string on history state, only a monotonically
 * assigned `position` number (bumped once per pushed entry, untouched by
 * back/forward, since the browser just replays the same serialized state
 * object for that entry). That number is this app's closest equivalent to
 * "the history state key Vue Router maintains", and it round-trips the
 * same way a string key would.
 *
 * Capped at MAX_ENTRIES so a long reading session doesn't grow the map
 * forever — oldest-saved entries are evicted first.
 */

const MAX_ENTRIES = 50

const positions = new Map<string, number>()

let container: HTMLElement | null = null
/**
 * The history entry we last *arrived* on. Deliberately NOT re-read live from
 * `history.state` inside the `beforeEach` guard that saves outgoing scroll:
 * for a POP (back/forward), the browser has already flipped `history.state`
 * to the *destination* entry by the time `beforeEach` runs, so reading it
 * live there would tag the outgoing page's scrollTop under the destination's
 * key — clobbering the destination's own saved position moments before
 * `onRouteArrived` reads it back. Tracking arrival separately sidesteps that
 * push/pop timing asymmetry entirely.
 */
let currentKey: string | null = null

function historyKey(): string | null {
  const state = typeof history === 'undefined' ? null : (history.state as { position?: number } | null)
  return state && typeof state.position === 'number' ? String(state.position) : null
}

/** The layout calls this once, on mount, to hand over the scrolling element. */
export function registerScrollContainer(el: HTMLElement | null): void {
  container = el
  currentKey ??= historyKey()
}

/**
 * Registered by the layout as a `router.beforeEach` guard: snapshot the
 * container's scroll under the entry we're leaving, before the URL (and
 * `history.state`) changes.
 */
export function saveOutgoingScroll(): void {
  if (!currentKey || !container) return
  positions.set(currentKey, container.scrollTop)
  if (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest !== undefined) positions.delete(oldest)
  }
}

/**
 * Record that we've arrived on a new history entry, without moving the
 * container. For the hash branch, which has already scrolled the target into
 * view and only needs the bookkeeping — `onRouteArrived` would undo that
 * scroll on its way to the same assignment.
 */
export function markRouteArrived(): void {
  currentKey = historyKey()
}

/**
 * Called from `scrollBehavior` once the destination route has rendered.
 * `isPop` restores the container to that entry's saved scrollTop (falling
 * back to 0 if this entry was never visited before); otherwise it resets to
 * the top, matching a fresh PUSH.
 */
export function onRouteArrived(isPop: boolean): void {
  const key = historyKey()
  if (container) {
    container.scrollTop = isPop && key && positions.has(key) ? positions.get(key)! : 0
  }
  currentKey = key
}

/** Scroll a hash target into view, within whichever ancestor actually scrolls. */
export function scrollHashIntoView(hash: string): void {
  if (!hash) return
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  }
  catch {
    // Malformed escape sequence — fall back to the raw fragment.
  }
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}
