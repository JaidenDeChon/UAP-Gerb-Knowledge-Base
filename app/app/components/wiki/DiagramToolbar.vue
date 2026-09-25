<script setup lang="ts">
import { ChevronDown, Download, ExternalLink, Image, LoaderCircle, Maximize2 } from '@lucide/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The small control strip on a diagram's frame: an Expand button and a
 * Download split button (primary action + a menu arrow). Registered as
 * `WikiDiagramToolbar`. Stateless — the owner (`WikiDiagramFrame`) wires
 * the events to its dialog and to `useDiagramExport`, so any future diagram
 * can reuse the same strip.
 *
 * Expand is hidden below `sm` (640px): on a phone the dialog would be no
 * bigger than the page the chart already fills.
 */
const props = withDefaults(defineProps<{
  /** What the diagram is, for the buttons' accessible names ("Expand org chart"). */
  label?: string
  /** Show the Expand button. */
  expandable?: boolean
  /** An export is rendering: spin the icon and lock the controls. */
  busy?: boolean
}>(), {
  label: 'diagram',
  expandable: true,
  busy: false,
})

const emit = defineEmits<{
  expand: []
  download: []
  view: []
}>()
</script>

<template>
  <div class="ufo-diagram-tools" role="group" :aria-label="`${props.label} tools`">
    <button
      v-if="props.expandable"
      type="button"
      class="ufo-diagram-btn ufo-diagram-btn--expand"
      :aria-label="`Expand ${props.label}`"
      title="View the whole chart in a larger window"
      @click="emit('expand')"
    >
      <Maximize2 class="size-3.5" aria-hidden="true" />
      <span>Expand</span>
    </button>

    <div class="ufo-diagram-split">
      <button
        type="button"
        class="ufo-diagram-btn ufo-diagram-split-main"
        :disabled="props.busy"
        :aria-label="`Download the ${props.label} as a PNG image`"
        @click="emit('download')"
      >
        <LoaderCircle v-if="props.busy" class="size-3.5 animate-spin" aria-hidden="true" />
        <Download v-else class="size-3.5" aria-hidden="true" />
        <span>Download</span>
      </button>
      <DropdownMenu :modal="false">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="ufo-diagram-btn ufo-diagram-btn--icon ufo-diagram-split-arrow"
            :disabled="props.busy"
            aria-label="More download options"
          >
            <ChevronDown class="size-3.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" :side-offset="6" class="ufo-diagram-menu min-w-[11rem] border-border">
          <DropdownMenuItem @select="emit('download')">
            <Image aria-hidden="true" />
            Download image
          </DropdownMenuItem>
          <DropdownMenuItem @select="emit('view')">
            <ExternalLink aria-hidden="true" />
            Open image in new tab
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <span class="sr-only" aria-live="polite">{{ props.busy ? 'Preparing the image…' : '' }}</span>
  </div>
</template>

<style scoped>
.ufo-diagram-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

/* Same small-control language as the timeline's chronometer buttons
   (TimelineChronometer.vue's .ufo-chrono-btn): 26px, mono caps, hairline
   border, primary-tinted icon. All colours are theme tokens. */
.ufo-diagram-btn {
  display: inline-flex;
  align-items: center;
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
.ufo-diagram-btn:hover:not(:disabled),
.ufo-diagram-btn[data-state='open'] {
  border-color: hsl(var(--primary));
}
/* The focus ring itself is the global `:focus-visible` box-shadow
   (main.css); lift the focused half of the split button so its ring isn't
   hidden under its neighbour. */
.ufo-diagram-btn:focus-visible {
  position: relative;
  z-index: 2;
}
.ufo-diagram-btn:disabled {
  cursor: progress;
  opacity: 0.7;
}
.ufo-diagram-btn :deep(svg) {
  color: hsl(var(--primary));
}
.ufo-diagram-btn--icon {
  width: 24px;
  padding: 0;
  justify-content: center;
}

/* Split button: two buttons sharing one outline. The arrow overlaps the main
   button by 1px so the seam is a single hairline, and a hovered or open half
   is lifted so its primary-coloured edge draws over its neighbour's. */
.ufo-diagram-split {
  display: inline-flex;
}
.ufo-diagram-split-main {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.ufo-diagram-split-arrow {
  margin-left: -1px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.ufo-diagram-split > .ufo-diagram-btn:hover:not(:disabled),
.ufo-diagram-split .ufo-diagram-btn[data-state='open'] {
  position: relative;
  z-index: 1;
}

/* Hidden on phones — see the script comment. */
.ufo-diagram-btn--expand {
  display: none;
}
@media (min-width: 640px) {
  .ufo-diagram-btn--expand {
    display: inline-flex;
  }
}
</style>
