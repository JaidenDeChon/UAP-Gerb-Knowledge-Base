<script setup lang="ts">
import type { Component } from 'vue'
import { CircleCheck, History, Info, Lightbulb, Pencil, TriangleAlert } from '@lucide/vue'

/**
 * Obsidian-style callout, primary-themed: solid primary border, subtle
 * primary-tinted background, mono uppercase title row like the app's other
 * panel headers. Vault markdown reaches this via the beforeParse hook, which
 * rewrites `> [!type] Title` blockquotes into `::wiki-callout` MDC blocks
 * (see wiki/vault.ts).
 *
 * `edit` is the editorial-change card that sits under a paragraph whose
 * facts were corrected or re-attributed (`> [!edit] Corrected 16 October
 * 2026`). It takes a muted frame and smaller type so it reads as a note on
 * the paragraph above, not as part of the article.
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
  edit: History,
}

const icon = computed<Component>(() => ICONS[props.type] ?? Info)
const isEdit = computed(() => props.type === 'edit')
</script>

<template>
  <aside
    class="ufo-callout rounded-lg border"
    :class="isEdit
      ? '-mt-2 mb-6 border-dashed border-border bg-muted/40 px-3.5 py-2.5'
      : 'my-6 border-primary/70 bg-primary/10 px-4 py-3.5'"
    :aria-label="isEdit ? (props.title || 'Edit note') : undefined"
  >
    <div v-if="props.title" class="mb-1.5 flex items-center gap-2" :class="isEdit ? 'text-muted-foreground' : 'text-primary'">
      <component :is="icon" class="size-4 shrink-0" />
      <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">{{ props.title }}</span>
    </div>
    <div
      class="callout-body font-sans"
      :class="isEdit ? 'text-[13px] leading-5 text-muted-foreground' : 'text-[15px] leading-6 text-foreground'"
    >
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
