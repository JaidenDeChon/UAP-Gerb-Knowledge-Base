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
import { CATEGORY_ICON, type Category, type NotePortrait } from '#shared/types/wiki'
import { Badge } from '@/components/ui/badge'
import { portraitAlt, portraitCredit } from '@/utils/portrait'

interface Entry { name: string, role?: string, note?: string }

const props = withDefaults(defineProps<{ entries?: Entry[] }>(), { entries: () => [] })

const { refs, ready } = useWikiResolve(() => props.entries.map(e => e.name))

/** A person's portrait, when their page has one (see wiki/portraits.ts). */
function imageOf(name: string): NotePortrait | undefined {
  return refs.value.get(name.trim())?.image
}

function categoryOf(name: string): string {
  return refs.value.get(name.trim())?.category ?? 'No entry yet'
}

/** Mirrors the sidebar/command-palette's own `ICONS` map (see `AppSidebarTree.vue`). */
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

function iconFor(name: string): Component {
  const category = refs.value.get(name.trim())?.category as Category | undefined
  return category ? (ICONS[CATEGORY_ICON[category]] ?? FileText) : FileText
}

// -- Mosaic ------------------------------------------------------------------
// Cards with a portrait stand much taller than cards without, so wherever
// there's room for more than one column the roster is a mosaic (see
// useMosaic). The numbers match the fallback grid's CSS below. The cards are
// held back until the names resolve (a card that turns out to have a
// portrait grows by its photo band) and, in a mosaic, until they're placed.
const { root, layout, cardStyle, setCard, pending } = useMosaic(
  () => props.entries.length,
  { gap: 10, minColumn: 264, ready },
)
</script>

<template>
  <div v-if="props.entries.length" class="@container my-7">
    <div
      ref="root"
      class="ufo-roster"
      :class="{ 'is-pending': pending, 'is-mosaic': layout }"
      :style="layout ? { height: `${layout.height}px` } : undefined"
    >
      <article
        v-for="(entry, i) in props.entries"
        :key="entry.name"
        :ref="el => setCard(i, el)"
        class="ufo-roster-card overflow-hidden rounded-lg border border-border bg-card"
        :class="{ 'has-portrait': imageOf(entry.name) }"
        :style="cardStyle(i)"
      >
        <!-- The home page's Featured card in miniature (HomeFeatured.vue):
             the whole portrait sits across the top, eased down into the card
             through the shared `ufo-fade` mask, with the text pulled up onto
             its faded foot. Sized from its width/height attributes, so
             loading it never moves anything;
             the credit is its tooltip (and spelled out, linked, on the
             person's own page). -->
        <img
          v-if="imageOf(entry.name)"
          :src="imageOf(entry.name)?.src"
          :width="imageOf(entry.name)?.width"
          :height="imageOf(entry.name)?.height"
          :alt="portraitAlt(entry.name)"
          :title="portraitCredit(imageOf(entry.name)!)"
          loading="lazy"
          decoding="async"
          class="ufo-roster-portrait ufo-fade"
        >
        <div class="ufo-roster-content px-4 pb-3.5 pt-3">
          <Badge variant="outline" class="bg-card/70">
            <component :is="iconFor(entry.name)" aria-hidden="true" />
            {{ categoryOf(entry.name) }}
          </Badge>
          <h4 class="mt-2 font-display text-[17px] font-semibold leading-6">
            <WikiEntityLink :name="entry.name" :ref-data="refs.get(entry.name.trim())" />
          </h4>
          <p v-if="entry.role" class="mt-0.5 font-sans text-[13px] leading-5 text-muted-foreground">
            {{ entry.role }}
          </p>
          <p v-if="entry.note" class="mt-1.5 font-sans text-[14px] leading-6 text-foreground">
            {{ entry.note }}
          </p>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* The fallback grid: the same columns `mosaicColumns` picks (MIN_COLUMN and
   GAP in the script), so cards measure the same here as in the mosaic. Cards
   keep their own height (`align-items: start`) rather than stretching to
   their row's. */
.ufo-roster {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}
@container (min-width: 538px) {
  .ufo-roster { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (min-width: 812px) {
  .ufo-roster { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.ufo-roster.is-mosaic {
  display: block;
  position: relative;
}

/* Neutral, as the home page's cards: the card colour and a hairline border.
   The category is carried by the badge's icon and label. */
.ufo-roster-card {
  container: roster-card / inline-size;
  transition: opacity var(--dur-base) var(--ease-standard);
}
.ufo-roster.is-pending .ufo-roster-card {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ufo-roster-card {
    transition: none;
  }
}

/* The Featured card's narrow-layout band, but the whole portrait: full card
   width at the photo's own shape (from its width/height attributes, so the
   box is sized before it loads and the mosaic never moves), solid through
   the face and shoulders and easing out only across its lower part. */
.ufo-roster-portrait {
  display: block;
  width: 100%;
  height: auto;
  --ufo-fade-y-start: 62%;
  -webkit-mask-image: var(--ufo-fade-y);
  mask-image: var(--ufo-fade-y);
}
.ufo-roster-content {
  position: relative;
}
/* Onto the band's faded foot, where the image is already below ~5%, so no
   text is set on the picture. */
.ufo-roster-card.has-portrait .ufo-roster-content {
  margin-top: -20px;
}
</style>
