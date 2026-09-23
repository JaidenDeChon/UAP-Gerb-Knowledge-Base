<script setup lang="ts">
import type { AxisTick, EraBand, TimeScale } from '@/utils/timeline'
import { Crosshair, Info, Radio, SlidersHorizontal } from '@lucide/vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getScrollContainer } from '@/composables/useScrollRestore'

/**
 * The timeline's pinned instrument (auto-imported as `WikiTimelineChronometer`
 * — this file lives in `components/wiki/`, so Nuxt folds the directory into
 * the name; see docs/wiki-components.md gotcha 3).
 *
 * Row one is the readout: the year under the reader's eye, the era it
 * belongs to, and — while the page's video plays — where the host is. Row
 * two is the ruler: a proportional axis from the first era or event to the
 * last, with era bands, one tick per entry (category colour, height by
 * significance, same-year clusters stacked into lanes), a reading cursor
 * that glides as the reader scrolls, and a playhead that snaps to the entry
 * the video is discussing. Everything here is drawn from percentages the
 * parent computes; the only DOM work is the pin sentinel.
 */

export interface RulerMark {
  /** Index into the parent's sorted event list. */
  index: number
  pct: number
  lane: number
  mark: string
  significance: string
  title: string
  date: string
  /** Filtered out by the current category / major-only filter. */
  hidden: boolean
}

export interface RulerHinge { year: number, label: string, pct: number }

const props = withDefaults(
  defineProps<{
    scale: TimeScale
    ticks: AxisTick[]
    bands: EraBand[]
    hinges?: RulerHinge[]
    marks: RulerMark[]
    /** Reading cursor position along the ruler, 0–100. */
    cursorPct: number
    /** Year under the reading line (interpolated), or null before any entry. */
    year: number | null
    eraLabel: string
    eraRange: string
    /** 1-based era ordinal and count for the kicker; 0 hides it. */
    eraOrdinal: number
    eraCount: number
    /** Sorted index of the entry at the reading line, or -1. */
    readingIndex: number
    /** Sorted index of the entry the video is discussing, or -1. */
    nowIndex: number
    nowPct: number | null
    nowTitle: string
    nowClock: string
    playing: boolean
    /** The dock currently holds this page's video. */
    hasVideo: boolean
    /** A Sync is possible: the page has a video and the reading entry has a cue. */
    canSync: boolean
    follow: boolean
    shown: number
    total: number
    filtered: boolean
    help?: string
  }>(),
  { hinges: () => [], help: '' },
)

const emit = defineEmits<{
  /** Scroll the reading surface to this sorted index. */
  jump: [index: number]
  /** Seek the video to the reading entry. */
  sync: []
  'update:follow': [value: boolean]
}>()

/* ------------------------------------------------------------- pinned -- */

// A 1px sentinel just above the sticky bar leaves the viewport exactly when
// the bar pins; that flips the hairline/blur on and tells the page's
// reading-progress line to dim. The sentinel alone can't say when the bar
// unpins at the far end, though: once the reader scrolls past the whole
// timeline it is still above the top, which left the progress line hidden
// for the rest of the page. So the timeline block is observed too, and the
// bar only counts as pinned while that block is still on screen.
const sentinel = ref<HTMLElement | null>(null)
const pinned = useState<boolean>('ufo:chronometerPinned', () => false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  const mark = sentinel.value
  if (!mark || typeof IntersectionObserver === 'undefined') return
  // The chronometer renders straight into the timeline's root element.
  const block = mark.parentElement
  // Observe against the scrolling <main>, not the viewport: <main> starts
  // below the 56px top bar and clips the sentinel at its own edge, so a
  // viewport-rooted observer would see the sentinel leave at top ≈ 55px and
  // conclude "not pinned" for a slow scroll while a fast one crossed 0.
  const root = getScrollContainer() ?? mark.closest('main') ?? null
  let sentinelAbove = false
  let blockOnScreen = true
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === mark) {
        sentinelAbove = !entry.isIntersecting
          && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)
      }
      else {
        blockOnScreen = entry.isIntersecting
      }
    }
    pinned.value = sentinelAbove && blockOnScreen
  }, { root, threshold: 0 })
  observer.observe(mark)
  if (block) observer.observe(block)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  pinned.value = false
})

/* -------------------------------------------------------------- ruler -- */

const ruler = ref<HTMLElement | null>(null)

const visibleMarks = computed(() => props.marks.filter(m => !m.hidden))

/** Nearest visible mark to a ruler x-position (0–100). */
function nearestMark(pct: number): RulerMark | null {
  let best: RulerMark | null = null
  let bestDist = Infinity
  for (const mark of visibleMarks.value) {
    const d = Math.abs(mark.pct - pct)
    if (d < bestDist) {
      bestDist = d
      best = mark
    }
  }
  return best
}

/**
 * A click (not pointerdown): the bar is the topmost strip on a phone, and a
 * vertical swipe that starts on it must scroll the page, not teleport it to
 * whatever tick happened to be under the thumb.
 */
function onRulerClick(event: MouseEvent): void {
  if (!ruler.value) return
  const rect = ruler.value.getBoundingClientRect()
  if (rect.width <= 0) return
  const pct = ((event.clientX - rect.left) / rect.width) * 100
  const mark = nearestMark(pct)
  if (mark) emit('jump', mark.index)
}

function step(delta: number): void {
  const list = visibleMarks.value
  if (!list.length) return
  const at = list.findIndex(m => m.index === props.readingIndex)
  const next = Math.min(list.length - 1, Math.max(0, (at < 0 ? 0 : at) + delta))
  emit('jump', list[next]!.index)
}

function onRulerKey(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      event.preventDefault()
      step(-1)
      break
    case 'ArrowRight':
    case 'ArrowUp':
      event.preventDefault()
      step(1)
      break
    case 'PageDown':
      event.preventDefault()
      step(-5)
      break
    case 'PageUp':
      event.preventDefault()
      step(5)
      break
    case 'Home':
      event.preventDefault()
      if (visibleMarks.value.length) emit('jump', visibleMarks.value[0]!.index)
      break
    case 'End':
      event.preventDefault()
      if (visibleMarks.value.length) emit('jump', visibleMarks.value.at(-1)!.index)
      break
    case 'Enter':
    case ' ':
      if (props.canSync) {
        event.preventDefault()
        emit('sync')
      }
      break
  }
}

const readingMark = computed(() => props.marks.find(m => m.index === props.readingIndex) ?? null)
const sliderText = computed(() => {
  const m = readingMark.value
  if (!m) return 'No entry'
  const position = visibleMarks.value.findIndex(v => v.index === m.index) + 1
  return `${m.date} — ${m.title} (entry ${position} of ${visibleMarks.value.length}${props.eraLabel ? `, ${props.eraLabel}` : ''})`
})
const sliderNow = computed(() => Math.max(0, visibleMarks.value.findIndex(v => v.index === props.readingIndex)))

/** A band label only fits when the band has some room. */
function bandLabelFits(band: EraBand): boolean {
  return band.pctTo - band.pctFrom >= 9
}

const kicker = computed(() => (props.eraOrdinal > 0 && props.eraCount > 0
  ? `Era ${String(props.eraOrdinal).padStart(2, '0')} / ${String(props.eraCount).padStart(2, '0')}`
  : ''))
</script>

<template>
  <div ref="sentinel" class="ufo-chrono-sentinel" aria-hidden="true" />
  <div
    class="ufo-chrono"
    :class="{ 'is-pinned': pinned, 'is-live': playing }"
    role="region"
    aria-label="Chronology position"
    :style="{ '--cursor': `${cursorPct}%`, '--now': nowPct === null ? '0%' : `${nowPct}%` }"
  >
    <div class="ufo-chrono-row">
      <!-- No transition on the digits: the year is interpolated as the reader
           scrolls, so it changes every few frames, and an out-in swap would
           leave the readout blank for most of a continuous scroll. -->
      <div class="ufo-chrono-year" aria-hidden="true">
        <span class="ufo-chrono-year-digits">{{ year ?? '—' }}</span>
      </div>

      <div class="ufo-chrono-era">
        <span v-if="kicker" class="ufo-chrono-kicker">{{ kicker }}</span>
        <span class="ufo-chrono-era-label">{{ eraLabel }}</span>
        <span v-if="eraRange" class="ufo-chrono-era-range">{{ eraRange }}</span>
      </div>

      <div v-if="hasVideo" class="ufo-chrono-now">
        <span class="ufo-chrono-live-dot" aria-hidden="true" />
        <span class="ufo-chrono-now-clock" aria-hidden="true">{{ nowClock }}</span>
        <span class="ufo-chrono-now-title" aria-hidden="true">{{ nowIndex >= 0 ? nowTitle : (playing ? 'Before the first entry' : 'Paused') }}</span>
        <!-- The spoken version changes only when the host reaches a new entry —
             never once a second with the clock. -->
        <span class="sr-only" aria-live="polite" aria-atomic="true">{{ nowIndex >= 0 ? `Now discussing ${nowTitle}` : '' }}</span>
      </div>

      <div class="ufo-chrono-actions">
        <button
          v-if="canSync"
          type="button"
          class="ufo-chrono-btn"
          title="Seek the video to the entry you are reading"
          @click="emit('sync')"
        >
          <Crosshair class="size-3.5" aria-hidden="true" />
          <span>Sync</span>
        </button>
        <button
          v-if="hasVideo"
          type="button"
          class="ufo-chrono-btn"
          :class="{ 'is-on': follow }"
          role="switch"
          :aria-checked="follow"
          title="Let the video scroll the page to the entry it is discussing"
          @click="emit('update:follow', !follow)"
        >
          <Radio class="size-3.5" aria-hidden="true" />
          <span>Follow</span>
        </button>

        <Popover>
          <PopoverTrigger as-child>
            <button type="button" class="ufo-chrono-btn" :class="{ 'is-on': filtered }" aria-label="Filter entries">
              <SlidersHorizontal class="size-3.5" aria-hidden="true" />
              <span class="ufo-chrono-count">{{ shown }}<span class="ufo-chrono-count-sep">/</span>{{ total }}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" :side-offset="8" class="ufo-chrono-pop w-auto max-w-[min(92vw,420px)]">
            <slot name="filters" />
          </PopoverContent>
        </Popover>

        <Popover v-if="help">
          <PopoverTrigger as-child>
            <button type="button" class="ufo-chrono-btn ufo-chrono-btn--icon" aria-label="How to read this timeline">
              <Info class="size-3.5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="end" :side-offset="8" class="w-80 text-[13px] leading-5">
            {{ help }}
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <div
      ref="ruler"
      class="ufo-ruler"
      role="slider"
      tabindex="0"
      aria-label="Chronology ruler"
      aria-orientation="horizontal"
      :aria-valuemin="0"
      :aria-valuemax="Math.max(0, visibleMarks.length - 1)"
      :aria-valuenow="sliderNow"
      :aria-valuetext="sliderText"
      @click="onRulerClick"
      @keydown="onRulerKey"
    >
      <div
        v-for="(band, i) in bands"
        :key="band.label"
        class="ufo-ruler-band"
        :class="{ 'is-alt': i % 2 === 1, 'is-current': band.label === eraLabel }"
        :style="{ left: `${band.pctFrom}%`, width: `${band.pctTo - band.pctFrom}%` }"
        aria-hidden="true"
      >
        <span v-if="bandLabelFits(band)" class="ufo-ruler-band-label">{{ band.label }}</span>
      </div>

      <div
        v-for="tick in ticks"
        :key="tick.year"
        class="ufo-ruler-tick"
        :class="{ 'is-major': tick.major, 'is-odd-decade': tick.major && tick.year % 20 !== 0 }"
        :style="{ left: `${tick.pct}%` }"
        aria-hidden="true"
      >
        <span v-if="tick.major" class="ufo-ruler-tick-label">{{ tick.year }}</span>
      </div>

      <div
        v-for="hinge in hinges"
        :key="hinge.year"
        class="ufo-ruler-hinge"
        :style="{ left: `${hinge.pct}%` }"
        aria-hidden="true"
      >
        <span class="ufo-ruler-hinge-label">{{ hinge.label }}</span>
      </div>

      <div class="ufo-ruler-fill" aria-hidden="true" />

      <!-- Spans, not buttons: `role="slider"` makes its children presentational,
           so buttons here would be stripped from the accessibility tree anyway.
           The slider's own keys and the ruler click (nearest visible entry)
           are the operable paths; these carry the hover title and a shortcut
           click. Hidden (filtered-out) marks are not targets at all. -->
      <span
        v-for="m in marks"
        :key="m.index"
        class="ufo-ruler-mark"
        :class="[
          `is-${m.significance || 'notable'}`,
          {
            'is-hidden': m.hidden,
            'is-passed': m.index <= readingIndex,
            'is-reading': m.index === readingIndex,
            'is-now': m.index === nowIndex,
          },
        ]"
        :style="{ left: `${m.pct}%`, '--mark': m.mark, '--lane': m.lane }"
        :title="m.hidden ? undefined : `${m.date} · ${m.title}`"
        aria-hidden="true"
        @click.stop="!m.hidden && emit('jump', m.index)"
      />

      <div class="ufo-ruler-cursor" aria-hidden="true" />
      <div v-if="nowPct !== null" class="ufo-ruler-playhead" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.ufo-chrono-sentinel {
  height: 1px;
  margin-top: -1px;
}

/* Pinned chrome: the same translucent-blur surface as AppTopBar and the
   previous era heads, so the bar reads as shell, not as a card. The
   inline negative margin lets it bleed to the article's gutters. */
.ufo-chrono {
  position: sticky;
  top: 0;
  z-index: 10;
  margin-inline: -16px;
  padding: 8px 16px 6px;
  background: hsl(var(--background) / 0.93);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid transparent;
  transition: border-color var(--dur-base) var(--ease-standard);
}
.ufo-chrono.is-pinned {
  border-bottom-color: hsl(var(--border));
}

/* -- row one: readouts -- */
.ufo-chrono-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 40px;
}
.ufo-chrono-year {
  flex: none;
  min-width: 4ch;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--foreground));
}
.ufo-chrono-year-digits {
  display: inline-block;
}

.ufo-chrono-era {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}
.ufo-chrono-kicker,
.ufo-chrono-era-range {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
.ufo-chrono-era-label {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.02em;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ufo-chrono-now {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: hsl(var(--foreground));
}
.ufo-chrono-live-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: hsl(var(--muted-foreground));
}
.ufo-chrono.is-live .ufo-chrono-live-dot {
  background: hsl(var(--primary));
  animation: ufo-live-pulse 2s ease-in-out infinite;
}
.ufo-chrono-now-clock {
  flex: none;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.ufo-chrono-now-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
}

.ufo-chrono-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.ufo-chrono-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-sm);
  background: hsl(var(--card) / 0.6);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-standard),
    border-color var(--dur-fast) var(--ease-standard),
    background-color var(--dur-fast) var(--ease-standard);
}
.ufo-chrono-btn:hover {
  border-color: hsl(var(--primary));
}
.ufo-chrono-btn.is-on {
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.12);
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ufo-chrono-btn--icon {
  width: 26px;
  padding: 0;
  justify-content: center;
}
.ufo-chrono-btn :deep(svg) {
  color: hsl(var(--primary));
}
.ufo-chrono-count-sep {
  opacity: 0.5;
  padding-inline: 1px;
}

/* -- row two: the ruler -- */
.ufo-ruler {
  position: relative;
  height: 52px;
  margin-top: 6px;
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
  /* baseline sits 14px up, leaving room for decade labels beneath it */
  --baseline: 14px;
}
.ufo-ruler:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.ufo-ruler-band {
  position: absolute;
  top: 0;
  bottom: var(--baseline);
  background: hsl(var(--foreground) / 0.04);
  border-left: 1px solid hsl(var(--border));
  transition: background-color var(--dur-slow) var(--ease-standard);
  overflow: hidden;
}
.ufo-ruler-band.is-alt {
  background: hsl(var(--foreground) / 0.075);
}
.ufo-ruler-band.is-current {
  background: hsl(var(--primary) / 0.13);
}
.ufo-ruler-band-label {
  position: absolute;
  top: 2px;
  left: 5px;
  max-width: calc(100% - 8px);
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  /* --foreground, not --muted-foreground: on the tinted bands the muted
     token measures 3.9–4.0:1 in light and sepia. Secondary by size instead. */
  color: hsl(var(--foreground));
  opacity: 0.85;
  white-space: nowrap;
}

.ufo-ruler-tick {
  position: absolute;
  bottom: var(--baseline);
  width: 1px;
  height: 4px;
  background: hsl(var(--border));
  transform: translateX(-0.5px);
}
.ufo-ruler-tick.is-major {
  height: 7px;
  background: hsl(var(--muted-foreground) / 0.6);
}
.ufo-ruler-tick-label {
  position: absolute;
  top: 9px;
  left: 0;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
}

.ufo-ruler-hinge {
  position: absolute;
  top: 0;
  bottom: var(--baseline);
  width: 0;
  border-left: 1px dashed hsl(var(--foreground) / 0.45);
}
.ufo-ruler-hinge-label {
  position: absolute;
  top: 2px;
  right: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

/* The rail that draws itself: a baseline that fills up to the reading cursor. */
.ufo-ruler-fill {
  position: absolute;
  left: 0;
  bottom: calc(var(--baseline) - 1px);
  height: 2px;
  width: var(--cursor);
  background: hsl(var(--foreground) / 0.55);
}
.ufo-ruler::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--baseline) - 1px);
  height: 1px;
  background: hsl(var(--border));
}

/* Entry ticks: category colour, height by significance, stacked by lane.
   The hit area is a transparent 18px-wide column so the 2px stroke never has
   to be the target. A 1px --border halo keeps every hue's shape legible on
   every theme, the same reasoning as the card's category icon wrap. */
.ufo-ruler-mark {
  position: absolute;
  bottom: var(--baseline);
  z-index: 1;
  display: block;
  width: 18px;
  height: calc(var(--h) + var(--lane) * 7px + 4px);
  transform: translateX(-50%);
  cursor: pointer;
  --h: 10px;
}
.ufo-ruler-mark.is-hidden {
  pointer-events: none;
}
.ufo-ruler-mark::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(var(--lane) * 7px);
  width: 3px;
  height: var(--h);
  transform: translateX(-50%);
  background: var(--mark);
  border-radius: 1px;
  box-shadow: 0 0 0 1px hsl(var(--border));
  opacity: 0.55;
  transition: opacity var(--dur-base) var(--ease-standard), height var(--dur-fast) var(--ease-standard);
}
.ufo-ruler-mark.is-major { --h: 16px; }
.ufo-ruler-mark.is-major::before { width: 4px; }
.ufo-ruler-mark.is-minor { --h: 7px; }
.ufo-ruler-mark.is-passed::before { opacity: 1; }
.ufo-ruler-mark.is-hidden::before { opacity: 0.18; }
.ufo-ruler-mark:hover::before { opacity: 1; height: calc(var(--h) + 3px); }
.ufo-ruler-mark.is-reading::before {
  opacity: 1;
  box-shadow: 0 0 0 1px hsl(var(--foreground));
}
.ufo-ruler-mark.is-now::before {
  opacity: 1;
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.7);
}

/* Reading cursor: a hairline with an upward triangle at the baseline. */
.ufo-ruler-cursor {
  position: absolute;
  top: 0;
  bottom: var(--baseline);
  left: var(--cursor);
  width: 0;
  border-left: 1px solid hsl(var(--foreground));
  pointer-events: none;
  z-index: 2;
}
.ufo-ruler-cursor::after {
  content: '';
  position: absolute;
  left: -4px;
  bottom: -5px;
  border: 4px solid transparent;
  border-bottom-color: hsl(var(--foreground));
  border-top: 0;
}

/* Video playhead: the one green thing on the ruler, snapping between cues. */
.ufo-ruler-playhead {
  position: absolute;
  top: 0;
  bottom: var(--baseline);
  left: var(--now);
  width: 0;
  border-left: 2px solid hsl(var(--primary));
  pointer-events: none;
  z-index: 3;
  transition: left var(--dur-slow) var(--ease-out);
}
.ufo-ruler-playhead::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -5px;
  border: 4px solid transparent;
  border-top: 5px solid hsl(var(--primary));
  border-bottom: 0;
}
.ufo-chrono.is-live .ufo-ruler-playhead {
  box-shadow: 0 0 10px hsl(var(--primary) / 0.5);
}

/* -- mobile -- */
@media (max-width: 640px) {
  .ufo-chrono {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: hsl(var(--background) / 0.96);
  }
  .ufo-chrono-row {
    gap: 10px;
    min-height: 34px;
  }
  .ufo-chrono-year {
    font-size: 22px;
  }
  .ufo-chrono-kicker,
  .ufo-chrono-era-range {
    display: none;
  }
  .ufo-chrono-era-label {
    font-size: 12px;
  }
  .ufo-chrono-now-title {
    display: none;
  }
  .ufo-chrono-now {
    flex: 1 1 48px;
    overflow: hidden;
  }
  .ufo-chrono-era {
    flex: 0 1 auto;
  }
  .ufo-chrono-btn > span:not(.ufo-chrono-count) {
    display: none;
  }
  .ufo-ruler-hinge-label {
    display: none;
  }
  .ufo-chrono-btn {
    padding: 0 6px;
  }
  .ufo-ruler {
    height: 42px;
  }
  .ufo-ruler-band-label {
    display: none;
  }
  .ufo-ruler-tick.is-odd-decade .ufo-ruler-tick-label {
    display: none;
  }
  .ufo-ruler-mark::before {
    width: 2px;
  }
  .ufo-ruler-mark.is-major::before {
    width: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ufo-ruler-playhead,
  .ufo-ruler-mark::before,
  .ufo-ruler-band {
    transition: none;
  }
  .ufo-chrono.is-live .ufo-chrono-live-dot {
    animation: none;
  }
}
</style>
