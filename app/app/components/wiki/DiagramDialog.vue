<script setup lang="ts">
import { Maximize, Scan, X } from '@lucide/vue'
import { useResizeObserver } from '@vueuse/core'
import { DialogClose, DialogDescription } from 'reka-ui'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { fitScale } from '@/utils/diagramExport'

/**
 * Near-fullscreen view of a diagram (registered as `WikiDiagramDialog`).
 * The diagram is scaled down to fit the window — never up, and never below
 * 40%; past that it keeps 40% and the viewer scrolls or drag-pans. A toggle
 * switches between "fit" and actual size. Esc, the backdrop and the close
 * button all dismiss it; reka-ui's Dialog traps focus inside and hands it
 * back to the Expand button afterwards.
 */
const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  title: string
  /** One line under the title (e.g. the chart's caption). */
  description?: string
}>()

const viewport = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const fit = ref(true)

const natural = reactive({ width: 0, height: 0 })
const avail = reactive({ width: 0, height: 0 })
/** Breathing room kept around a fitted diagram, in CSS px. */
const GUTTER = 48

useResizeObserver(content, () => {
  natural.width = content.value?.offsetWidth ?? 0
  natural.height = content.value?.offsetHeight ?? 0
})
useResizeObserver(viewport, () => {
  avail.width = viewport.value?.clientWidth ?? 0
  avail.height = viewport.value?.clientHeight ?? 0
})

const scale = computed(() => fit.value
  ? fitScale(natural.width, natural.height, avail.width - GUTTER, avail.height - GUTTER)
  : 1)
const canFit = computed(() =>
  fitScale(natural.width, natural.height, avail.width - GUTTER, avail.height - GUTTER) < 1)

/*
 * Land focus on the scrollable chart rather than the first header button,
 * so arrow keys pan straight away and no toolbar button looks pre-selected.
 */
function onOpenAutoFocus(e: Event): void {
  e.preventDefault()
  viewport.value?.focus({ preventScroll: true })
}

watch(open, (value) => {
  if (value) fit.value = true
})

/*
 * Drag-to-pan with a mouse. Touch and pen already pan natively via overflow
 * scrolling; a press on a link or button is left alone so entity links in
 * the chart still work.
 */
let drag: { x: number, y: number, left: number, top: number, id: number } | null = null
const panning = ref(false)

function onPointerDown(e: PointerEvent): void {
  const el = viewport.value
  if (!el || e.pointerType !== 'mouse' || e.button !== 0) return
  if ((e.target as Element | null)?.closest('a, button, [role="button"]')) return
  if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return
  drag = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId }
}
function onPointerMove(e: PointerEvent): void {
  const el = viewport.value
  if (!el || !drag || e.pointerId !== drag.id) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!panning.value && Math.hypot(dx, dy) < 4) return
  if (!panning.value) {
    panning.value = true
    el.setPointerCapture(e.pointerId)
  }
  el.scrollLeft = drag.left - dx
  el.scrollTop = drag.top - dy
}
function onPointerUp(e: PointerEvent): void {
  if (drag && e.pointerId === drag.id && viewport.value?.hasPointerCapture(e.pointerId))
    viewport.value.releasePointerCapture(e.pointerId)
  drag = null
  panning.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent
      :show-close-button="false"
      @open-auto-focus="onOpenAutoFocus"
      class="ufo-diagram-dialog flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 p-0 sm:max-w-none"
    >
      <header class="ufo-diagram-dialog-head">
        <div class="min-w-0 flex-1">
          <DialogTitle class="ufo-diagram-dialog-title">
            {{ props.title }}
          </DialogTitle>
          <DialogDescription :class="props.description ? 'ufo-diagram-dialog-desc' : 'sr-only'">
            {{ props.description || 'Scroll or drag to move around the chart.' }}
          </DialogDescription>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <button
            v-if="canFit"
            type="button"
            class="ufo-diagram-dialog-btn"
            :aria-pressed="!fit"
            :title="fit ? 'Show at actual size' : 'Fit to window'"
            @click="fit = !fit"
          >
            <Maximize v-if="fit" class="size-3.5" aria-hidden="true" />
            <Scan v-else class="size-3.5" aria-hidden="true" />
            <span>{{ fit ? '100%' : 'Fit' }}</span>
          </button>
          <slot name="tools" />
          <DialogClose class="ufo-diagram-dialog-btn ufo-diagram-dialog-btn--icon" aria-label="Close">
            <X class="size-4" aria-hidden="true" />
          </DialogClose>
        </div>
      </header>

      <div
        ref="viewport"
        tabindex="0"
        role="region"
        :aria-label="`${props.title}, scrollable`"
        class="ufo-diagram-dialog-viewport"
        :class="{ 'is-panning': panning }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <!-- The sizer takes the diagram's scaled footprint so the scroll area
             matches what's painted; `margin: auto` in a flex parent centres it
             when it fits and pins it top-left (fully scrollable) when not. -->
        <div
          class="ufo-diagram-dialog-sizer"
          :style="{ width: `${natural.width * scale}px`, height: `${natural.height * scale}px` }"
        >
          <div ref="content" class="ufo-diagram-dialog-content" :style="{ transform: `scale(${scale})` }">
            <slot />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.ufo-diagram-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px 12px 20px;
  border-bottom: 1px solid hsl(var(--border));
}
.ufo-diagram-dialog-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
}
.ufo-diagram-dialog-desc {
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}
/* Same look as WikiDiagramToolbar's buttons. */
.ufo-diagram-dialog-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  background: hsl(var(--card) / 0.6);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-standard);
}
.ufo-diagram-dialog-btn:hover {
  border-color: hsl(var(--primary));
}
.ufo-diagram-dialog-btn :deep(svg) {
  color: hsl(var(--primary));
}
.ufo-diagram-dialog-btn--icon {
  width: 26px;
  padding: 0;
}
.ufo-diagram-dialog-btn--icon :deep(svg) {
  color: hsl(var(--foreground));
}

.ufo-diagram-dialog-viewport {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 24px;
}
.ufo-diagram-dialog-viewport:focus-visible {
  box-shadow: inset 0 0 0 2px hsl(var(--ring));
}
.ufo-diagram-dialog-viewport.is-panning {
  cursor: grabbing;
  user-select: none;
}
.ufo-diagram-dialog-sizer {
  position: relative;
  flex: none;
  margin: auto;
}
.ufo-diagram-dialog-content {
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
  transform-origin: 0 0;
}
</style>
