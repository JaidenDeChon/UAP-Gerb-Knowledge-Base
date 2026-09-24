<script setup lang="ts">
import type { WorldPlaces } from '#shared/types/wiki'
import type { MapOutlines } from '@/composables/useMapOutlines'
import { Flame, List, MapPin } from '@lucide/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { CONTINENTS, heatColor, hslString, placeSlug } from '@/utils/world'

/**
 * `/world` — every placed Location on a globe, with the list of them beside
 * it and the same places on a flat map per continent below. The selected
 * place and the pins/heat mode live in the URL (`useWorldView`), so the
 * globe, the list, the preview card and the continent maps all follow one
 * selection, and a view can be shared.
 *
 * The page waits on the app's UFO loader until the places are in, the
 * globe has drawn and the continent maps have their outlines.
 */
const { data, status } = useFetch<WorldPlaces>('/api/places', { key: 'world-places', lazy: true })

usePageTitle().value = 'World map'
useHead({ title: 'World map' })

const places = computed(() => data.value?.places ?? [])
const unplaced = computed(() => data.value?.unplaced ?? [])

const { selected, mode } = useWorldView()

const current = computed(() => places.value.find(p => placeSlug(p.path) === selected.value) ?? null)

const byContinent = computed(() =>
  CONTINENTS
    .map(c => ({ ...c, places: places.value.filter(p => p.continent === c.id) }))
    .filter(c => c.places.length))

/* -- selection -------------------------------------------------------------- */

const hero = ref<HTMLElement | null>(null)
const sheetOpen = ref(false)
const reducedMotion = usePreferredReducedMotion()

function select(slug: string): void {
  selected.value = slug
}

/** From the list in the sheet: close it, the globe is right there. */
function selectFromSheet(slug: string): void {
  select(slug)
  sheetOpen.value = false
}

/** From a continent map, far down the page: bring the globe (and its card) back into view. */
function selectFromMap(slug: string): void {
  select(slug)
  hero.value?.scrollIntoView({ behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth', block: 'start' })
}

/* -- continent maps' outlines ------------------------------------------------ */

/** True once the globe has drawn, or given up. It's client-only, so the page registers for it. */
const globeSettled = ref(false)

const outlines = shallowRef<MapOutlines | null>(null)
const outlinesSettled = ref(false)
onMounted(() => {
  loadMapOutlines()
    .then((o) => {
      outlines.value = markRaw(o)
    })
    .catch(() => {
      // The maps keep their water and dots; only the land is missing.
    })
    .finally(() => {
      outlinesSettled.value = true
    })
})

usePageReady(() =>
  (status.value === 'success' || status.value === 'error') && globeSettled.value && outlinesSettled.value)

/* -- heat legend ------------------------------------------------------------- */

const { tokens, isDark } = useThemeTokens(['primary'] as const)
const legend = computed(() => {
  const primary = tokens.value.primary
  if (!primary) return 'linear-gradient(90deg, transparent, hsl(var(--primary)))'
  const stops = [0.05, 0.25, 0.5, 0.75, 1].map((t) => {
    const { hsl, alpha } = heatColor(t, primary, isDark.value)
    return hslString(hsl, alpha)
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
})

const MODES = [
  { id: 'pins', label: 'Pins', icon: MapPin },
  { id: 'heat', label: 'Heat', icon: Flame },
] as const
</script>

<template>
  <div class="ufo-world @container mx-auto max-w-[1400px] px-8 pb-32 pt-10">
    <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div>
        <h1 class="font-display text-[clamp(32px,5vw,56px)] font-extrabold uppercase leading-none tracking-[0.02em] text-foreground">
          World map
        </h1>
        <p class="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          <template v-if="data">
            {{ places.length }} places · {{ byContinent.length }} continents
          </template>
          <template v-else>
&nbsp;
          </template>
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div v-if="mode === 'heat'" class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <span>Fewer</span>
          <span class="h-2 w-24 rounded-full border border-border" :style="{ background: legend }" aria-hidden="true" />
          <span>More places</span>
        </div>

        <div class="ufo-world-toggle" role="radiogroup" aria-label="Show places as">
          <button
            v-for="m in MODES"
            :key="m.id"
            type="button"
            role="radio"
            :aria-checked="mode === m.id"
            class="ufo-world-toggle-btn"
            :class="{ 'is-on': mode === m.id }"
            @click="mode = m.id"
          >
            <component :is="m.icon" class="size-3.5" />
            {{ m.label }}
          </button>
        </div>

        <button type="button" class="ufo-world-sheet-btn" :disabled="!data" @click="sheetOpen = true">
          <List class="size-4" />
          Places
          <span class="font-mono text-[10px] text-muted-foreground">{{ places.length || '' }}</span>
        </button>
      </div>
    </header>

    <div class="ufo-world-body">
      <section ref="hero" class="ufo-world-hero mt-6" aria-label="Globe and list of places">
        <div class="ufo-world-stage">
          <div class="ufo-world-glow" aria-hidden="true" />
          <ClientOnly>
            <WorldGlobe
              v-if="data"
              :places="places"
              :selected="selected"
              :mode="mode"
              @select="select"
              @settled="globeSettled = true"
            />
          </ClientOnly>


          <span aria-hidden="true" class="ufo-hud left-[8px] top-[8px] border-l border-t" />
          <span aria-hidden="true" class="ufo-hud right-[8px] top-[8px] border-r border-t" />
          <span aria-hidden="true" class="ufo-hud bottom-[8px] left-[8px] border-b border-l" />
          <span aria-hidden="true" class="ufo-hud bottom-[8px] right-[8px] border-b border-r" />

          <div v-if="current" class="ufo-world-card">
            <WorldPlaceCard :key="current.path" :place="current" @close="selected = null" />
          </div>
        </div>

        <aside class="ufo-world-rail" aria-label="Places">
          <WorldPlaceList v-if="data" :places="places" :selected="selected" @select="select" />
        </aside>
      </section>

      <div v-if="current" class="ufo-world-card-below mt-3">
        <WorldPlaceCard :key="current.path" :place="current" @close="selected = null" />
      </div>

      <section v-if="byContinent.length" class="mt-14" aria-labelledby="world-continents">
        <h2 id="world-continents" class="font-display text-[clamp(22px,3vw,30px)] font-bold uppercase leading-none tracking-[0.02em] text-foreground">
          By continent
        </h2>
        <p class="mb-5 mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Hover a place to name it · click to find it on the globe
        </p>
        <div class="grid gap-4 @4xl:grid-cols-2">
          <WorldContinentMap
            v-for="c in byContinent"
            :key="c.id"
            v-reveal
            :continent="c.id"
            :places="c.places"
            :selected="selected"
            :mode="mode"
            :outlines="outlines"
            @select="selectFromMap"
          />
        </div>
      </section>

      <footer v-if="data" class="mt-10 space-y-2 font-sans text-[13px] leading-6 text-muted-foreground">
        <p v-if="unplaced.length">
          Not on the map, for want of a place to pin:
          <template v-for="(u, k) in unplaced" :key="u.path">
            <NuxtLink :to="u.path" class="text-foreground underline decoration-border underline-offset-4 hover:text-primary hover:decoration-primary">{{ u.name }}</NuxtLink><template v-if="k < unplaced.length - 1">, </template>
          </template>.
        </p>
        <p class="text-[11.5px]">
          Ranges and regions are pinned at a representative centre.
        </p>
      </footer>
    </div>

    <Dialog v-model:open="sheetOpen">
      <!-- No auto-focus: on a phone, focusing the filter box would throw up
           the keyboard over the list someone opened to scroll. -->
      <DialogContent class="ufo-world-sheet" :hud="false" @open-auto-focus.prevent>
        <DialogTitle class="px-4 pt-4 font-display text-lg font-bold uppercase tracking-[0.02em]">
          Places
        </DialogTitle>
        <DialogDescription class="sr-only">
          Pick a place to find it on the globe.
        </DialogDescription>
        <div class="min-h-0 flex-1">
          <WorldPlaceList :places="places" :selected="selected" @select="selectFromSheet" />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* -- hero: globe beside the list ------------------------------------------- */

.ufo-world-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  height: clamp(480px, 74vh, 800px);
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}
.ufo-world-stage {
  position: relative;
  min-width: 0;
  overflow: hidden;
  /* A faint survey grid behind the globe. */
  background-image:
    linear-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--border) / 0.45) 1px, transparent 1px);
  background-size: 48px 48px;
  background-position: center;
}
.ufo-world-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.16), hsl(var(--primary) / 0.04) 38%, transparent 62%);
}
.ufo-hud {
  position: absolute;
  z-index: 1;
  width: 12px;
  height: 12px;
  border-color: hsl(var(--primary));
  pointer-events: none;
}
.ufo-world-card {
  position: absolute;
  z-index: 2;
  left: 16px;
  bottom: 16px;
  width: min(380px, calc(100% - 32px));
}
.ufo-world-card-below {
  display: none;
}
.ufo-world-rail {
  min-height: 0;
  border-left: 1px solid hsl(var(--border));
  background: hsl(var(--card));
}

/* -- pins / heat ----------------------------------------------------------- */

.ufo-world-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}
.ufo-world-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  transition: background-color var(--duration-fast) ease, color var(--duration-fast) ease;
}
.ufo-world-toggle-btn:hover {
  color: hsl(var(--foreground));
}
.ufo-world-toggle-btn.is-on {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.ufo-world-toggle-btn:focus-visible,
.ufo-world-sheet-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-world-sheet-btn {
  display: none;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
}

/* -- the list as a side sheet ------------------------------------------------ */

:global(.ufo-world-sheet) {
  top: 0;
  right: 0;
  left: auto;
  translate: none;
  transform: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(360px, 88vw);
  max-width: none;
  height: 100dvh;
  padding: 0;
  border-width: 0 0 0 1px;
  border-radius: 0;
  background: hsl(var(--card));
}

/* -- narrow: the shell's 900px breakpoint ------------------------------------- */

@media (max-width: 900px) {
  .ufo-world {
    padding-left: 16px;
    padding-right: 16px;
    padding-top: 24px;
  }
  .ufo-world-hero {
    grid-template-columns: minmax(0, 1fr);
    height: min(62vh, 520px);
  }
  .ufo-world-rail,
  .ufo-world-card {
    display: none;
  }
  .ufo-world-card-below {
    display: block;
  }
  .ufo-world-sheet-btn {
    display: inline-flex;
  }
}
</style>
