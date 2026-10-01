<script setup lang="ts">
import type { Category, PersonConnection } from '#shared/types/wiki'
import { CATEGORY_ORDER } from '#shared/types/wiki'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABEL, categoryMark } from '@/utils/category'

/**
 * The people, organizations, programs, events, places and ideas this person
 * is linked with, strongest first: the bar beside each one is how many of
 * the person's videos also mention it. One button per category narrows the
 * list. Built from the link graph (`/api/person`), so it needs no authoring.
 */
const props = defineProps<{ path: string, name: string }>()

const { data: profile } = usePersonProfile(() => props.path)

const LIMIT = 12
const filter = ref<Category | 'all'>('all')
const showAll = ref(false)
watch(() => props.path, () => {
  filter.value = 'all'
  showAll.value = false
})
watch(filter, () => { showAll.value = false })

const connections = computed<PersonConnection[]>(() => profile.value?.connections ?? [])
const videoCount = computed(() => profile.value?.videos.length ?? 0)

const groups = computed(() => {
  const counts = new Map<Category, number>()
  for (const c of connections.value) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)
  return CATEGORY_ORDER.filter(c => counts.has(c)).map(c => ({ category: c, count: counts.get(c)! }))
})

const filtered = computed(() =>
  filter.value === 'all' ? connections.value : connections.value.filter(c => c.category === filter.value))
const shown = computed(() => (showAll.value ? filtered.value : filtered.value.slice(0, LIMIT)))
const maxShared = computed(() => Math.max(1, ...connections.value.map(c => c.shared)))

function together(c: PersonConnection): string {
  if (c.shared === 0) return 'Page link only, in none of their videos'
  if (videoCount.value === 1) return 'Appears with them in their only video'
  return `Appears with them in ${c.shared} ${c.shared === 1 ? 'video' : 'videos'}`
}
</script>

<template>
  <section v-if="connections.length" class="ufo-pc" aria-labelledby="ufo-pc-title">
    <h2 id="ufo-pc-title" class="mb-2 font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-foreground">
      Connected to {{ name }}
    </h2>
    <p class="mb-4 font-sans text-[14px] leading-6 text-muted-foreground">
      {{ connections.length }} {{ connections.length === 1 ? 'entry links' : 'entries link' }} to or from this page.
      <template v-if="videoCount > 1">
        Entries that share the most videos with this person are listed first.
      </template>
    </p>

    <div v-if="groups.length > 1" class="ufo-pc-filters" role="group" aria-label="Show one kind of entry">
      <button
        type="button"
        class="ufo-pc-filter"
        :aria-pressed="filter === 'all'"
        @click="filter = 'all'"
      >
        All {{ connections.length }}
      </button>
      <button
        v-for="group in groups"
        :key="group.category"
        type="button"
        class="ufo-pc-filter"
        :aria-pressed="filter === group.category"
        @click="filter = group.category"
      >
        <span class="ufo-pc-dot" :style="{ background: categoryMark(group.category) }" aria-hidden="true" />
        {{ CATEGORY_LABEL[group.category] }} {{ group.count }}
      </button>
    </div>

    <ol class="ufo-pc-list">
      <li v-for="c in shown" :key="c.path" class="ufo-pc-item">
        <WikiEntityLink :name="c.title" :ref-data="c" />
        <span class="ufo-pc-strength">
          <span class="ufo-pc-meter" aria-hidden="true">
            <span
              class="ufo-pc-fill"
              :style="{ width: `${(c.shared / maxShared) * 100}%`, background: categoryMark(c.category) }"
            />
          </span>
          <span class="ufo-pc-note">{{ together(c) }}</span>
        </span>
      </li>
    </ol>

    <Button
      v-if="filtered.length > LIMIT"
      variant="ghost"
      size="sm"
      class="mt-3"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show fewer' : `Show all ${filtered.length}` }}
    </Button>
  </section>
</template>

<style scoped>
.ufo-pc {
  container-type: inline-size;
}
.ufo-pc-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
/* Same small control as ::wiki-record's filters and the timeline's chips. */
.ufo-pc-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px;
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
.ufo-pc-filter:hover {
  color: hsl(var(--foreground));
}
.ufo-pc-filter[aria-pressed="true"] {
  border-color: hsl(var(--primary));
  color: hsl(var(--foreground));
}
.ufo-pc-filter:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
.ufo-pc-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  border: 1px solid hsl(var(--border));
}
.ufo-pc-list {
  display: grid;
  gap: 6px;
}
@container (min-width: 40rem) {
  .ufo-pc-list {
    grid-template-columns: 1fr 1fr;
    column-gap: 18px;
  }
}
.ufo-pc-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
}
.ufo-pc-strength {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}
.ufo-pc-meter {
  position: relative;
  flex: none;
  width: 64px;
  height: 6px;
  overflow: hidden;
  border-radius: 9999px;
  background: hsl(var(--muted-foreground) / 0.15);
}
.ufo-pc-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 9999px;
}
.ufo-pc-note {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}
</style>
