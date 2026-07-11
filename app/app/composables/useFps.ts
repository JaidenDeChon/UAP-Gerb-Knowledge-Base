/**
 * Rolling frames-per-second readout for the map-lab HUD. Counts
 * requestAnimationFrame callbacks over ~500 ms windows, which tracks how
 * smoothly the page could animate — main-thread jank (layout, long tasks,
 * renderer work) drags it below the display's refresh rate.
 */
export function useFps() {
  const fps = shallowRef(0)
  let raf = 0

  onMounted(() => {
    let frames = 0
    let windowStart = performance.now()
    const loop = (now: number): void => {
      frames++
      const elapsed = now - windowStart
      if (elapsed >= 500) {
        fps.value = Math.round((frames * 1000) / elapsed)
        frames = 0
        windowStart = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  })

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
  })

  return fps
}
