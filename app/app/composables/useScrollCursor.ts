import type { Ref } from 'vue'
import { cursorFor } from '@/utils/timeline'
import { getScrollContainer } from '@/composables/useScrollRestore'

export interface ScrollCursorOptions {
  /** CSS selector for the entries inside `listRoot`, in reading order. */
  itemSelector: string
  /** Where the "reading line" sits, as a fraction of the scroll container's height. */
  readingLine?: number
  /** Extra offset (px) to leave above an entry when scrolling to it — the pinned chronometer's height. */
  stickyOffset?: () => number
}

/**
 * The one scroll pass behind the timeline's reading cursor.
 *
 * Entry offsets are measured in a single batched read (on mount, on resize
 * of the list, and on demand via `refresh()`), never inside the scroll
 * handler. The container's `scroll` event — passive — schedules one rAF that
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

  function measure(): void {
    measureFrame = 0
    if (!container || !listRoot.value) return
    const containerTop = container.getBoundingClientRect().top
    const scrollTop = container.scrollTop
    const items = listRoot.value.querySelectorAll<HTMLElement>(opts.itemSelector)
    offsets = Array.from(items, el => el.getBoundingClientRect().top - containerTop + scrollTop)
    const rootRect = listRoot.value.getBoundingClientRect()
    listTop = rootRect.top - containerTop + scrollTop
    listBottom = listTop + rootRect.height
    compute()
  }

  function compute(): void {
    frame = 0
    if (!container) return
    const y = container.scrollTop + container.clientHeight * readingLine
    lineY.value = y
    const cursor = cursorFor(y, offsets)
    if (cursor.index !== index.value) index.value = cursor.index
    if (cursor.t !== t.value) t.value = cursor.t
    const span = listBottom - listTop
    const p = span > 0 ? Math.min(1, Math.max(0, (y - listTop) / span)) : 0
    if (p !== progress.value) progress.value = p
  }

  function onScroll(): void {
    if (!frame) frame = requestAnimationFrame(compute)
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
    container.scrollTo({ top: Math.max(0, top - (opts.stickyOffset?.() ?? 0) - 12), behavior })
  }

  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
  function emitUserScroll(): void {
    for (const handler of userScrollHandlers) handler()
  }
  function onKeydown(event: KeyboardEvent): void {
    if (SCROLL_KEYS.has(event.key)) emitUserScroll()
  }

  /** Subscribe to reader-initiated scrolling. Returns an unsubscribe. */
  function onUserScroll(handler: () => void): () => void {
    userScrollHandlers.add(handler)
    return () => userScrollHandlers.delete(handler)
  }

  onMounted(() => {
    container = getScrollContainer() ?? listRoot.value?.closest('main') ?? null
    if (!container) return
    container.addEventListener('scroll', onScroll, { passive: true })
    container.addEventListener('wheel', emitUserScroll, { passive: true })
    container.addEventListener('touchmove', emitUserScroll, { passive: true })
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('resize', refresh)
    if (typeof ResizeObserver !== 'undefined' && listRoot.value) {
      resizeObserver = new ResizeObserver(refresh)
      resizeObserver.observe(listRoot.value)
    }
    refresh()
  })

  onBeforeUnmount(() => {
    container?.removeEventListener('scroll', onScroll)
    container?.removeEventListener('wheel', emitUserScroll)
    container?.removeEventListener('touchmove', emitUserScroll)
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('resize', refresh)
    resizeObserver?.disconnect()
    if (frame) cancelAnimationFrame(frame)
    if (measureFrame) cancelAnimationFrame(measureFrame)
    userScrollHandlers.clear()
  })

  return { index, t, progress, lineY, refresh, refreshNow, scrollToIndex, onUserScroll }
}
