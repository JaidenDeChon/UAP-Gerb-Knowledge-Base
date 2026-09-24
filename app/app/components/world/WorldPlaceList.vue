<script setup lang="ts">
import type { WorldPlace } from '#shared/types/wiki'
import { MapPin, Search, X } from '@lucide/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { CONTINENTS, formatPlaceType, matchesQuery, placeSlug } from '@/utils/world'

/**
 * Every placed Location, grouped by continent (in the order the continent
 * maps use), with a filter box. Picking a row selects the place; the
 * selected row is highlighted, like the sidebar's active note, and scrolled
 * into view when the selection comes from the globe or a map instead.
 *
 * This list is also the accessible form of the globe: every place, by name,
 * as a button.
 */
const props = defineProps<{
  places: WorldPlace[]
  selected: string | null
}>()

const emit = defineEmits<{ select: [slug: string] }>()

const query = ref('')

const groups = computed(() => {
  const q = query.value.trim()
  return CONTINENTS
    .map(c => ({
      ...c,
      places: props.places.filter(p => p.continent === c.id && (!q || matchesQuery(`${p.name} ${p.type}`, q))),
    }))
    .filter(g => g.places.length)
})

const shown = computed(() => groups.value.reduce((n, g) => n + g.places.length, 0))

const scroller = ref<HTMLElement | null>(null)

const reducedMotion = usePreferredReducedMotion()

/**
 * Brings the selected row into the list's own view, centred. Not
 * `scrollIntoView`: that scrolls every scrolling ancestor too, and would
 * drag the page away from wherever the selection was made.
 */
watch(() => props.selected, (slug) => {
  if (!slug) return
  nextTick(() => {
    const box = scroller.value
    const row = box?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`)
    if (!box || !row) return
    const rowTop = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    if (rowTop >= box.scrollTop + 40 && rowTop + row.offsetHeight <= box.scrollTop + box.clientHeight) return
    box.scrollTo({
      top: rowTop - box.clientHeight / 2 + row.offsetHeight / 2,
      behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth',
    })
  })
}, { immediate: true, flush: 'post' })
</script>

<template>
  <div class="@container flex h-full min-h-0 flex-col">
    <div class="shrink-0 border-b border-border/60 p-3">
      <label class="relative block">
        <span class="sr-only">Filter places</span>
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="query"
          type="search"
          placeholder="Filter places…"
          class="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 font-sans text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary"
        >
        <button
          v-if="query"
          type="button"
          class="absolute right-1.5 top-1/2 inline-grid size-6 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
          aria-label="Clear filter"
          @click="query = ''"
        >
          <X class="size-3.5" />
        </button>
      </label>
      <p class="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground" aria-live="polite">
        <template v-if="query.trim()">
          {{ shown }} of {{ places.length }} places
        </template>
        <template v-else>
          {{ places.length }} places
        </template>
      </p>
    </div>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      <section v-for="g in groups" :key="g.id" :aria-labelledby="`world-group-${g.id}`">
        <h3
          :id="`world-group-${g.id}`"
          class="sticky top-0 z-[1] flex items-center gap-1.5 bg-card px-2 pb-1 pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
          <span class="text-primary opacity-70">//</span>
          <span class="flex-1 truncate">{{ g.name }}</span>
          <span class="text-[10px] tracking-[0.06em]">{{ g.places.length }}</span>
        </h3>
        <ul>
          <li v-for="p in g.places" :key="p.path">
            <button
              type="button"
              :data-slug="placeSlug(p.path)"
              class="group relative flex w-full items-center gap-2.5 rounded-sm py-[6px] pl-3 pr-2 text-left font-sans text-sm transition-colors duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-ring"
              :class="selected === placeSlug(p.path) ? 'bg-accent font-semibold text-accent-foreground' : 'text-foreground hover:bg-accent'"
              :aria-pressed="selected === placeSlug(p.path)"
              @click="emit('select', placeSlug(p.path))"
            >
              <span
                class="absolute bottom-1 left-0 top-1 w-0.5 bg-primary transition-opacity duration-fast ease-standard"
                :class="selected === placeSlug(p.path) ? 'opacity-100' : 'opacity-0'"
              />
              <MapPin class="size-3.5 shrink-0" :class="selected === placeSlug(p.path) ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 flex-1 truncate">{{ p.name }}</span>
              <!-- The name wins the space: a long kind ("military installation") truncates first. -->
              <span v-if="p.type" class="hidden max-w-[38%] shrink-0 truncate font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-muted-foreground @[15rem]:inline">
                {{ formatPlaceType(p.type) }}
              </span>
            </button>
          </li>
        </ul>
      </section>

      <p v-if="!groups.length" class="px-3 py-8 text-center font-sans text-sm text-muted-foreground">
        No places match “{{ query.trim() }}”.
      </p>
    </div>
  </div>
</template>
