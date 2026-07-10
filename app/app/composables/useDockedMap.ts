import { computed } from 'vue'
import { clamp } from '~/utils/graph'

/** Placement of the docked local map, relative to its positioning container. */
export interface MapBox {
  /** Left/top offset in px. `null` means "not placed yet" → anchor bottom-right. */
  x: number | null
  y: number | null
  w: number
  h: number
}

const MIN_W = 220
const MIN_H = 180
const MARGIN = 8
const INSET = 20

/** Which edges a resize gesture drags. `top-right` is intentionally unsupported. */
export type ResizeCorner = 'top-left' | 'bottom-left' | 'bottom-right'
const CORNER: Record<ResizeCorner, { top: boolean, left: boolean }> = {
  'top-left': { top: true, left: true },
  'bottom-left': { top: false, left: true },
  'bottom-right': { top: false, left: false },
}

/**
 * Drag-to-move / drag-to-resize behaviour for the docked local map.
 *
 * Position + size live in `useState` so they survive article navigation (the
 * layout stays mounted, but this also outlasts a layout remount). Both handles
 * share one pointer gesture: the header moves the frame, the corner grip resizes
 * it. Everything is clamped inside `container` so the frame can't be dragged off
 * screen or grown past the content area.
 */
export function useDockedMap(container: () => HTMLElement | null) {
  const box = useState<MapBox>('shell:mapbox', () => ({ x: null, y: null, w: 300, h: 257 }))

  const style = computed(() => {
    const b = box.value
    if (b.x == null || b.y == null) {
      return { right: `${INSET}px`, bottom: `${INSET}px`, width: `${b.w}px`, height: `${b.h}px` }
    }
    return { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` }
  })

  function bounds(): { cw: number, ch: number } {
    const r = container()?.getBoundingClientRect()
    return { cw: r?.width ?? 0, ch: r?.height ?? 0 }
  }

  // Keep the frame inside its container and resolve a not-yet-placed frame's
  // bottom-right anchor to concrete coordinates. Safe to call repeatedly.
  function settle(): void {
    const { cw, ch } = bounds()
    if (cw === 0 || ch === 0) return
    const w = clamp(box.value.w, MIN_W, Math.max(MIN_W, cw - 2 * MARGIN))
    const h = clamp(box.value.h, MIN_H, Math.max(MIN_H, ch - 2 * MARGIN))
    let { x, y } = box.value
    if (x == null || y == null) {
      x = cw - w - INSET
      y = ch - h - INSET
    }
    x = clamp(x, MARGIN, Math.max(MARGIN, cw - w - MARGIN))
    y = clamp(y, MARGIN, Math.max(MARGIN, ch - h - MARGIN))
    box.value = { x, y, w, h }
  }

  let mode: 'move' | 'resize' | null = null
  let edge = { top: false, left: false }
  let sx = 0
  let sy = 0
  let start: MapBox = { x: 0, y: 0, w: 0, h: 0 }

  function begin(e: PointerEvent, m: 'move' | 'resize', corner?: ResizeCorner): void {
    // A click on a header button must not turn into a drag.
    if (m === 'move' && (e.target as HTMLElement).closest('button')) return
    settle() // resolve the default corner to real x/y before we move from it
    mode = m
    if (corner) edge = CORNER[corner]
    sx = e.clientX
    sy = e.clientY
    start = { ...box.value }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  function move(e: PointerEvent): void {
    if (!mode) return
    const dx = e.clientX - sx
    const dy = e.clientY - sy
    const { cw, ch } = bounds()
    const startX = start.x ?? 0
    const startY = start.y ?? 0

    if (mode === 'move') {
      const x = clamp(startX + dx, MARGIN, Math.max(MARGIN, cw - box.value.w - MARGIN))
      const y = clamp(startY + dy, MARGIN, Math.max(MARGIN, ch - box.value.h - MARGIN))
      box.value = { ...box.value, x, y }
      return
    }

    // Resize: the edge opposite the grabbed corner stays pinned.
    const right = startX + start.w
    const bottom = startY + start.h
    let x = startX
    let y = startY
    let w = start.w
    let h = start.h
    if (edge.left) {
      x = clamp(startX + dx, MARGIN, right - MIN_W)
      w = right - x
    }
    else {
      w = clamp(start.w + dx, MIN_W, Math.max(MIN_W, cw - MARGIN - startX))
    }
    if (edge.top) {
      y = clamp(startY + dy, MARGIN, bottom - MIN_H)
      h = bottom - y
    }
    else {
      h = clamp(start.h + dy, MIN_H, Math.max(MIN_H, ch - MARGIN - startY))
    }
    box.value = { x, y, w, h }
  }

  function end(e: PointerEvent): void {
    if (!mode) return
    mode = null
    const el = e.currentTarget as HTMLElement
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }

  return { box, style, settle, begin, move, end }
}
