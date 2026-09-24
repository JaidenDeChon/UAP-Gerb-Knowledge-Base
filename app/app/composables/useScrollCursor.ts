import type { Ref } from 'vue'
import { cursorFor } from '@/utils/timeline'
import { getScrollContainer, SCROLL_INSET_TOP } from '@/composables/useScrollRestore'

export interface ScrollCursorOptions {
  /** CSS selector for the entries inside `listRoot`, in reading order. */
  itemSelector: string
  /** Where the "reading line" sits, as a fraction of the visible area below the top bar. */
  readingLine?: number
  /** Extra offset (px) to leave above an entry when scrolling to it, below the top bar — the pinned chronometer's height. */
  stickyOffset?: () => number
}

/**
 * The one scroll pass behind the timeline's reading cursor.
 *
 * Entry offsets are measured in a single batched read (on mount, on resize
 * of the list, and on demand via `refresh()`), never inside the scroll
 * handler. The document's `scroll` event — passive — schedules one rAF that
 * does arithmetic on those cached numbers: which entry sits at the reading
 * line, how far the line has travelled toward the next one, and how far
 * through the whole list the reader is. Consumers draw from `index`, `t`
 * and `progress`; nothing here touches the DOM per frame.
 *
 * Follow mode needs to know when the *reader* scrolls (as opposed to a
 * programmatic `scrollToIndex`), so `onUserScroll` exposes the input events
 * that only a person produces: wheel, touch and the scroll keys.
 */
export function useScrollCursor(listRoot: Ref<HTMLElement | null>, opts: ScrollCursorOptions) {
  const readingLine = opts.readingLine ?? 0.35

  const index = ref(-1)
  const t = ref(0)
  const progress = ref(0)
  /** The reading line's position in container scroll space, for consumers that measure themselves. */
  const lineY = ref(0)

  let container: HTMLElement | null = null
  let offsets: number[] = []
  let listTop = 0
  let listBottom = 0
  let frame = 0
  let measureFrame = 0
  let resizeObserver: ResizeObserver | null = null
  const userScrollHandlers = new Set<() => void>()

  /**
   * An element's top in the container's scroll space, from the offsetParent
   * chain — layout position, not the transformed box. `getBoundingClientRect`
   * would include the reveal directive's resting `translateY(14px)` on every
   * below-the-fold entry and record them all 14px low.
   */
  function layoutTop(el: HTMLElement): number {
    let y = 0
    let node: HTMLElement | null = el
    while (node && node !== container) {
      y += node.offsetTop
      node = node.offsetParent as HTMLElement | null
    }
    return y
  }

  function measure(): void {
    measureFrame = 0
    if (!container || !listRoot.value) return
    const items = listRoot.value.querySelectorAll<HTMLElement>(opts.itemSelector)
    offsets = Array.from(items, layoutTop)
    listTop = layoutTop(listRoot.value)
    listBottom = listTop + listRoot.value.offsetHeight
    compute()
  }

  /** The reading line's distance below the scroller's top edge. */
  function lineOffset(): number {
    if (!container) return 0
    return SCROLL_INSET_TOP + (container.clientHeight - SCROLL_INSET_TOP) * readingLine
  }

  function compute(): void {
    frame = 0
    if (!container) return
    const y = container.scrollTop + lineOffset()
    lineY.value = y
    const cursor = cursorFor(y, offsets)
    if (cursor.index !== index.value) index.value = cursor.index
    if (cursor.t !== t.value) t.value = cursor.t
    const span = listBottom - listTop
    const p = span > 0 ? Math.min(1, Math.max(0, (y - listTop) / span)) : 0
    if (p !== progress.value) progress.value = p
  }

  // A scroll the composable did not start itself — scrollbar drag, a TOC or
  // anchor link, browser find — counts as the reader moving. While a
  // `scrollToIndex` is in flight, the container's own scroll events are
  // expected and not reported as the reader's. It used to be a fixed 1.5s
  // window, but a smooth scroll across a long timeline outlasts that, so the
  // tail of the page's own scroll read as the reader's and switched Follow
  // off. Now the flight ends on `scrollend`, with a timeout sized to the
  // distance as a fallback where that event isn't supported. Wheel, touch and
  // key input still report the reader at once, mid-flight or not.
  let programmatic = false
  let programmaticTimer: ReturnType<typeof setTimeout> | undefined
  function endProgrammatic(): void {
    programmatic = false
    clearTimeout(programmaticTimer)
  }
  function onScroll(): void {
    if (!programmatic) emitUserScroll()
    if (!frame) frame = requestAnimationFrame(compute)
  }
  function onScrollEnd(): void {
    if (programmatic) endProgrammatic()
  }

  /** Re-measure entry offsets (after a filter change, say). Coalesced to one frame. */
  function refresh(): void {
    if (!measureFrame) measureFrame = requestAnimationFrame(measure)
  }

  /** Re-measure synchronously — for a jump that must land right after a DOM change. */
  function refreshNow(): void {
    if (measureFrame) {
      cancelAnimationFrame(measureFrame)
      measureFrame = 0
    }
    measure()
  }

  function scrollToIndex(i: number, behavior: ScrollBehavior = 'smooth'): void {
    if (!container) return
    const top = offsets[i]
    if (top === undefined) return
    const target = Math.max(0, top - SCROLL_INSET_TOP - (opts.stickyOffset?.() ?? 0) - 12)
    const distance = Math.abs(target - container.scrollTop)
    programmatic = true
    clearTimeout(programmaticTimer)
    programmaticTimer = setTimeout(endProgrammatic,
      behavior === 'smooth' ? Math.min(5000, 800 + distance * 0.6) : 250)
    container.scrollTo({ top: target, behavior })
  }

  /**
   * Put the reading line at entry `i`, fraction `t` of the way to entry
   * `i + 1`: the scroll position whose cursor is (i, t). Instant, for
   * scrubbing. Not marked programmatic: a scrub is the reader moving.
   */
  function scrollToPosition(i: number, t: number): void {
    if (!container) return
    const here = offsets[i]
    if (here === undefined) return
    const next = offsets[i + 1] ?? here
    const y = here + (next - here) * Math.min(1, Math.max(0, t))
    container.scrollTop = Math.max(0, y - lineOffset())
  }

  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
  function emitUserScroll(): void {
    for (const handler of userScrollHandlers) handler()
  }
  function onKeydown(event: KeyboardEvent): void {
    if (!SCROLL_KEYS.has(event.key)) return
    // Keys typed into a field (the command palette, say) or aimed at something
    // outside the container scroll nothing here.
    const target = event.target as HTMLElement | null
    if (target && target !== document.body) {
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (container && !container.contains(target)) return
    }
    emitUserScroll()
  }

  /** Subscribe to reader-initiated scrolling. Returns an unsubscribe. */
  function onUserScroll(handler: () => void): () => void {
    userScrollHandlers.add(handler)
    return () => userScrollHandlers.delete(handler)
  }

  onMounted(() => {
    container = getScrollContainer()
    if (!container) return
    // The document scroller's scroll events, and the wheel/touch input that
    // drives it, all arrive at the window.
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('scrollend', onScrollEnd)
    window.addEventListener('wheel', emitUserScroll, { passive: true })
    window.addEventListener('touchmove', emitUserScroll, { passive: true })
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', refresh)
    if (typeof ResizeObserver !== 'undefined' && listRoot.value) {
      resizeObserver = new ResizeObserver(refresh)
      resizeObserver.observe(listRoot.value)
    }
    refresh()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('scrollend', onScrollEnd)
    clearTimeout(programmaticTimer)
    window.removeEventListener('wheel', emitUserScroll)
    window.removeEventListener('touchmove', emitUserScroll)
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', refresh)
    resizeObserver?.disconnect()
    if (frame) cancelAnimationFrame(frame)
    if (measureFrame) cancelAnimationFrame(measureFrame)
    userScrollHandlers.clear()
  })

  return { index, t, progress, lineY, refresh, refreshNow, scrollToIndex, scrollToPosition, onUserScroll }
}
