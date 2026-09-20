<script setup lang="ts">
import { Info } from '@lucide/vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * `(i)` disclosure affordance for explanatory copy that would otherwise sit
 * directly on the page surface, competing with headings and data. Authors
 * write markdown inside the block:
 *
 *   ## Timeline
 *   ::wiki-info
 *   Entries are ordered by their earliest known date. Approximate dates
 *   are marked with a `~`.
 *   ::
 *
 * `label` sets the trigger's accessible name — override it when the default
 * is ambiguous with more than one `::wiki-info` on a page (e.g. two under
 * different headings both named "About this section").
 */
const props = withDefaults(defineProps<{ label?: string }>(), {
  label: 'About this section',
})
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button type="button" class="ufo-info-trigger" :aria-label="props.label">
        <Info class="size-3" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" :side-offset="6" class="ufo-info-content w-80 text-[13px] leading-5">
      <div class="wiki-info-body">
        <slot />
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
/* Sits inline beside a heading — small enough that it reads as an aside,
   not a competing control. */
.ufo-info-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  background: transparent;
  color: hsl(var(--muted-foreground));
  vertical-align: middle;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard);
}
.ufo-info-trigger:hover,
.ufo-info-trigger[data-state="open"] {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
}
.ufo-info-trigger:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

.wiki-info-body :deep(p) {
  margin-block: 0;
  color: hsl(var(--popover-foreground));
}
.wiki-info-body :deep(p + p) {
  margin-block-start: 0.5rem;
}
.wiki-info-body :deep(a) {
  color: hsl(var(--primary));
}
</style>
