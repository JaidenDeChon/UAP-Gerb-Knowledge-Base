<script setup lang="ts">
import type { NoteRef } from '#shared/types/wiki'
import { categoryMark } from '@/utils/category'

const props = defineProps<{ name: string, refData?: NoteRef }>()

/*
 * ACCESSIBILITY FIX (see design-foundation-report.md): 10 of 32
 * `--graph-cat-*` x theme combinations fail 4.5:1 as TEXT colour (as low as
 * 1.88:1 for sepia/videos). Category can no longer be the link's text fill.
 *
 * Text now uses `--foreground` — the one colour verified to clear 4.5:1
 * against every surface this link appears on (plain `--card`/`--background`
 * prose, and the tinted `--timeline-*` surfaces in WikiTimeline). `--primary`
 * (the site's other link convention) was measured and rejected: it's only
 * 3.29:1 against `--card` in the light theme, below the floor.
 *
 * Category is carried instead by a small full-strength dot mark before the
 * name, with a hairline `--border` ring so its shape reads even for the two
 * hues (Concepts, Videos) whose mark itself can't clear 3:1 against a light
 * card — and it's never the only cue: the entity's name is always plain
 * legible text next to it.
 */
const mark = computed(() => props.refData ? categoryMark(props.refData.category) : undefined)
</script>

<template>
  <NuxtLink
    v-if="props.refData"
    :to="props.refData.path"
    data-wiki-link
    class="ufo-entity-link"
  >
    <span class="ufo-entity-dot" :style="{ background: mark }" aria-hidden="true" />
    <span class="ufo-entity-name">{{ props.name }}</span>
  </NuxtLink>
  <span v-else>{{ props.name }}</span>
</template>

<style scoped>
/* Unlayered so it outranks the global `a[data-wiki-link]` primary tint in
   main.css — legibility here comes from `--foreground`, not the accent. */
.ufo-entity-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: hsl(var(--foreground));
  text-decoration: underline;
  text-decoration-color: hsl(var(--border));
  text-underline-offset: 3px;
  transition: text-decoration-color var(--dur-fast) var(--ease-standard);
}
.ufo-entity-link:hover,
.ufo-entity-link:focus-visible {
  text-decoration-color: hsl(var(--foreground));
}
.ufo-entity-link:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
  border-radius: 1px;
}

.ufo-entity-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  border: 1px solid hsl(var(--border));
  transition: transform var(--dur-fast) var(--ease-standard);
}
.ufo-entity-link:hover .ufo-entity-dot {
  transform: scale(1.25);
}
@media (prefers-reduced-motion: reduce) {
  .ufo-entity-link:hover .ufo-entity-dot { transform: none; }
}
</style>
