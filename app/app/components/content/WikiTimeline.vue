<script setup lang="ts">
import { timelineTintFor } from '@/utils/category'

interface TimelineEvent {
  date: string
  title: string
  summary?: string
  category?: string
  entities?: string[]
  significance?: string
}

const props = withDefaults(
  defineProps<{ events?: TimelineEvent[], eraSize?: number | string }>(),
  { events: () => [], eraSize: 10 },
)

/**
 * Leading 4-digit year, including for `c.`-prefixed circa dates (e.g.
 * "c. 1980s" -> 1980, so it groups into the 1980s era, not a catch-all).
 * Null only when no year can be parsed at all (e.g. "Unknown").
 */
function yearOf(date: string): number | null {
  const m = /^\s*(?:c\.\s*)?(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

/** Human-readable date: "1947-07-08" -> "8 Jul 1947"; passes vague dates through. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatDate(date: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (full) return `${Number(full[3])} ${MONTHS[Number(full[2]) - 1]} ${full[1]}`
  const ym = /^(\d{4})-(\d{2})$/.exec(date)
  if (ym) return `${MONTHS[Number(ym[2]) - 1]} ${ym[1]}`
  return date
}

const decade = computed(() => {
  const n = Number(props.eraSize)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 10
})

/*
 * RULING F6: the era grouping below walks events in order and opens a new
 * era whenever the computed label changes. That only produces one heading
 * per era if the input is already chronologically sorted -- out-of-order
 * authoring (e.g. 1947, 1955, 1948) would otherwise split into repeated
 * "1940s" / "1950s" / "1940s" sections.
 *
 * So: sort a COPY of props.events ascending by parsed year before grouping.
 * Undated entries (no parseable year) sort to the end, as a single trailing
 * "Undated" era, keeping their relative authored order. The sort is stable
 * (explicit index tiebreaker, not just relying on engine stability) so
 * same-year entries keep their authored order too. props.events itself is
 * never mutated.
 */
const sortedEvents = computed<TimelineEvent[]>(() =>
  props.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const ay = yearOf(a.event.date)
      const by = yearOf(b.event.date)
      const aKey = ay === null ? Number.POSITIVE_INFINITY : ay
      const bKey = by === null ? Number.POSITIVE_INFINITY : by
      if (aKey !== bKey) return aKey - bKey
      return a.index - b.index
    })
    .map(({ event }) => event))

/* -- filters -- */
const categories = computed(() =>
  [...new Set(props.events.map(e => e.category).filter(Boolean))].sort() as string[])
const active = ref<string | null>(null)
const majorOnly = ref(false)

const visible = computed(() => sortedEvents.value.filter((e) => {
  if (active.value && e.category !== active.value) return false
  if (majorOnly.value && e.significance !== 'major') return false
  return true
}))

/* -- era grouping -- */
interface Era { label: string, events: TimelineEvent[] }
const eras = computed<Era[]>(() => {
  const out: Era[] = []
  let current: Era | null = null
  for (const event of visible.value) {
    const year = yearOf(event.date)
    const label = year === null
      ? 'Undated'
      : `${Math.floor(year / decade.value) * decade.value}s`
    if (!current || current.label !== label) {
      current = { label, events: [] }
      out.push(current)
    }
    current.events.push(event)
  }
  return out
})

const { refs } = useWikiResolve(() => props.events.flatMap(e => e.entities ?? []))
</script>

<template>
  <div v-if="props.events.length" class="my-8">
    <!-- Filters -->
    <div class="mb-5 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        class="ufo-chip" :class="{ 'is-on': active === null }"
        :aria-pressed="active === null"
        @click="active = null"
      >
        All
      </button>
      <button
        v-for="category in categories"
        :key="category"
        type="button"
        class="ufo-chip"
        :class="{ 'is-on': active === category }"
        :aria-pressed="active === category"
        :style="{ '--chip': timelineTintFor(category) }"
        @click="active = active === category ? null : category"
      >
        {{ category }}
      </button>
      <span class="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        class="ufo-chip" :class="{ 'is-on': majorOnly }"
        :aria-pressed="majorOnly"
        @click="majorOnly = !majorOnly"
      >
        Major only
      </button>
      <span class="ml-auto font-mono text-[11px] text-muted-foreground">
        {{ visible.length }} / {{ props.events.length }}
      </span>
    </div>

    <p v-if="!visible.length" class="font-sans text-[14px] text-muted-foreground">
      No entries match these filters.
    </p>

    <section v-for="era in eras" :key="era.label" class="mb-8 last:mb-0">
      <h3 class="mb-3 font-display text-[20px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
        {{ era.label }}
      </h3>

      <ol class="ufo-rail">
        <li
          v-for="(event, i) in era.events"
          :key="`${event.date}-${i}`"
          class="ufo-rail-item"
          :class="{ 'is-major': event.significance === 'major' }"
        >
          <span class="ufo-dot" :style="{ background: timelineTintFor(event.category) }" aria-hidden="true" />
          <div class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {{ formatDate(event.date) }}
          </div>
          <h4 class="mt-0.5 font-display text-[17px] font-semibold leading-6 text-foreground">
            {{ event.title }}
          </h4>
          <p v-if="event.summary" class="mt-1 font-sans text-[14px] leading-6 text-foreground">
            {{ event.summary }}
          </p>
          <div v-if="event.entities?.length" class="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[13px]">
            <WikiEntityLink
              v-for="name in event.entities"
              :key="name"
              :name="name"
              :ref-data="refs.get(name.trim())"
            />
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

.ufo-chip {
  @apply rounded-sm border border-border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard);
}
.ufo-chip:hover { @apply text-foreground; }
.ufo-chip.is-on {
  border-color: var(--chip, hsl(var(--primary)));
  color: var(--chip, hsl(var(--primary)));
  /* Non-colour cue so active state survives greyscale/colour-blind viewing (WCAG 1.4.1). */
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ufo-rail {
  position: relative;
  margin: 0;
  padding: 0 0 0 22px;
  list-style: none;
}
.ufo-rail::before {
  content: '';
  position: absolute;
  inset-block: 6px 6px;
  left: 4px;
  width: 1px;
  background: hsl(var(--border));
}
.ufo-rail-item {
  position: relative;
  padding-block: 0 18px;
}
.ufo-rail-item:last-child { padding-bottom: 0; }

.ufo-dot {
  position: absolute;
  left: -22px;
  top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 9999px;
  box-shadow: 0 0 0 3px hsl(var(--background));
}
.ufo-rail-item.is-major .ufo-dot {
  width: 11px;
  height: 11px;
  left: -23px;
}
</style>
