<script setup lang="ts">
import { getScrollContainer } from '@/composables/useScrollRestore'

/**
 * A 2px reading-progress line pinned just under the top bar.
 * Progress is the container's scrollTop over its scrollable range, updated
 * at most once per frame from a passive scroll listener. Purely
 * informational, so it stays under `prefers-reduced-motion` — nothing here
 * animates; the bar only ever reflects where the reader already is.
 */
const root = ref<HTMLElement | null>(null)
const progress = ref(0)
// While the timeline's chronometer is pinned, it has its own animated ruler,
// so this line dims rather than competing with it. It stays visible so the
// reader keeps their place in the page as a whole.
const chronometerPinned = useState<boolean>('ufo:chronometerPinned', () => false)

let container: HTMLElement | null = null
let frame = 0

function measure(): void {
  frame = 0
  if (!container) return
  const range = container.scrollHeight - container.clientHeight
  progress.value = range > 0 ? Math.min(1, Math.max(0, container.scrollTop / range)) : 0
}
function onScroll(): void {
  if (!frame) frame = requestAnimationFrame(measure)
}

onMounted(() => {
  container = getScrollContainer()
  if (!container) return
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  measure()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <div ref="root" class="ufo-progress" :class="{ 'is-dimmed': chronometerPinned }" aria-hidden="true">
    <div class="ufo-progress-bar" :style="{ transform: `scaleX(${progress})` }" />
  </div>
</template>

<style scoped>
.ufo-progress {
  position: sticky;
  /* SCROLL_INSET_TOP: the document scrolls under the sticky h-14 top bar. */
  top: 56px;
  /* Above the timeline's sticky axis (10), below the top bar and dock (40). */
  z-index: 30;
  height: 0;
  pointer-events: none;
}
.ufo-progress.is-dimmed .ufo-progress-bar {
  opacity: 0.3;
  box-shadow: none;
}
.ufo-progress-bar {
  transition:
    opacity var(--dur-base) var(--ease-standard),
    box-shadow var(--dur-base) var(--ease-standard);
  height: 2px;
  width: 100%;
  transform-origin: left;
  background: hsl(var(--primary));
  box-shadow: 0 0 8px hsl(var(--primary) / 0.6);
  will-change: transform;
}
</style>
