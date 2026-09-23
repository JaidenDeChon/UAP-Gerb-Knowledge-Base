<script setup lang="ts">
import type { Component } from 'vue'
import {
  ArrowDown,
  Building2,
  CalendarClock,
  Compass,
  Crosshair,
  FileText,
  Scale,
  Users,
} from '@lucide/vue'
import type { RulerHinge, RulerMark } from '@/components/wiki/TimelineChronometer.vue'
import type { Chapter, TimelineEra, TimelineEvent, TimelineHinge } from '@/utils/timeline'
import {
  timelineBorder,
  timelineIconName,
  timelineLabel,
  timelineMark,
  timelineSurface,
  timelineSurfaceHover,
} from '@/utils/category'
import {
  assignLanes,
  axisTicks,
  chapterize,
  eraBands,
  formatClock,
  formatDate,
  fractionalYear,
  lerp,
  nowPlayingIndex,
  positionForPct,
  sortEvents,
  timeScale,
  yearOf,
} from '@/utils/timeline'
import { useScrollCursor } from '@/composables/useScrollCursor'
import { useVideoClock } from '@/composables/useVideoClock'

/**
 * `::wiki-timeline` — a chronology read as an instrument.
 *
 * Above the entries a pinned chronometer (`WikiTimelineChronometer`) shows
 * the year under the reader's eye, the era it belongs to, and — while the
 * page's video plays — the entry the host is discussing, over a proportional
 * ruler of the whole span. Beneath it the entries stay vertical, grouped into
 * the eras the video itself frames (`eras` YAML; decades when none are
 * authored), beside a spine that fills in as the reader passes each node.
 * Scrolling moves the ruler's cursor; clicking the ruler moves the page;
 * Sync seeks the video to the entry being read; Follow lets the video scroll
 * the page. All geometry is percentages from `utils/timeline.ts`, computed
 * once from the YAML, so server and client render the same markup.
 */

/** Glyph names `timelineIconName` can return -> the lucide component. */
const ICONS: Record<string, Component> = {
  'calendar-clock': CalendarClock,
  'crosshair': Crosshair,
  'users': Users,
  'building-2': Building2,
  'file-text': FileText,
  'scale': Scale,
  'compass': Compass,
}

function categoryIcon(category?: string): Component {
  return ICONS[timelineIconName(category)] ?? Compass
}

const props = withDefaults(
  defineProps<{
    events?: TimelineEvent[]
    /** The video's own eras; with none, entries group by `eraSize`-year decades. */
    eras?: TimelineEra[]
    /** Single labelled years drawn as dashed markers on the ruler. */
    hinges?: TimelineHinge[]
    eraSize?: number | string
    video?: string
    /** The video's own title (for the dock header), not any one entry's title. */
    videoTitle?: string
    /** Plain-text "how to read this" copy for the chronometer's (i) popover. */
    help?: string
  }>(),
  { events: () => [], eras: () => [], hinges: () => [], eraSize: 10, video: '', videoTitle: '', help: '' },
)

const decade = computed(() => {
  const n = Number(props.eraSize)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 10
})

/* -- sorting: chronological, stable, never mutating the prop -- */
type Indexed = TimelineEvent & { index: number }
const sorted = computed<Indexed[]>(() =>
  sortEvents(props.events).map((event, index) => ({ ...event, index })))

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
 * fight over the same keys; the vault has one per page.
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
const filtered = computed(() => active.value !== null || majorOnly.value)

function syncFiltersToQuery(): void {
  const query = { ...route.query }
  if (active.value) query.cat = active.value
  else delete query.cat
  if (majorOnly.value) query.major = '1'
  else delete query.major
  router.replace({ query })
}

// Reveal-on-scroll is armed for the first render only: a filter change
// re-renders the list, and re-hiding forty cards the reader has already
// seen would read as a glitch, not a flourish.
const revealArmed = ref(true)
watch([active, majorOnly], () => {
  revealArmed.value = false
  syncFiltersToQuery()
  nextTick(() => cursor.refresh())
})

function isVisible(event: TimelineEvent): boolean {
  if (active.value && event.category !== active.value) return false
  if (majorOnly.value && event.significance !== 'major') return false
  return true
}

/* -- chapters: the video's eras, or decades -- */
const chapters = computed<Chapter<Indexed>[]>(() =>
  chapterize(sorted.value.filter(isVisible), props.eras, decade.value))
const eraCount = computed(() => props.eras.length)

/**
 * The entries the reader can scroll through, in DOM order — derived from
 * the chapters rather than from the sorted list directly, so the scroll
 * cursor's index (which counts `.ufo-entry` elements) can never disagree
 * with the list it is looked up in, whatever chapterize does with an edge
 * case.
 */
const visible = computed<Indexed[]>(() => chapters.value.flatMap(c => c.events))

function chapterRange(chapter: Chapter<Indexed>): string {
  if (chapter.kind === 'decade') return ''
  if (chapter.from === null && chapter.to === null) return ''
  if (chapter.from === null) return `to ${chapter.to}`
  if (chapter.to === null) return `${chapter.from} – present`
  return `${chapter.from} – ${chapter.to}`
}

function chapterMeta(chapter: Chapter<Indexed>): string {
  const parts: string[] = []
  const n = chapter.events.length
  parts.push(`${n} ${n === 1 ? 'entry' : 'entries'}`)
  const major = chapter.events.filter(e => e.significance === 'major').length
  if (major) parts.push(`${major} major`)
  if (props.video) {
    const cues = chapter.events.map(e => e.cue).filter((c): c is number => typeof c === 'number')
    if (cues.length) {
      const lo = Math.min(...cues)
      const hi = Math.max(...cues)
      parts.push(lo === hi ? formatClock(lo) : `${formatClock(lo)} → ${formatClock(hi)}`)
    }
  }
  return parts.join(' · ')
}

function chapterKicker(chapter: Chapter<Indexed>): string {
  if (chapter.kind === 'era' && eraCount.value) {
    return `Era ${String(chapter.ordinal).padStart(2, '0')} / ${String(eraCount.value).padStart(2, '0')}`
  }
  if (chapter.kind === 'before') return 'Prologue'
  if (chapter.kind === 'after') return 'Coda'
  return ''
}

/* -- the ruler's geometry -- */
const scale = computed(() => timeScale(sorted.value, props.eras))
const ticks = computed(() => axisTicks(scale.value))
const bands = computed(() => eraBands(props.eras, scale.value))
const hinges = computed<RulerHinge[]>(() =>
  props.hinges.map(h => ({ ...h, pct: scale.value.pct(h.year) })))

/** Axis position (0–100) per sorted entry; null for an undated one. */
const positions = computed<Array<number | null>>(() =>
  sorted.value.map((e) => {
    const y = fractionalYear(e.date)
    return y === null ? null : scale.value.pct(y)
  }))

/** Same-year clusters stack into lanes rather than overprinting. */
const lanes = computed(() => assignLanes(positions.value, 1.6))

const marks = computed<RulerMark[]>(() => sorted.value.flatMap((e, i) => {
  const pct = positions.value[i]
  if (pct === null || pct === undefined) return []
  return [{
    index: i,
    pct,
    lane: Math.min(3, lanes.value[i] ?? 0),
    mark: timelineMark(e.category),
    significance: e.significance ?? 'notable',
    title: e.title,
    date: formatDate(e.date),
    hidden: !isVisible(e),
  }]
}))

/* -- the reading cursor -- */
const root = ref<HTMLElement | null>(null)
const chronoHeight = ref(0)

// The chronometer is a direct child of this component's root: `position:
// sticky` only holds within its parent, so wrapping it in its own element
// would leave it nothing tall enough to stick inside.
function measureChrono(): void {
  chronoHeight.value = root.value?.querySelector<HTMLElement>('.ufo-chrono')?.offsetHeight ?? 0
}

const cursor = useScrollCursor(root, {
  itemSelector: '.ufo-entry',
  readingLine: 0.36,
  stickyOffset: () => chronoHeight.value,
})

const readingEntry = computed<Indexed | null>(() => visible.value[cursor.index.value] ?? null)
const nextEntry = computed<Indexed | null>(() => visible.value[cursor.index.value + 1] ?? null)
const readingIndex = computed(() => readingEntry.value?.index ?? -1)

/** Where the cursor sits on the ruler: gliding between this entry and the next. */
const cursorPct = computed(() => {
  const a = readingEntry.value ? positions.value[readingEntry.value.index] ?? null : null
  const b = nextEntry.value ? positions.value[nextEntry.value.index] ?? null : null
  if (a === null && b === null) return 0
  if (a === null) return b as number
  if (b === null) return a
  return lerp(a, b, cursor.t.value)
})

const yearReadout = computed<number | null>(() => {
  const a = readingEntry.value ? yearOf(readingEntry.value.date) : null
  const b = nextEntry.value ? yearOf(nextEntry.value.date) : null
  if (a === null) return b
  if (b === null) return a
  return Math.round(lerp(a, b, cursor.t.value))
})

const readingChapter = computed<Chapter<Indexed> | null>(() => {
  const idx = readingIndex.value
  if (idx < 0) return chapters.value[0] ?? null
  return chapters.value.find(c => c.events.some(e => e.index === idx)) ?? null
})

/* -- the video's position -- */
const dock = useVideoDock()
const clock = useVideoClock(() => props.video)

const nowIndex = computed(() =>
  clock.isThisVideo.value ? nowPlayingIndex(sorted.value, clock.time.value) : -1)
const nowEntry = computed<Indexed | null>(() => sorted.value[nowIndex.value] ?? null)
const nowPct = computed<number | null>(() =>
  nowEntry.value ? positions.value[nowEntry.value.index] ?? null : null)
const nowClock = computed(() => formatClock(clock.time.value ?? 0))

const canSync = computed(() => !!props.video && typeof readingEntry.value?.cue === 'number')

/**
 * Seek the video to the entry under the reading line. Same rules as a cue
 * chip: open the dock at that moment when it holds no video or a different
 * one, otherwise just seek.
 */
function sync(): void {
  const entry = readingEntry.value
  if (!props.video || !entry || typeof entry.cue !== 'number') return
  if (dock.videoId.value !== props.video) {
    dock.open({ videoId: props.video, at: entry.cue, title: props.videoTitle || props.video })
    return
  }
  dock.seek(entry.cue)
}

/* -- follow: the video drives the page, until the reader touches it -- */
const follow = ref(false)
const reduced = ref(false)

function positionOf(sortedIndex: number): number {
  return visible.value.findIndex(e => e.index === sortedIndex)
}

function followTo(idx: number): void {
  if (idx < 0) return
  const pos = positionOf(idx)
  if (pos >= 0) cursor.scrollToIndex(pos, reduced.value ? 'auto' : 'smooth')
}
watch(nowIndex, (idx) => {
  if (follow.value) followTo(idx)
})
// Switching Follow on goes to the current entry at once, not at the next cue.
watch(follow, (on) => {
  if (on) followTo(nowIndex.value)
})
watch(() => clock.isThisVideo.value, (isThis) => {
  if (!isThis) follow.value = false
})

/* -- scrubbing: the reading cursor dragged along the ruler -- */
function scrub(pct: number): void {
  // The reader is steering, so the video stops driving the page.
  follow.value = false
  const pcts = visible.value.map(e => positions.value[e.index] ?? 0)
  const { index, t } = positionForPct(pct, pcts)
  if (index >= 0) cursor.scrollToPosition(index, t)
}

/* -- jumps from the ruler -- */
function jump(sortedIndex: number): void {
  const pos = positionOf(sortedIndex)
  // An entry hidden by the current filter is not a jump target (its tick is
  // dimmed and inert); the ruler click already lands on the nearest visible
  // one. Never clear a reader's filters behind their back.
  if (pos < 0) return
  cursor.scrollToIndex(pos, reduced.value ? 'auto' : 'smooth')
}

onMounted(() => {
  reduced.value = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  measureChrono()
  window.addEventListener('resize', measureChrono)
  cursor.onUserScroll(() => { follow.value = false })
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measureChrono)
})

const { refs } = useWikiResolve(() => props.events.flatMap(e => e.entities ?? []))

/** True when this entry opens a new year within its chapter — it gets the spine's year label. */
function opensYear(chapter: Chapter<Indexed>, i: number): boolean {
  if (i === 0) return true
  return yearOf(chapter.events[i]!.date) !== yearOf(chapter.events[i - 1]!.date)
}
</script>

<template>
  <div
    v-if="props.events.length"
    ref="root"
    class="ufo-timeline my-8"
    :style="{ '--chrono-h': `${chronoHeight}px` }"
  >
    <WikiTimelineChronometer
      :scale="scale"
      :ticks="ticks"
      :bands="bands"
      :hinges="hinges"
      :marks="marks"
      :cursor-pct="cursorPct"
      :year="yearReadout"
      :era-label="readingChapter?.label ?? ''"
      :era-range="readingChapter ? chapterRange(readingChapter) : ''"
      :era-ordinal="readingChapter?.kind === 'era' ? readingChapter.ordinal : 0"
      :era-count="eraCount"
      :reading-index="readingIndex"
      :now-index="nowIndex"
      :now-pct="nowPct"
      :now-title="nowEntry?.title ?? ''"
      :now-clock="nowClock"
      :playing="clock.playing.value"
      :has-video="clock.isThisVideo.value"
      :can-sync="canSync"
      :follow="follow"
      :shown="visible.length"
      :total="props.events.length"
      :filtered="filtered"
      :help="props.help"
      @jump="jump"
      @sync="sync"
      @scrub="scrub"
      @update:follow="follow = $event"
    >
      <template #filters>
        <div class="flex flex-wrap items-center gap-1.5">
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
        </div>
      </template>
    </WikiTimelineChronometer>

    <p v-if="!visible.length" class="mt-8 font-sans text-[14px] text-muted-foreground">
      No entries match these filters.
    </p>

    <!--
      No enter/leave list animation on filter changes: both a per-item
      `TransitionGroup` and a list-level keyed `<Transition mode="out-in">`
      were tried and each left the rendered list stuck out of sync with the
      reactive filter state. Filtering swaps instantly; the ruler's tick
      dimming carries the feedback.
    -->
    <section
      v-for="chapter in chapters"
      :key="chapter.key"
      class="ufo-chapter"
      :class="`is-${chapter.kind}`"
      :aria-labelledby="`chapter-${chapter.key}`"
    >
      <header class="ufo-chapter-head">
        <div v-if="chapterKicker(chapter) || chapterRange(chapter)" class="ufo-chapter-kicker">
          <span v-if="chapterKicker(chapter)">{{ chapterKicker(chapter) }}</span>
          <span v-if="chapterKicker(chapter) && chapterRange(chapter)" class="ufo-chapter-kicker-sep" aria-hidden="true">·</span>
          <span v-if="chapterRange(chapter)">{{ chapterRange(chapter) }}</span>
        </div>
        <h3 :id="`chapter-${chapter.key}`" class="ufo-chapter-title">
          {{ chapter.label }}
        </h3>
        <p v-if="chapter.summary" class="ufo-chapter-summary">
          {{ chapter.summary }}
        </p>
        <div class="ufo-chapter-meta">
          <span>{{ chapterMeta(chapter) }}</span>
          <span v-if="chapter.estimate" class="ufo-chapter-estimate">
            Estimate of the situation: {{ chapter.estimate }}
          </span>
          <a v-if="chapter.anchor" :href="`#${chapter.anchor}`" class="ufo-chapter-link">
            Read the analysis
            <ArrowDown class="size-3" aria-hidden="true" />
          </a>
        </div>
      </header>

      <ol class="ufo-rail">
        <li
          v-for="(event, i) in chapter.events"
          :id="`chrono-${event.index}`"
          :key="`${event.date}-${event.title}-${event.index}`"
          v-reveal="revealArmed ? { delay: (i % 4) * 40 } : false"
          class="ufo-entry"
          :class="{
            'is-major': event.significance === 'major',
            'is-minor': event.significance === 'minor',
            'is-passed': positionOf(event.index) < cursor.index.value,
            'is-active': positionOf(event.index) === cursor.index.value,
            'is-now': event.index === nowIndex,
          }"
          :style="{
            '--t': positionOf(event.index) === cursor.index.value ? cursor.t.value : 0,
            '--entry-mark': timelineMark(event.category),
            '--entry-border': timelineBorder(event.category),
            '--entry-surface': timelineSurface(event.category),
            '--entry-surface-hover': timelineSurfaceHover(event.category),
          }"
        >
          <span class="ufo-spine-node" aria-hidden="true" />
          <span v-if="opensYear(chapter, i)" class="ufo-spine-year" aria-hidden="true">
            {{ yearOf(event.date) ?? '' }}
          </span>

          <article class="ufo-entry-card">
            <!-- Category marker: icon + one-word label, full-strength mark colour
                 with a neutral hairline so its shape reads even for hues that
                 can't clear 3:1 against the card. This IS the legend. -->
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div class="ufo-entry-cat">
                <span class="ufo-entry-cat-icon-wrap" aria-hidden="true">
                  <component :is="categoryIcon(event.category)" class="ufo-entry-cat-icon" />
                </span>
                <span class="ufo-entry-cat-label">{{ timelineLabel(event.category) }}</span>
              </div>
              <span v-if="event.index === nowIndex" class="ufo-now-tag">
                <span class="ufo-now-tag-dot" aria-hidden="true" />
                Now discussing
              </span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-2">
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
            <h4 class="ufo-entry-title mt-1 font-display text-foreground">
              {{ event.title }}
            </h4>
            <p v-if="event.summary" class="ufo-entry-summary mt-1 font-sans text-foreground">
              {{ event.summary }}
            </p>
            <div v-if="event.entities?.length" class="ufo-entry-entities mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
              <WikiEntityLink
                v-for="name in event.entities"
                :key="name"
                :name="name"
                :ref-data="refs.get(name.trim())"
              />
            </div>
          </article>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
@reference "../../assets/css/main.css";

/* -- filter chips -- the popover row doubles as the category legend --
 * Text colour is always `--foreground`/`--muted-foreground`, never the
 * category mark itself (that pattern fails 4.5:1 for Concepts/Videos in
 * light+sepia — see WikiEntityLink). Category comes through the dot swatch
 * plus, when active, the border/surface tint. The active cue keeps a
 * NON-colour signal too (font-weight + underline). */
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

/* -- chapters -- the "moments of scale" between the reading -- */
.ufo-chapter {
  margin-top: 44px;
}
.ufo-chapter.is-decade {
  margin-top: 28px;
}
.ufo-chapter-head {
  margin-bottom: 18px;
  /* Land below the pinned chronometer on anchor jumps. */
  scroll-margin-top: calc(var(--chrono-h, 0px) + 12px);
}
.ufo-chapter-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: hsl(var(--primary));
}
.ufo-chapter-kicker-sep {
  color: hsl(var(--muted-foreground));
}
.ufo-chapter-title {
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.005em;
  color: hsl(var(--foreground));
  text-wrap: balance;
}
.ufo-chapter.is-decade .ufo-chapter-title {
  font-size: clamp(24px, 3vw, 30px);
}
.ufo-chapter-summary {
  margin-top: 10px;
  max-width: 60ch;
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 24px;
  color: hsl(var(--muted-foreground));
  text-wrap: pretty;
}
.ufo-chapter-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 10px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-chapter-estimate {
  color: hsl(var(--foreground));
}
.ufo-chapter-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  color: hsl(var(--foreground));
  background: hsl(var(--primary) / 0.08);
  text-decoration: none;
  transition: border-color var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard);
}
.ufo-chapter-link:hover {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.16);
}
.ufo-chapter-link :deep(svg) {
  color: hsl(var(--primary));
}

/* -- the rail and its spine --
 * The <ol> carries a class, so the page's prose list rules (scoped to
 * `ol:not([class])`) never reach it. */
.ufo-rail {
  --spine-x: 56px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0 0 0 76px;
  list-style: none;
}
/* The track: one hairline the full height of the chapter. */
.ufo-rail::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--spine-x);
  width: 2px;
  background: hsl(var(--border));
}
.ufo-entry {
  position: relative;
  scroll-margin-top: calc(var(--chrono-h, 0px) + 12px);
}
/* The lit segment for this entry: full once passed, partial while it is
   the entry being read (`--t` is the reading line's progress toward the
   next entry). Its top overlaps the gap above so segments join up. */
.ufo-entry::before {
  content: '';
  position: absolute;
  top: -10px;
  bottom: 0;
  left: calc(var(--spine-x) - 76px);
  width: 2px;
  background: linear-gradient(
    hsl(var(--foreground) / 0.55) calc(var(--t, 0) * 100%),
    transparent calc(var(--t, 0) * 100%)
  );
  opacity: 0;
  transition: opacity var(--dur-base) var(--ease-standard);
}
.ufo-entry.is-passed::before,
.ufo-entry.is-active::before {
  opacity: 1;
}
.ufo-entry.is-passed::before {
  background: hsl(var(--foreground) / 0.55);
}
.ufo-spine-node {
  position: absolute;
  top: 16px;
  left: calc(var(--spine-x) - 76px - 4px);
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: hsl(var(--background));
  border: 2px solid hsl(var(--border));
  transition: background-color var(--dur-base) var(--ease-standard),
    border-color var(--dur-base) var(--ease-standard),
    transform var(--dur-base) var(--ease-standard),
    box-shadow var(--dur-base) var(--ease-standard);
}
.ufo-entry.is-passed .ufo-spine-node {
  background: var(--entry-mark);
  border-color: hsl(var(--background));
  box-shadow: 0 0 0 1px hsl(var(--border));
}
.ufo-entry.is-active .ufo-spine-node {
  background: var(--entry-mark);
  border-color: hsl(var(--foreground));
  transform: scale(1.3);
}
.ufo-entry.is-now .ufo-spine-node {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.25);
}
.ufo-spine-year {
  position: absolute;
  top: 14px;
  left: -76px;
  width: 44px;
  text-align: right;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  color: hsl(var(--muted-foreground));
  transition: color var(--dur-base) var(--ease-standard);
}
.ufo-entry.is-active .ufo-spine-year,
.ufo-entry.is-passed .ufo-spine-year {
  color: hsl(var(--foreground));
}

/* -- entry cards -- category-tinted surface + coloured left rule for major
   entries; the quieter significances sit on the plain card surface so the
   majors set the pacing of a chapter. */
.ufo-entry-card {
  border: 1px solid hsl(var(--border));
  border-left: 3px solid var(--entry-border);
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  padding: 12px 16px 14px;
  transition: background-color var(--dur-base) var(--ease-standard),
    border-color var(--dur-base) var(--ease-standard),
    box-shadow var(--dur-base) var(--ease-standard),
    transform var(--dur-base) var(--ease-standard);
}
.ufo-entry-card:hover {
  background: var(--entry-surface-hover);
  box-shadow: 0 4px 14px hsl(0 0% 0% / 0.08);
  transform: translateY(-2px);
}
.ufo-entry.is-major .ufo-entry-card {
  border-left-width: 6px;
  background: var(--entry-surface);
}
.ufo-entry.is-active .ufo-entry-card {
  box-shadow: 0 0 0 1px hsl(var(--foreground) / 0.18);
}
.ufo-entry.is-now .ufo-entry-card {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.5), 0 0 18px hsl(var(--primary) / 0.16);
}

.ufo-entry-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}
.ufo-entry.is-major .ufo-entry-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 26px;
}
.ufo-entry.is-minor .ufo-entry-title {
  font-size: 16px;
  line-height: 22px;
}
.ufo-entry-summary {
  font-size: 14px;
  line-height: 24px;
}
.ufo-entry.is-major .ufo-entry-summary {
  font-size: 15px;
  line-height: 25px;
}
.ufo-entry.is-minor .ufo-entry-summary {
  font-size: 13.5px;
  line-height: 21px;
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

.ufo-now-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 7px 1px 6px;
  border: 1px solid hsl(var(--primary));
  border-radius: var(--radius-sm);
  background: hsl(var(--primary) / 0.1);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
}
.ufo-now-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: hsl(var(--primary));
  animation: ufo-live-pulse 2s ease-in-out infinite;
}

/*
 * Date label and .ufo-major-badge text: `--foreground`, NOT
 * `--muted-foreground`. Measured on the card's `--entry-surface` tint,
 * `--muted-foreground` fails 4.5:1 for every timeline category in `light`
 * and `sepia`. `--foreground` is used instead; the date/badge stay visually
 * secondary by size rather than by colour.
 */
.ufo-entry-date {
  color: hsl(var(--foreground));
}

/* -- category marker: icon + one-word label, the card's own legend. -- */
.ufo-entry-cat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.ufo-entry-cat-icon-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: var(--radius-sm);
  border: 1px solid hsl(var(--border));
}
.ufo-entry-cat-icon {
  width: 10px;
  height: 10px;
  color: var(--entry-mark);
}
.ufo-entry-cat-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
}

@media (max-width: 640px) {
  .ufo-rail {
    --spine-x: 9px;
    padding-left: 26px;
  }
  .ufo-entry::before {
    left: calc(var(--spine-x) - 26px);
  }
  .ufo-spine-node {
    left: calc(var(--spine-x) - 26px - 4px);
  }
  .ufo-spine-year {
    display: none;
  }
  .ufo-chapter-title {
    font-size: 26px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-entry-card,
  .ufo-spine-node,
  .ufo-spine-year,
  .ufo-entry::before {
    transition: none;
  }
  .ufo-entry-card:hover {
    transform: none;
    box-shadow: none;
  }
  .ufo-entry.is-active .ufo-spine-node {
    transform: none;
  }
  .ufo-now-tag-dot {
    animation: none;
  }
}
</style>
