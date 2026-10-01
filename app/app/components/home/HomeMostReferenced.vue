<script setup lang="ts">
import type { Component } from 'vue'
import type { Category, TopEntries, TopEntry } from '#shared/types/wiki'
import { Atom, Building2, CalendarClock, Crosshair, FileText, MapPin, Users } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { CATEGORY_LABEL, categoryMark } from '@/utils/category'
import { portraitAlt, portraitCredit } from '@/utils/portrait'

/**
 * "Most referenced": the entries the rest of the wiki links to most, one
 * kind at a time (People, Organizations, Operations, Events, Locations,
 * Concepts). Cards follow `::wiki-roster`'s look (a person's whole portrait
 * across the top, eased into the card) plus the lead and a meter of how many
 * entries link in. Cards with and without a portrait differ in height, so
 * where two or more columns fit they're packed as a mosaic (useMosaic) that
 * takes the least height it can; on a phone they're a swipeable carousel. Served from the baked link graph (`/api/top`), so it updates with
 * every build and needs no authoring.
 */
const PER = 6

const { data, status } = useFetch<TopEntries>('/api/top', {
  key: 'home-top',
  query: { per: PER },
  lazy: true,
})

// Part of the home page: it doesn't show until the lists have loaded.
usePageReady(() => status.value === 'success' || status.value === 'error')

const groups = computed(() => data.value ?? [])
const active = ref<Category>('People')
const current = computed(() =>
  groups.value.find(g => g.category === active.value) ?? groups.value[0])
const entries = computed(() => current.value?.entries ?? [])
const max = computed(() => Math.max(1, ...entries.value.map(e => e.links)))

// Same numbers as the fallback grid's CSS (538px and 812px containers).
const { root, layout, cardStyle, setCard, pending } = useMosaic(
  () => entries.value.length,
  { gap: 10, minColumn: 264, ready: () => status.value === 'success' },
)

const ICONS: Partial<Record<Category, Component>> = {
  People: Users,
  Organizations: Building2,
  Operations: Crosshair,
  Events: CalendarClock,
  Locations: MapPin,
  Concepts: Atom,
}
const iconFor = (category: Category): Component => ICONS[category] ?? FileText

/** "Linked from 124 entries, 36 of them videos". */
function counts(entry: TopEntry): string {
  if (entry.videos === entry.links) return `Linked from ${entry.links} ${entry.links === 1 ? 'video' : 'videos'}`
  const links = `Linked from ${entry.links} ${entry.links === 1 ? 'entry' : 'entries'}`
  return entry.videos ? `${links}, ${entry.videos} of them ${entry.videos === 1 ? 'a video' : 'videos'}` : links
}
</script>

<template>
  <section v-if="groups.length" class="@container my-10" aria-labelledby="most-referenced-heading">
    <div class="mb-3.5 flex items-center gap-2.5">
      <span class="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
      <h2 id="most-referenced-heading" class="whitespace-nowrap font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
        Most referenced
      </h2>
      <span class="h-px flex-1 bg-border" />
    </div>

    <div class="ufo-top-tabs" role="group" aria-label="Choose what kind of entry to show">
      <button
        v-for="group in groups"
        :key="group.category"
        type="button"
        class="ufo-top-tab"
        :aria-pressed="current?.category === group.category"
        @click="active = group.category"
      >
        <component :is="iconFor(group.category)" class="ufo-top-tab-icon" :style="{ color: categoryMark(group.category) }" aria-hidden="true" />
        {{ CATEGORY_LABEL[group.category] }}
      </button>
    </div>

    <ol
      v-if="current"
      ref="root"
      class="ufo-top-grid"
      :class="{ 'is-pending': pending, 'is-mosaic': layout }"
      :style="layout ? { height: `${layout.height}px` } : undefined"
      :aria-label="`Most referenced ${CATEGORY_LABEL[current.category].toLowerCase()}`"
    >
      <li
        v-for="(entry, i) in entries"
        :key="entry.path"
        :ref="el => setCard(i, el)"
        class="ufo-top-item"
        :style="cardStyle(i)"
      >
        <NuxtLink :to="entry.path" class="ufo-top-card" :class="{ 'has-portrait': entry.image }">
          <!-- ::wiki-roster's card: the whole portrait across the top at its
               own shape, eased into the card, with the text on its faded foot. -->
          <img
            v-if="entry.image"
            :src="entry.image.src"
            :width="entry.image.width"
            :height="entry.image.height"
            :alt="portraitAlt(entry.title)"
            :title="portraitCredit(entry.image)"
            loading="lazy"
            decoding="async"
            class="ufo-top-portrait ufo-fade"
          >
          <div class="ufo-top-content">
            <div class="flex items-center justify-between gap-2">
              <Badge variant="outline" class="bg-card/70">
                <component :is="iconFor(entry.category)" aria-hidden="true" />
                {{ CATEGORY_LABEL[entry.category] }}
              </Badge>
              <span class="ufo-top-rank" aria-hidden="true">#{{ i + 1 }}</span>
            </div>
            <h3 class="ufo-top-title">
              {{ entry.title }}
            </h3>
            <p v-if="entry.lead" class="ufo-top-lead">
              {{ entry.lead }}
            </p>
            <div class="ufo-top-meter-row">
              <span class="ufo-top-meter" aria-hidden="true">
                <span class="ufo-top-fill" :style="{ width: `${(entry.links / max) * 100}%`, background: categoryMark(entry.category) }" />
              </span>
              <span class="ufo-top-count">{{ counts(entry) }}</span>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ol>
  </section>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.ufo-top-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
/* The same small control as the People page's filters and the timeline's chips. */
.ufo-top-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--card));
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.ufo-top-tab:hover {
  color: hsl(var(--foreground));
}
.ufo-top-tab[aria-pressed="true"] {
  border-color: hsl(var(--primary));
  color: hsl(var(--foreground));
}
.ufo-top-tab:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-top-tab-icon {
  width: 13px;
  height: 13px;
}

/* Phone: a swipeable carousel bleeding to the page gutters, as the
   "Recently processed" strip does. From 538px (two 264px columns and the
   gap, useMosaic's numbers) a grid, which useMosaic then packs as a mosaic
   once it has measured the cards. */
.ufo-top-grid {
  @apply -mx-8 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-px-8 px-8 pb-1;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.ufo-top-grid::-webkit-scrollbar {
  display: none;
}
.ufo-top-item {
  @apply w-[78%] max-w-[300px] shrink-0 snap-start;
  transition: opacity var(--dur-base) var(--ease-standard);
}
@container (min-width: 538px) {
  .ufo-top-grid {
    @apply mx-0 grid grid-cols-2 items-start gap-2.5 overflow-visible px-0 pb-0;
  }
  .ufo-top-item {
    @apply w-auto max-w-none;
  }
  .ufo-top-grid.is-pending .ufo-top-item {
    opacity: 0;
  }
}
@container (min-width: 812px) {
  .ufo-top-grid {
    @apply grid-cols-3;
  }
}
.ufo-top-grid.is-mosaic {
  display: block;
  position: relative;
}
@media (prefers-reduced-motion: reduce) {
  .ufo-top-item {
    transition: none;
  }
}

.ufo-top-card {
  display: block;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.ufo-top-card:hover {
  border-color: hsl(var(--foreground) / 0.35);
}
.ufo-top-card:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-top-portrait {
  display: block;
  width: 100%;
  height: auto;
  --ufo-fade-y-start: 62%;
  -webkit-mask-image: var(--ufo-fade-y);
  mask-image: var(--ufo-fade-y);
}
.ufo-top-content {
  position: relative;
  padding: 12px 16px 14px;
}
.ufo-top-card.has-portrait .ufo-top-content {
  margin-top: -20px;
}
.ufo-top-rank {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}
.ufo-top-title {
  margin-top: 8px;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: hsl(var(--foreground));
}
.ufo-top-lead {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 20px;
  color: hsl(var(--muted-foreground));
}
.ufo-top-meter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.ufo-top-meter {
  position: relative;
  flex: none;
  width: 56px;
  height: 6px;
  overflow: hidden;
  border-radius: 9999px;
  background: hsl(var(--muted-foreground) / 0.15);
}
.ufo-top-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 9999px;
}
.ufo-top-count {
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 15px;
  color: hsl(var(--muted-foreground));
}
</style>
