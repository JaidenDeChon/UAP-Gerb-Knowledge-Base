import type { Ref } from 'vue'
import type { Bounds } from '~/utils/graph'
import { clamp, fitView, MAX_ZOOM, MIN_ZOOM } from '~/utils/graph'

export interface MapCameraCallbacks {
  /** A click that wasn't a drag, in container-local px. */
  onTap?: (x: number, y: number) => void
  /** Pointer resting/moving over the map without dragging, or leaving (null). */
  onHover?: (pos: { x: number, y: number } | null) => void
}

/**
 * Pan/zoom camera + pointer interaction shared by the home-brew map-lab
 * renderers (Canvas 2D and Pixi). Screen = `pan + graph * k`. All updates are
 * coalesced to one commit per animation frame, matching the discipline of the
 * SVG map: drag-pan, wheel zoom about the cursor, two-finger pinch, and
 * tap-vs-drag discrimination (a <5 px pointer travel counts as a tap).
 *
 * The component owns rendering: watch `pan` / `k` / `size` and redraw.
 */
export function useMapCamera(containerRef: Ref<HTMLElement | null>, cb: MapCameraCallbacks = {}) {
  const pan = shallowRef({ x: 0, y: 0 })
  const k = shallowRef(1)
  const size = shallowRef({ w: 0, h: 0 })
  const grabbing = shallowRef(false)
  /** True once the user pans/zooms; auto-refit on resize stops until re-fit. */
  const userAdjusted = shallowRef(false)

  /* ------------------------------------------------------------- pointers -- */

  const pointers = new Map<number, { x: number, y: number }>()
  let travel = 0
  let lastX = 0
  let lastY = 0
  let pendingDx = 0
  let pendingDy = 0
  let panRaf = 0

  // Pinch: derived from the first two active pointers.
  let pinching = false
  let pinchDist0 = 0
  let pinchK0 = 1
  let pinchGX = 0 // graph point under the pinch midpoint, held fixed
  let pinchGY = 0

  function localPoint(e: PointerEvent | WheelEvent): { x: number, y: number } {
    const rect = containerRef.value?.getBoundingClientRect()
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: e.clientX, y: e.clientY }
  }

  function twoPointers(): [{ x: number, y: number }, { x: number, y: number }] | null {
    if (pointers.size < 2) return null
    const it = pointers.values()
    return [it.next().value!, it.next().value!]
  }

  function beginPinch(): void {
    const pts = twoPointers()
    if (!pts) return
    const rect = containerRef.value?.getBoundingClientRect()
    const ox = rect?.left ?? 0
    const oy = rect?.top ?? 0
    const mx = (pts[0].x + pts[1].x) / 2 - ox
    const my = (pts[0].y + pts[1].y) / 2 - oy
    pinchDist0 = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y))
    pinchK0 = k.value
    pinchGX = (mx - pan.value.x) / k.value
    pinchGY = (my - pan.value.y) / k.value
    pinching = true
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    if (pointers.size === 2) {
      beginPinch()
      travel = Infinity // a pinch is never a tap
    }
    else if (pointers.size === 1) {
      lastX = e.clientX
      lastY = e.clientY
      travel = 0
      grabbing.value = true
      cb.onHover?.(null)
    }
  }

  function onPointerMove(e: PointerEvent): void {
    const entry = pointers.get(e.pointerId)
    if (!entry) {
      // Not dragging — plain hover.
      if (pointers.size === 0) cb.onHover?.(localPoint(e))
      return
    }
    entry.x = e.clientX
    entry.y = e.clientY

    if (pinching) {
      const pts = twoPointers()
      if (!pts) return
      const rect = containerRef.value?.getBoundingClientRect()
      const ox = rect?.left ?? 0
      const oy = rect?.top ?? 0
      const mx = (pts[0].x + pts[1].x) / 2 - ox
      const my = (pts[0].y + pts[1].y) / 2 - oy
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y))
      const next = clamp(pinchK0 * (dist / pinchDist0), MIN_ZOOM, MAX_ZOOM)
      pan.value = { x: mx - pinchGX * next, y: my - pinchGY * next }
      k.value = next
      userAdjusted.value = true
      return
    }

    if (e.pointerId !== pointers.keys().next().value) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    travel += Math.abs(dx) + Math.abs(dy)
    pendingDx += dx
    pendingDy += dy
    if (panRaf) return
    panRaf = requestAnimationFrame(() => {
      panRaf = 0
      pan.value = { x: pan.value.x + pendingDx, y: pan.value.y + pendingDy }
      pendingDx = 0
      pendingDy = 0
      userAdjusted.value = true
    })
  }

  function onPointerUp(e: PointerEvent): void {
    if (!pointers.delete(e.pointerId)) return
    const el = e.currentTarget as Element
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (pointers.size < 2) pinching = false
    if (pointers.size === 1) {
      // Hand off the pan to the remaining finger without a jump.
      const rest = pointers.values().next().value!
      lastX = rest.x
      lastY = rest.y
    }
    if (pointers.size === 0) {
      grabbing.value = false
      if (travel < 5 && Number.isFinite(travel)) {
        const p = localPoint(e)
        cb.onTap?.(p.x, p.y)
      }
    }
  }

  function onPointerLeave(): void {
    if (pointers.size === 0) cb.onHover?.(null)
  }

  /* ---------------------------------------------------------------- wheel -- */

  let wheelRaf = 0
  let pendingFactor = 1
  let wheelX = 0
  let wheelY = 0

  function onWheel(e: WheelEvent): void {
    e.preventDefault()
    const p = localPoint(e)
    wheelX = p.x
    wheelY = p.y
    pendingFactor *= e.deltaY < 0 ? 1.1 : 0.9
    if (wheelRaf) return
    wheelRaf = requestAnimationFrame(() => {
      wheelRaf = 0
      const cur = k.value
      const next = clamp(cur * pendingFactor, MIN_ZOOM, MAX_ZOOM)
      pendingFactor = 1
      if (next === cur) return
      const gx = (wheelX - pan.value.x) / cur
      const gy = (wheelY - pan.value.y) / cur
      pan.value = { x: wheelX - gx * next, y: wheelY - gy * next }
      k.value = next
      userAdjusted.value = true
    })
  }

  /* ------------------------------------------------------------ fit + size -- */

  /**
   * Frame `bounds`. `ease` < 1 moves only that fraction of the way toward the
   * fit — callers re-fitting every frame (the map's settle) pass a small ease
   * so the camera glides instead of snapping as the bounds change.
   */
  function fitTo(bounds: Bounds, padding = 40, ease = 1): void {
    const { w, h } = size.value
    if (w <= 0 || h <= 0) return
    const v = fitView(bounds, w, h, padding)
    if (ease < 1) {
      pan.value = { x: pan.value.x + (v.x - pan.value.x) * ease, y: pan.value.y + (v.y - pan.value.y) * ease }
      k.value += (v.k - k.value) * ease
    }
    else {
      pan.value = { x: v.x, y: v.y }
      k.value = v.k
    }
    userAdjusted.value = false
  }

  let ro: ResizeObserver | null = null

  onMounted(() => {
    const el = containerRef.value
    if (!el) return
    const measure = (): void => {
      size.value = { w: el.clientWidth, h: el.clientHeight }
    }
    measure()
    ro = new ResizeObserver(measure)
    ro.observe(el)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    ro = null
    if (panRaf) cancelAnimationFrame(panRaf)
    if (wheelRaf) cancelAnimationFrame(wheelRaf)
  })

  return {
    pan,
    k,
    size,
    grabbing,
    userAdjusted,
    fitTo,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onWheel },
  }
}
