/**
 * Scroll-position bookkeeping for the reader's scroller — the document itself
 * (`document.scrollingElement`, handed over by layouts/default.vue).
 *
 * Vue Router's built-in restoration would target the same element, but it
 * applies a saved offset once, and that isn't enough here (see below). The
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
 *
 * Two things make a plain `scrollTop = saved` unreliable, both hit on Safari:
 *
 * - Articles render their body after the route resolves (behind the loader),
 *   so on arrival the page is still short and the browser clamps the saved
 *   offset to the top. `restoreTo` keeps reapplying the target while the
 *   page grows and settles, and backs off the moment the reader scrolls.
 * - Safari often skips its back/forward cache for this app and reloads the
 *   page on Back, wiping in-memory state. Positions are mirrored to
 *   sessionStorage (per-tab, like history itself), and a back_forward page
 *   load restores from there.
 */

const MAX_ENTRIES = 50
const STORAGE_KEY = 'ufo:scroll-positions'
/** Stop chasing the target after this long, even if the page never settles. */
const RESTORE_MAX_MS = 8000
/** The page counts as settled once its height has held still this long. */
const RESTORE_SETTLE_MS = 600
/**
 * How often to re-check while restoring. A timer, not requestAnimationFrame:
 * rAF is paused in background tabs, so a page restored while hidden would
 * never be scrolled.
 */
const RESTORE_TICK_MS = 50

const positions = new Map<string, number>(readStoredPositions())

function readStoredPositions(): [string, number][] {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number')
      : []
  }
  catch {
    return []
  }
}

function persistPositions(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...positions]))
  }
  catch {
    // Private mode or storage blocked — in-memory restore still works.
  }
}

let cancelRestore: (() => void) | null = null

/** Any of these means the reader has taken over, so stop restoring. */
const INTERRUPTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/**
 * Drive the container to `target`, re-applying it every tick while the page
 * is still growing or shifting, until the target is reachable and the height
 * has settled, the reader interacts, or RESTORE_MAX_MS passes.
 */
function restoreTo(el: HTMLElement, target: number): void {
  cancelRestore?.()
  if (target <= 0) {
    el.scrollTop = 0
    return
  }

  const start = performance.now()
  let lastHeight = -1
  let stableSince = start
  let timer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(timer)
    for (const type of INTERRUPTS) window.removeEventListener(type, stop)
    if (cancelRestore === stop) cancelRestore = null
  }
  for (const type of INTERRUPTS) window.addEventListener(type, stop, { passive: true })
  cancelRestore = stop

  const tick = () => {
    const now = performance.now()
    const height = el.scrollHeight
    if (height !== lastHeight) {
      lastHeight = height
      stableSince = now
    }
    el.scrollTop = target
    const reachable = height - el.clientHeight >= target
    if ((reachable && now - stableSince >= RESTORE_SETTLE_MS) || now - start >= RESTORE_MAX_MS) {
      stop()
      return
    }
    timer = setTimeout(tick, RESTORE_TICK_MS)
  }
  tick()
}

/** Whether this document was loaded by Back/Forward (including a Safari reload-on-back). */
function loadedByHistory(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    return nav?.type === 'back_forward'
  }
  catch {
    return false
  }
}

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
  // A Back/Forward that reloaded the whole page never reaches scrollBehavior's
  // POP branch, so restore this entry's position from storage here.
  if (el && currentKey && loadedByHistory() && positions.has(currentKey)) {
    restoreTo(el, positions.get(currentKey)!)
  }
}

/**
 * The scrolling element (the document's), for components that need to read
 * or drive the reader's scroll — the timeline's reading cursor, the article
 * progress bar. Null only on the server. Being the document scroller, its
 * `scroll` and `scrollend` events fire on `window`, not on the element.
 */
export function getScrollContainer(): HTMLElement | null {
  if (container) return container
  return typeof document === 'undefined' ? null : document.scrollingElement as HTMLElement | null
}

/**
 * How much of the top of the scroller sits under the sticky h-14 AppTopBar.
 * Content scrolls beneath it, so the reader's visible area starts this far
 * down — sticky offsets, reading lines and scroll targets all allow for it.
 * Matches `scroll-padding-top` on <html> in main.css.
 */
export const SCROLL_INSET_TOP = 56

/**
 * Registered by the layout as a `router.beforeEach` guard: snapshot the
 * container's scroll under the entry we're leaving, before the URL (and
 * `history.state`) changes.
 */
export function saveOutgoingScroll(): void {
  cancelRestore?.()
  if (!currentKey || !container) return
  positions.delete(currentKey) // re-insert so eviction order is last-saved, not first-seen
  positions.set(currentKey, container.scrollTop)
  if (positions.size > MAX_ENTRIES) {
    const oldest = positions.keys().next().value
    if (oldest !== undefined) positions.delete(oldest)
  }
  persistPositions()
}

/**
 * Also snapshot on the way out of the document itself (external link, tab
 * close, a Safari reload-on-back), which no router guard sees.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => saveOutgoingScroll())
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
    const target = isPop && key && positions.has(key) ? positions.get(key)! : 0
    restoreTo(container, target)
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
