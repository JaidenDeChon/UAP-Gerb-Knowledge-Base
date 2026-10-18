<script setup lang="ts">
import { ArrowRight, ScrollText } from '@lucide/vue'
import type { NoteDocument } from '#shared/types/wiki'

/**
 * The way into a document's transcription, set between the fact table and
 * the viewer on its page so a reader finds the readable text before the
 * scans. One link, whose whole card is the target; its accessible name is
 * the heading line, and the line under it is its description.
 */
const props = defineProps<{ document: NoteDocument }>()

const pages = computed(() => props.document.file?.pages)
const detail = computed(() => {
  const span = pages.value === 1 ? 'its page' : pages.value ? `all ${pages.value} pages` : 'every page'
  return `The full text as searchable, readable prose, checked against the scans of ${span}.`
})
</script>

<template>
  <NuxtLink
    v-if="document.transcription"
    :to="document.transcription"
    class="ufo-transcript-link"
    aria-describedby="ufo-transcript-link-detail"
  >
    <span class="ufo-transcript-badge" aria-hidden="true">
      <ScrollText class="ufo-transcript-icon" />
    </span>
    <span class="ufo-transcript-text">
      <span class="ufo-transcript-title">Read the transcription</span>
      <span id="ufo-transcript-link-detail" class="ufo-transcript-detail">{{ detail }}</span>
    </span>
    <ArrowRight class="ufo-transcript-arrow" aria-hidden="true" />
  </NuxtLink>
</template>

<style scoped>
.ufo-transcript-link {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  margin: 0 0 1rem;
  padding: 14px 16px;
  border: 1px solid hsl(var(--primary) / 0.45);
  border-radius: 8px;
  background: hsl(var(--primary) / 0.07);
  color: hsl(var(--foreground));
  text-decoration: none;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-transcript-link:hover {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.12);
}
.ufo-transcript-link:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-transcript-badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.ufo-transcript-icon {
  width: 20px;
  height: 20px;
}
.ufo-transcript-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ufo-transcript-title {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}
.ufo-transcript-detail {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-transcript-arrow {
  flex: none;
  width: 18px;
  height: 18px;
  color: hsl(var(--primary));
  transition: transform var(--dur-fast) var(--ease-standard);
}
.ufo-transcript-link:hover .ufo-transcript-arrow {
  transform: translateX(3px);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-transcript-link:hover .ufo-transcript-arrow {
    transform: none;
  }
}
</style>
