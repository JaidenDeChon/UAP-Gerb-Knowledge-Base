<script setup lang="ts">
import { timelineBorder, timelineMark, timelineSurface, timelineSurfaceHover } from '@/utils/category'

interface TimelineEvent {
  date: string
  title: string
  summary?: string
  category?: string
  entities?: string[]
  significance?: string
  cue?: number
  cueApprox?: boolean
}

const props = withDefaults(
  defineProps<{
    events?: TimelineEvent[]
    eraSize?: number | string
    video?: string
    /** The video's own title (for the dock header), not any one entry's title. */
    videoTitle?: string
  }>(),
  { events: () => [], eraSize: 10, video: '', videoTitle: '' },
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

/* -- filters --
 *
 * Persisted in the URL query (?cat=…&major=1) rather than local refs alone,
 * so navigating away and back (which remounts this component) restores the
 * same filtered view instead of resetting it. router.replace, not push —
 * toggling a chip must not add history entries the reader has to click back
 * through. Params are omitted entirely at the default (no category, major
 * off) so a clean page keeps a clean URL.
 *
 * Limitation: the query keys ('cat', 'major') are global to the page, not
 * scoped per instance. A page with two <WikiTimeline>s would have them
 * fight over the same keys. The vault currently has exactly one
 * ::wiki-timeline per page (the pilot page), so this hasn't been an issue —
 * scoping the keys (e.g. by a `timelineId` prop) would be the fix if a
 * second timeline is ever added to one page.
 */
const categories = computed(() =>
  [...new Set(props.events.map(e => e.category).filter(Boolean))].sort() as string[])

const route = useRoute()
const router = useRouter()

function queryString(key: string): string | null {
  const raw = route.query[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value ? value : null
}

const active = ref<string | null>(queryString('cat'))
const majorOnly = ref(queryString('major') === '1')

function syncFiltersToQuery(): void {
  const query = { ...route.query }
  if (active.value) query.cat = active.value
  else delete query.cat
  if (majorOnly.value) query.major = '1'
  else delete query.major
  router.replace({ query })
}

watch(active, syncFiltersToQuery)
watch(majorOnly, syncFiltersToQuery)

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
    <div class="mb-6 flex flex-wrap items-center gap-1.5">
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
        class="ufo-chip ufo-chip--cat"
        :class="{ 'is-on': active === category }"
        :aria-pressed="active === category"
        :style="{
          '--chip-mark': timelineMark(category),
          '--chip-border': timelineBorder(category),
          '--chip-surface': timelineSurface(category),
        }"
        @click="active = active === category ? null : category"
      >
        <span class="ufo-chip-dot" aria-hidden="true" />
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

    <!--
      No enter/leave list animation here: both a per-item `TransitionGroup`
      and a list-level keyed `<Transition mode="out-in">` were tried and
      each left the rendered list stuck out of sync with the reactive
      `eras`/`visible` filter state (stale duplicate entries in one case,
      the previous filter's entries never leaving in the other) — Vue's
      enter/leave tracking doesn't hold up reliably against this
      double-computed (filter -> era-group) re-render. Filtering swaps
      instantly instead; the hover lift on entry cards and press feedback
      on cues (below) carry the motion budget for this component.
    -->
    <div>
      <section v-for="era in eras" :key="era.label" class="ufo-era mb-10 last:mb-0">
        <div class="ufo-era-head">
          <span class="ufo-era-num">{{ era.label }}</span>
          <span class="ufo-era-rule" aria-hidden="true" />
        </div>

        <ol class="ufo-rail">
          <li
            v-for="(event, i) in era.events"
            :key="`${event.date}-${event.title}-${i}`"
            class="ufo-entry"
            :class="{ 'is-major': event.significance === 'major' }"
            :style="{
              '--entry-mark': timelineMark(event.category),
              '--entry-border': timelineBorder(event.category),
              '--entry-surface': timelineSurface(event.category),
              '--entry-surface-hover': timelineSurfaceHover(event.category),
            }"
          >
            <div class="flex items-center gap-2">
              <span class="ufo-entry-date font-mono text-[11px] uppercase tracking-[0.06em]">
                {{ formatDate(event.date) }}
              </span>
              <WikiCue
                v-if="typeof event.cue === 'number' && props.video"
                :t="event.cue"
                :video="props.video"
                :approx="event.cueApprox"
                :video-title="props.videoTitle"
                :entry-title="event.title"
              />
              <span v-if="event.significance === 'major'" class="ufo-major-badge">Major</span>
            </div>
            <h4
              class="mt-1 font-display leading-6 text-foreground"
              :class="event.significance === 'major' ? 'text-[19px] font-bold' : 'text-[17px] font-semibold'"
            >
              {{ event.title }}
            </h4>
            <p v-if="event.summary" class="mt-1 font-sans text-[14px] leading-6 text-foreground">
              {{ event.summary }}
            </p>
            <div v-if="event.entities?.length" class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
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
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* -- filter chips -- the bar doubles as the category legend --
 * Text colour is always `--foreground`/`--muted-foreground`, never the
 * category mark itself (that pattern is exactly what fails 4.5:1 for
 * Concepts/Videos in light+sepia — see WikiEntityLink). Category comes
 * through the dot swatch plus, when active, the border/surface tint —
 * both are >= 3:1 non-text uses, not body text. The active cue keeps a
 * NON-colour signal too (font-weight + underline, a prior review finding). */
.ufo-chip {
  @apply inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard);
}
.ufo-chip:hover { @apply text-foreground; }
.ufo-chip.is-on {
  border-color: hsl(var(--primary));
  color: hsl(var(--foreground));
  background: hsl(var(--primary) / 0.1);
  /* Non-colour cue so active state survives greyscale/colour-blind viewing (WCAG 1.4.1). */
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ufo-chip--cat.is-on {
  border-color: var(--chip-border);
  background: var(--chip-surface);
}
.ufo-chip-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--chip-mark);
  border: 1px solid hsl(var(--border));
}

/* -- era headings -- oversized numerals + a full-width rule, so scanning
   by decade needs no reading, just a glance down the left edge. */
/* Each era is its own <section>, so pinning its heading gives the familiar
   section-header behaviour for free: the year stays with you while you read
   that decade, then the next decade's heading pushes it out of the way. No
   JS, no scroll listener — sticky containment does all of it.

   Translucency and blur match AppTopBar and the dialog overlays rather than
   introducing a third treatment. The inline negative margin lets that
   backdrop bleed to the article's edges while the numeral stays on the text
   measure. z-10 sits above the entry cards and below the top bar and video
   dock (both z-40). */
.ufo-era-head {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-inline: -16px;
  margin-bottom: 16px;
  padding: 10px 16px;
  background: hsl(var(--background) / 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.ufo-era-num {
  flex: none;
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 42px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
  color: hsl(var(--foreground));
}
.ufo-era-rule {
  flex: 1 1 auto;
  height: 1px;
  background: hsl(var(--border));
  transform: translateY(-0.35em);
}

/* -- entry cards -- category-tinted surface + coloured left rule, replacing
   the old dot-on-a-line rail. */
.ufo-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.ufo-entry {
  position: relative;
  border: 1px solid hsl(var(--border));
  border-left: 4px solid var(--entry-border);
  border-radius: var(--radius-lg);
  background: var(--entry-surface);
  padding: 12px 16px 14px;
  transition: background-color var(--dur-base) var(--ease-standard),
    border-color var(--dur-base) var(--ease-standard),
    box-shadow var(--dur-base) var(--ease-standard),
    transform var(--dur-base) var(--ease-standard);
}
.ufo-entry:hover {
  background: var(--entry-surface-hover);
  box-shadow: 0 4px 14px hsl(0 0% 0% / 0.08);
  transform: translateY(-2px);
}
.ufo-entry.is-major {
  border-left-width: 6px;
}

.ufo-major-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  padding: 0 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  background: hsl(var(--foreground) / 0.05);
}

/*
 * Date label and .ufo-major-badge text: `--foreground`, NOT
 * `--muted-foreground`. Measured directly in a live browser with the theme
 * driven by the actual `uapgdb-theme` cookie (not a manually-set `data-theme`
 * attribute, which Vue's own binding fights) and proper compositing: on this
 * card's `--entry-surface` tint, `--muted-foreground` fails 4.5:1 for every
 * one of the 6 timeline categories in `light` (3.83-4.19:1) and `sepia`
 * (worst `.ufo-major-badge` case measured 3.45:1) -- the identical gap found
 * and fixed in WikiRoster/OrgChartNode (see those files): `timelineSurface`'s
 * >= 4.5:1 guarantee only ever covered `--foreground`. `--foreground` is used
 * instead; the date/badge stay visually secondary by size (11px/9px, smallest
 * text on the card) rather than by colour.
 */
.ufo-entry-date {
  color: hsl(var(--foreground));
}

@media (prefers-reduced-motion: reduce) {
  .ufo-entry {
    transition: none;
  }
  .ufo-entry:hover {
    transform: none;
    box-shadow: none;
  }
}
</style>
