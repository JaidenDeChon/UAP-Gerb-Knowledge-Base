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
import { categoryMark, categorySurface } from '@/utils/category'
import { portraitAlt, portraitCredit } from '@/utils/portrait'

interface Entry { name: string, role?: string, note?: string }

const props = withDefaults(defineProps<{ entries?: Entry[] }>(), { entries: () => [] })

const { refs, ready } = useWikiResolve(() => props.entries.map(e => e.name))

/** A person's portrait, when their page has one (see wiki/portraits.ts). */
function imageOf(name: string): NotePortrait | undefined {
  return refs.value.get(name.trim())?.image
}

function categoryOf(name: string): string {
  return refs.value.get(name.trim())?.category ?? 'Unlinked'
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
</script>

<template>
  <!-- Held back (invisible, not removed) until the names resolve: a card
       that turns out to have a portrait reflows around it, and that should
       happen before anyone sees the card, not in front of them. -->
  <div
    v-if="props.entries.length"
    class="ufo-roster my-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
    :class="{ 'is-pending': !ready }"
  >
    <article
      v-for="entry in props.entries"
      :key="entry.name"
      class="ufo-roster-card relative flow-root overflow-hidden rounded-lg border border-border py-3 pl-4 pr-3.5"
      :style="{
        '--card-surface': categorySurface(refs.get(entry.name.trim())?.category),
        '--card-mark': categoryMark(refs.get(entry.name.trim())?.category),
      }"
    >
      <!-- Category spine, on top of the surface tint below. -->
      <span class="ufo-roster-spine absolute inset-y-0 left-0 w-[3px]" aria-hidden="true" />
      <!-- The portrait, floated into the card's top-right corner and faded
           into the card surface along its left and bottom edges with the
           shared `ufo-fade` mask, so the text wraps beside it. A fixed box,
           so loading it never moves anything; the credit is its tooltip
           (and spelled out, linked, on the person's own page). -->
      <img
        v-if="imageOf(entry.name)"
        :src="imageOf(entry.name)?.src"
        :width="imageOf(entry.name)?.width"
        :height="imageOf(entry.name)?.height"
        :alt="portraitAlt(entry.name)"
        :title="portraitCredit(imageOf(entry.name)!)"
        loading="lazy"
        decoding="async"
        class="ufo-roster-portrait ufo-fade ufo-fade-xy"
      >
      <div class="flex items-center gap-1.5">
        <span class="ufo-roster-icon-wrap" aria-hidden="true">
          <component :is="iconFor(entry.name)" class="ufo-roster-icon" />
        </span>
        <span class="ufo-roster-cat font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">
          {{ categoryOf(entry.name) }}
        </span>
      </div>
      <h4 class="mt-1 font-display text-[17px] font-semibold leading-6">
        <WikiEntityLink :name="entry.name" :ref-data="refs.get(entry.name.trim())" />
      </h4>
      <p v-if="entry.role" class="ufo-roster-role mt-0.5 font-sans text-[13px] leading-5">
        {{ entry.role }}
      </p>
      <p v-if="entry.note" class="mt-1.5 font-sans text-[14px] leading-6 text-foreground">
        {{ entry.note }}
      </p>
    </article>
  </div>
</template>

<style scoped>
/*
 * Whole-card category tint, not just the spine: the card's own surface is
 * `--card-surface` (categorySurface -> hsl(var(--graph-cat-X) / 0.14)),
 * already verified >= 4.5:1 for --foreground body text across all 8
 * categories x 4 themes (see app/app/utils/category.ts).
 *
 * The card's OUTER border is deliberately left neutral (`hsl(var(--border))`,
 * the Tailwind `border` utility's default), not category-coloured, matching
 * WikiTimeline's established pattern (neutral box border + a coloured LEFT
 * RULE only, never a fully category-tinted outline). Measured directly:
 * a category-coloured 0.85-alpha border against this same category's own
 * 0.14-alpha surface collapses to as low as 1.56-1.59:1 (Videos, light and
 * sepia) -- the two hues that "cannot reach 3:1 against the card by design"
 * (see category.ts's own doc comment) fail just as badly against their own
 * tinted surface as against a plain card. The spine below carries the
 * category colour instead, same as WikiTimeline's left rule.
 *
 * The category LABEL is deliberately NOT filled with the raw mark colour as
 * running text: measured directly (see .superpowers/sdd/design-foundation-report.md
 * plus the restyle pass's own re-check), `categoryMark` used as TEXT against
 * `--card` fails the 4.5:1 body-text floor far beyond just Concepts/Videos --
 * in the light theme alone People (4.22), Locations (4.10), Ops (4.12),
 * Concepts (2.69) and Videos (1.93) all fail; sepia Locations (4.45) and dim
 * Orgs (4.15) fail too. Category comes through instead via a small
 * full-strength dot (mirroring WikiEntityLink's dot) with a hairline
 * `--border` ring so its shape reads even where the fill itself is
 * low-contrast; the entity name is always present as plain text right below
 * it -- so colour is never the only signal here, same as
 * WikiEntityLink/WikiTimeline.
 *
 * `--muted-foreground` is NOT used for the category label or the role line,
 * even though it would be the "secondary text" convention elsewhere on this
 * page: measured directly (composite categorySurface's 0.14-alpha tint over
 * --card, then check --muted-foreground against THAT, not against plain
 * --card), it fails 4.5:1 broadly once the card itself carries a colour
 * wash -- every one of the 8 categories fails in `light` (3.83-4.38:1) and
 * `sepia` (3.86-4.40:1), plus `videos` in `dim` (4.07:1). categorySurface's
 * own >= 4.5:1 guarantee (see category.ts) was verified against
 * `--foreground` only, not `--muted-foreground` -- a whole-card tint is a
 * new use this task introduces, so that gap wasn't previously reachable.
 * Both the category label and the role line use `--foreground` instead
 * (always safe here, worst case 6.76:1 per the same verification), kept
 * visually secondary by size/weight (10px mono / 13px regular) rather than
 * by colour.
 */
.ufo-roster-card {
  background: var(--card-surface);
  transition: background-color var(--dur-base) var(--ease-standard),
    opacity var(--dur-base) var(--ease-standard);
}
.ufo-roster.is-pending .ufo-roster-card {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ufo-roster-card {
    transition: none;
  }
}
/* Flush with the card's top and right edges (the negative margins undo the
   card's 12px / 14px padding; the card's own radius and overflow clip the
   corner). A fixed box whatever the photo's shape: cover-cropped, biased
   toward the top where the face is. Solid in the top-right, eased out
   toward the text on the left and into the card at the bottom. */
.ufo-roster-portrait {
  float: right;
  width: 92px;
  height: 116px;
  margin: -12px -14px 4px 10px;
  object-fit: cover;
  object-position: 50% 22%;
  --ufo-fade-x-start: 42%;
  --ufo-fade-y-start: 52%;
}
.ufo-roster-spine {
  background: var(--card-mark);
}
/* Icon + hairline ring, same reasoning as WikiTimeline's `.ufo-entry-cat-icon-wrap`
   and WikiEntityLink's dot: a neutral `--border` ring keeps the mark's shape
   legible even for hues that can't clear 3:1 against the card on their own. */
.ufo-roster-icon-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
}
.ufo-roster-icon {
  width: 10px;
  height: 10px;
  color: var(--card-mark);
}
.ufo-roster-cat,
.ufo-roster-role {
  color: hsl(var(--foreground));
}
</style>
