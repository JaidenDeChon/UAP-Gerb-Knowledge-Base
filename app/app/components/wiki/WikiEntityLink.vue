<script setup lang="ts">
import type { Component } from 'vue'
import {
  Atom,
  Building2,
  CalendarClock,
  Clapperboard,
  Compass,
  Crosshair,
  FileText,
  House,
  MapPin,
  Users,
} from '@lucide/vue'
import { CATEGORY_ICON, type NoteRef } from '#shared/types/wiki'
import { categoryBorder, categoryMark, categorySurface, categorySurfaceHover } from '@/utils/category'

const props = withDefaults(
  defineProps<{
    name: string
    refData?: NoteRef
    /**
     * `'chip'` (default): a category-coloured tag/pill — icon + name — so the
     * link reads as a tag rather than inline prose. Used by WikiTimeline's
     * entity-mention list and WikiRoster's card heading.
     *
     * `'inline'`: the original dot + underlined-name treatment. `WikiOrgChart`
     * uses this — its node is already tinted by this same entity's category
     * (surface + border, set by `OrgChartNode`), and the node is small
     * (132-220px). A second colour-coded pill nested inside an already-tinted
     * box, in a table-based chart where sibling geometry is width-sensitive,
     * reads as visual noise rather than a tag — so the node keeps the lighter
     * mark instead of gaining a second, redundant one.
     */
    variant?: 'chip' | 'inline'
  }>(),
  { variant: 'chip' },
)

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
 * Category is carried instead by a small full-strength mark (a dot in the
 * `inline` variant, an icon in the `chip` variant) with a hairline `--border`
 * ring so its shape reads even for the two hues (Concepts, Videos) whose mark
 * itself can't clear 3:1 against a light card — and it's never the only cue:
 * the entity's name is always plain legible text next to it.
 */
const mark = computed(() => props.refData ? categoryMark(props.refData.category) : undefined)
const border = computed(() => props.refData ? categoryBorder(props.refData.category) : undefined)
const surface = computed(() => props.refData ? categorySurface(props.refData.category) : undefined)
const surfaceHover = computed(() => props.refData ? categorySurfaceHover(props.refData.category) : undefined)

/** Glyph names `CATEGORY_ICON` can return -> the lucide component. Mirrors
 * the sidebar/command-palette's own `ICONS` map (see `AppSidebarTree.vue`,
 * `AppCommandPalette.vue`) so a category uses the same glyph everywhere. */
const ICONS: Record<string, Component> = {
  'house': House,
  'compass': Compass,
  'users': Users,
  'building-2': Building2,
  'crosshair': Crosshair,
  'calendar-clock': CalendarClock,
  'map-pin': MapPin,
  'atom': Atom,
  'clapperboard': Clapperboard,
}
const icon = computed<Component>(() =>
  props.refData ? (ICONS[CATEGORY_ICON[props.refData.category]] ?? FileText) : FileText)
</script>

<template>
  <NuxtLink
    v-if="props.refData && props.variant === 'chip'"
    :to="props.refData.path"
    data-wiki-link
    class="ufo-entity-chip"
    :style="{
      '--chip-mark': mark,
      '--chip-border': border,
      '--chip-surface': surface,
      '--chip-surface-hover': surfaceHover,
    }"
  >
    <span class="ufo-entity-chip-icon-wrap" aria-hidden="true">
      <component :is="icon" class="ufo-entity-chip-icon" />
    </span>
    <span class="ufo-entity-chip-name">{{ props.name }}</span>
  </NuxtLink>
  <NuxtLink
    v-else-if="props.refData"
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

/*
 * -- chip variant --
 *
 * RISK: alpha stacking. `--chip-surface` (categorySurface, 0.14 alpha) was
 * verified >= 4.5:1 for `--foreground` text over a PLAIN `--card` (see
 * category.ts). This chip renders on top of already-tinted ancestors —
 * WikiTimeline's `--entry-surface` (also 0.14 alpha) and WikiRoster's
 * `--card-surface` (same) — so a naive `background: var(--chip-surface)`
 * would composite two translucent layers and land darker/more saturated
 * than anything measured.
 *
 * Fix: give the chip an OPAQUE `--card` base of its own (`background-color`,
 * no alpha), then paint `--chip-surface` on top of that as a
 * `background-image` layer. `background-color` fully occludes whatever the
 * ancestor painted behind this element, so the chip's rendered background is
 * always exactly "0.14-alpha category over plain --card" — the identical
 * composite `categorySurface`'s own >= 4.5:1 guarantee already covers,
 * regardless of what card/tint the chip happens to sit on. No new stacking
 * math needed, and none was skipped: re-verified directly (script run
 * against this project's actual `--card`/`--foreground`/`--graph-cat-*`
 * tokens for all 4 themes) — worst case across all 8 categories is 8.62:1
 * (dim theme, videos), comfortably above the 4.5:1 floor in every theme.
 */
.ufo-entity-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--chip-border);
  border-radius: var(--radius-lg);
  padding: 2px 8px 2px 5px;
  background-color: hsl(var(--card));
  background-image: linear-gradient(var(--chip-surface), var(--chip-surface));
  color: hsl(var(--foreground));
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  text-decoration: none;
  transition: background-image var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.ufo-entity-chip:hover,
.ufo-entity-chip:focus-visible {
  background-image: linear-gradient(var(--chip-surface-hover), var(--chip-surface-hover));
  transform: translateY(-1px);
}
.ufo-entity-chip:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
/* Icon mark: full-strength category colour, with the same neutral hairline
   ring as the inline variant's dot — the chip's own border is
   category-coloured (near-full strength), which the videos hue in
   light/sepia still can't clear 3:1 against the card, so the icon needs its
   own independent hairline to stay legible as a shape either way. */
.ufo-entity-chip-icon-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid hsl(var(--border));
}
.ufo-entity-chip-icon {
  width: 10px;
  height: 10px;
  color: var(--chip-mark);
}

@media (prefers-reduced-motion: reduce) {
  .ufo-entity-link:hover .ufo-entity-dot {
    transform: none;
  }
  .ufo-entity-chip:hover,
  .ufo-entity-chip:focus-visible {
    transform: none;
  }
}
</style>
