<script setup lang="ts">
import type { Component } from 'vue'
import { CircleCheck, Info, Lightbulb, Pencil, TriangleAlert } from '@lucide/vue'

/**
 * Obsidian-style callout, primary-themed: solid primary border, subtle
 * primary-tinted background, mono uppercase title row like the app's other
 * panel headers. Vault markdown reaches this via the beforeParse hook, which
 * rewrites `> [!type] Title` blockquotes into `::wiki-callout` MDC blocks
 * (see wiki/vault.ts).
 */
const props = withDefaults(defineProps<{ type?: string, title?: string }>(), {
  type: 'info',
  title: '',
})

const ICONS: Record<string, Component> = {
  info: Info,
  note: Pencil,
  tip: Lightbulb,
  hint: Lightbulb,
  warning: TriangleAlert,
  caution: TriangleAlert,
  success: CircleCheck,
  check: CircleCheck,
}

const icon = computed<Component>(() => ICONS[props.type] ?? Info)
</script>

<template>
  <aside class="ufo-callout my-6 rounded-lg border border-primary/70 bg-primary/10 px-4 py-3.5">
    <div v-if="props.title" class="mb-1.5 flex items-center gap-2 text-primary">
      <component :is="icon" class="size-4 shrink-0" />
      <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">{{ props.title }}</span>
    </div>
    <div class="callout-body font-sans text-[15px] leading-6 text-foreground">
      <slot />
    </div>
  </aside>
</template>

<style scoped>
/* The page-level prose styles (`.wiki-prose :deep(p) { @apply my-5 }`) are
   scoped-unlayered too and would pad the callout out; this selector out-ranks
   them on specificity so the body sits tight inside the frame. */
.ufo-callout .callout-body :deep(p) {
  margin-block: 0;
}
.ufo-callout .callout-body :deep(p + p) {
  margin-block-start: 0.5rem;
}
</style>
