import type { MaybeRefOrGetter } from 'vue'
import { useElementSize } from '@vueuse/core'
import { layoutMosaic, mosaicColumns } from '@/utils/mosaic'

/**
 * A mosaic of cards of uneven height (a card with a portrait stands much
 * taller than one without), shared by `::wiki-roster` and the home page's
 * Most referenced section.
 *
 * Wherever there's room for more than one column, the cards are placed by
 * `layoutMosaic` so the columns end as level as they can, and the section
 * after the cards isn't pushed down by one long column. Until the cards are
 * measured (and on the server) the caller shows a plain grid whose columns
 * are the same width (its CSS must match `minColumn` and `gap`), so measuring
 * there gives the same heights.
 *
 * Bind `root` to the container and `setCard(i, el)` as each card's function
 * ref (a `v-for` ref array isn't guaranteed to follow source order). Apply
 * `cardStyle(i)` to each card, `height` to the container while `layout` is
 * set, and hide the cards while `pending`.
 */
export function useMosaic(
  count: MaybeRefOrGetter<number>,
  options: { gap: number, minColumn: number, maxColumns?: number, ready?: MaybeRefOrGetter<boolean> },
) {
  const { gap, minColumn, maxColumns = 3 } = options
  const ready = computed(() => toValue(options.ready ?? true))

  const root = ref<HTMLElement | null>(null)
  const { width } = useElementSize(root)
  const columns = computed(() => mosaicColumns(width.value, minColumn, gap, maxColumns))

  const cardEls: Array<HTMLElement | null> = []
  const heights = ref<number[]>([])

  function measure(): void {
    const next = Array.from({ length: toValue(count) }, (_, i) => cardEls[i]?.offsetHeight ?? 0)
    if (next.some((h, i) => h !== heights.value[i]) || next.length !== heights.value.length)
      heights.value = next
  }

  let observer: ResizeObserver | undefined
  function setCard(i: number, el: unknown): void {
    const prev = cardEls[i]
    const next = el instanceof HTMLElement ? el : null
    if (prev === next) return
    if (prev) observer?.unobserve(prev)
    cardEls[i] = next
    if (next) observer?.observe(next)
  }

  onMounted(() => {
    observer = new ResizeObserver(measure)
    for (const el of cardEls) if (el) observer.observe(el)
    measure()
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(() => toValue(count), (n) => {
    cardEls.length = n
    nextTick(measure)
  })

  const layout = computed(() => {
    if (columns.value < 2 || !ready.value) return null
    const h = heights.value
    if (h.length !== toValue(count) || h.some(v => !v)) return null
    return layoutMosaic(h, columns.value, gap)
  })

  /** One column's width, as a CSS length (the gaps come out of the whole). */
  const columnWidth = computed(() =>
    `((100% - ${(columns.value - 1) * gap}px) / ${columns.value})`)

  function cardStyle(i: number): Record<string, string> | undefined {
    const item = layout.value?.items[i]
    if (!item) return undefined
    return {
      position: 'absolute',
      top: `${item.top}px`,
      left: `calc(${item.column} * (${columnWidth.value} + ${gap}px))`,
      width: `calc(${columnWidth.value})`,
    }
  }

  /** Hold the cards back until they're ready and, in a mosaic, placed. */
  const pending = computed(() =>
    !ready.value || !width.value || (columns.value > 1 && !layout.value))

  return { root, columns, layout, cardStyle, setCard, measure, pending }
}
