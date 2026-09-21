/**
 * Pure helpers behind `WikiTimeline` — date parsing, the proportional time
 * scale for the era axis, era/decade bookkeeping and the "which entry is the
 * video discussing" lookup. No DOM, no Vue: everything here is unit-tested in
 * `timeline.test.ts` and the component only wires results to markup.
 */

export interface TimelineEvent {
  date: string
  title: string
  summary?: string
  category?: string
  entities?: string[]
  significance?: string
  /** Seconds into the page's video where this entry is discussed. */
  cue?: number
  cueApprox?: boolean
  /**
   * Force this entry into the era with this `id` (or `label`) when its year
   * alone is ambiguous — e.g. two 1994 entries where one closes an era and
   * the next opens the following one.
   */
  era?: string
}

/** An authored era: a labelled span of years the video itself frames. */
export interface TimelineEra {
  /** Optional key `TimelineEvent.era` can point at; falls back to `label`. */
  id?: string
  label: string
  from: number
  /** Inclusive end year; omit for "to the present" (the scale's max year). */
  to?: number
  /** One-line description shown under the era's chapter heading. */
  summary?: string
  /** The video's "estimate of the situation" for this era, if it names one. */
  estimate?: string
  /** Id of a heading elsewhere on the page that analyses this era. */
  anchor?: string
}

/** A single labelled year on the axis that marks a turning point without opening an era. */
export interface TimelineHinge {
  year: number
  label: string
}

/**
 * Leading 4-digit year, including for `c.`-prefixed circa dates (e.g.
 * "c. 1980s" -> 1980, so it groups into the 1980s era, not a catch-all).
 * Null only when no year can be parsed at all (e.g. "Unknown").
 */
export function yearOf(date: string): number | null {
  const m = /^\s*(?:c\.\s*)?(\d{4})/.exec(date)
  return m ? Number(m[1]) : null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human-readable date: "1947-07-08" -> "8 Jul 1947"; passes vague dates through. */
export function formatDate(date: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (full) return `${Number(full[3])} ${MONTHS[Number(full[2]) - 1]} ${full[1]}`
  const ym = /^(\d{4})-(\d{2})$/.exec(date)
  if (ym) return `${MONTHS[Number(ym[2]) - 1]} ${ym[1]}`
  return date
}

/**
 * Fractional year for positioning on the axis: "1947-07" -> 1947.5, "1953-05-21"
 * -> ~1953.39. Month/day precision is what separates two events from the same
 * year on a proportional scale; a bare year sits at its midpoint so it never
 * lands exactly on a tick.
 */
export function fractionalYear(date: string): number | null {
  const year = yearOf(date)
  if (year === null) return null
  const m = /^\s*(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(date)
  const month = m?.[2] ? Number(m[2]) : null
  const day = m?.[3] ? Number(m[3]) : null
  if (month === null) return year + 0.5
  const monthFrac = (month - 1) / 12
  const dayFrac = day === null ? 0.5 / 12 : (day - 1) / 31 / 12
  return year + monthFrac + dayFrac
}

/**
 * Stable chronological sort: by year, undated last, authored order as the
 * tiebreaker so same-year entries and undated ones never reshuffle. Returns a
 * new array; the input is never mutated.
 */
export function sortEvents<T extends { date: string }>(events: T[]): T[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const ay = yearOf(a.event.date)
      const by = yearOf(b.event.date)
      const aKey = ay === null ? Number.POSITIVE_INFINITY : ay
      const bKey = by === null ? Number.POSITIVE_INFINITY : by
      if (aKey !== bKey) return aKey - bKey
      return a.index - b.index
    })
    .map(({ event }) => event)
}

export interface TimeScale {
  /** First year on the axis (the earliest event's year, rounded down to a half-decade). */
  min: number
  /** Last year on the axis (the latest event's year, rounded up). */
  max: number
  /** 0–100, where a fractional year lands along the axis. Clamped. */
  pct: (year: number) => number
}

/**
 * The axis runs from just before the first dated event to just after the
 * last, snapped to 5-year boundaries so the edge ticks read as round numbers.
 * A degenerate input (no dated events, or all the same year) still yields a
 * usable ten-year window rather than a divide-by-zero.
 */
export function timeScale(events: Array<{ date: string }>, eras: TimelineEra[] = []): TimeScale {
  const years = events.map(e => fractionalYear(e.date)).filter((y): y is number => y !== null)
  for (const era of eras) {
    years.push(era.from)
    if (typeof era.to === 'number') years.push(era.to)
  }
  if (!years.length) {
    return { min: 0, max: 10, pct: () => 0 }
  }
  let min = Math.floor(Math.min(...years) / 5) * 5
  let max = Math.ceil(Math.max(...years) / 5) * 5
  if (max <= min) max = min + 10
  const span = max - min
  return {
    min,
    max,
    pct: (year: number) => Math.min(100, Math.max(0, ((year - min) / span) * 100)),
  }
}

export interface AxisTick { year: number, pct: number, major: boolean }

/** One tick per 5 years; the decade ticks are `major` and get a label. */
export function axisTicks(scale: TimeScale): AxisTick[] {
  const out: AxisTick[] = []
  const start = Math.ceil(scale.min / 5) * 5
  for (let year = start; year <= scale.max; year += 5) {
    out.push({ year, pct: scale.pct(year), major: year % 10 === 0 })
  }
  return out
}

export interface EraBand extends TimelineEra {
  to: number
  pctFrom: number
  pctTo: number
}

/**
 * Eras as proportional bands. An open-ended era (`to` omitted) runs to the
 * axis end. Bands are clipped to the axis and returned in `from` order.
 */
export function eraBands(eras: TimelineEra[], scale: TimeScale): EraBand[] {
  return [...eras]
    .sort((a, b) => a.from - b.from)
    .map((era) => {
      const to = typeof era.to === 'number' ? era.to : scale.max
      return { ...era, to, pctFrom: scale.pct(era.from), pctTo: scale.pct(to) }
    })
}

/**
 * The era an event belongs to: the last era whose `from` is <= the event's
 * year (eras are treated as half-open on the right, so a 1978 event lands in
 * the era that *starts* in 1978 — the video's own convention, where each era's
 * closing year is the next one's opening year). Events before the first era
 * (or with no year) get null.
 */
export function eraOf(year: number | null, eras: TimelineEra[]): TimelineEra | null {
  if (year === null) return null
  const sorted = [...eras].sort((a, b) => a.from - b.from)
  let hit: TimelineEra | null = null
  for (const era of sorted) {
    if (year >= era.from) hit = era
  }
  if (hit && typeof hit.to === 'number' && year > hit.to) return null
  return hit
}

/**
 * Lane assignment for axis dots so same-year clusters stack instead of
 * overlapping: entries whose axis positions fall within `minGapPct` of a
 * dot already placed in a lane move up to the next free lane. Input order is
 * preserved in the output (one lane per input index).
 */
export function assignLanes(positions: Array<number | null>, minGapPct: number): number[] {
  const laneLast: number[] = []
  return positions.map((pos) => {
    if (pos === null) return 0
    for (let lane = 0; ; lane++) {
      const last = laneLast[lane]
      if (last === undefined || pos - last >= minGapPct) {
        laneLast[lane] = pos
        return lane
      }
    }
  })
}

/**
 * Which entry the video is discussing at `seconds`: the one with the greatest
 * cue at or before the playhead, so a reader following along sees the marker
 * sit on an entry until the narration reaches the next one. -1 before the
 * first cue, when nothing is playing, or when no entry has a cue.
 */
export function nowPlayingIndex(events: Array<{ cue?: number }>, seconds: number | null): number {
  if (seconds === null || !Number.isFinite(seconds)) return -1
  let best = -1
  let bestCue = -Infinity
  events.forEach((event, i) => {
    const cue = event.cue
    if (typeof cue !== 'number' || cue > seconds) return
    if (cue > bestCue) {
      bestCue = cue
      best = i
    }
  })
  return best
}

/** `h:mm:ss` past the first hour, `m:ss` before it (e.g. `16:27` or `1:03:12`). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.trunc(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/* ------------------------------------------------------------ chapters -- */

export type ChapterKind = 'era' | 'before' | 'after' | 'decade' | 'undated'

export interface Chapter<T extends TimelineEvent = TimelineEvent> {
  key: string
  kind: ChapterKind
  label: string
  from: number | null
  to: number | null
  summary?: string
  estimate?: string
  anchor?: string
  /** 1-based position among the era chapters, for the "ERA 02 / 04" kicker. */
  ordinal: number
  events: T[]
}

function eraKey(era: TimelineEra): string {
  return era.id ?? era.label
}

/**
 * Group already-sorted events into reading chapters. With authored eras,
 * each event lands in the era `eraOf` picks for its year — or the one its own
 * `era` field names — with automatic "before the first era" / "after the
 * last era" chapters around them and a trailing "Undated" chapter. With no
 * eras the fallback is one chapter per `decade`-sized bucket, so a page that
 * never authored eras renders exactly as it always has. Only chapters that
 * hold at least one event are returned.
 */
export function chapterize<T extends TimelineEvent>(
  sorted: T[],
  eras: TimelineEra[],
  decade = 10,
): Chapter<T>[] {
  if (!eras.length) {
    const out: Chapter<T>[] = []
    let current: Chapter<T> | null = null
    for (const event of sorted) {
      const year = yearOf(event.date)
      const label = year === null ? 'Undated' : `${Math.floor(year / decade) * decade}s`
      if (!current || current.label !== label) {
        current = {
          key: label,
          kind: year === null ? 'undated' : 'decade',
          label,
          from: year === null ? null : Math.floor(year / decade) * decade,
          to: year === null ? null : Math.floor(year / decade) * decade + decade - 1,
          ordinal: out.length + 1,
          events: [],
        }
        out.push(current)
      }
      current.events.push(event)
    }
    return out
  }

  const ordered = [...eras].sort((a, b) => a.from - b.from)
  const byKey = new Map<string, TimelineEra>()
  for (const era of ordered) {
    byKey.set(eraKey(era), era)
    byKey.set(era.label, era)
  }
  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!

  const buckets = new Map<string, T[]>()
  const push = (key: string, event: T) => {
    const list = buckets.get(key)
    if (list) list.push(event)
    else buckets.set(key, [event])
  }

  for (const event of sorted) {
    const year = yearOf(event.date)
    const forced = event.era ? byKey.get(event.era) : undefined
    const era = forced ?? eraOf(year, ordered)
    if (era) {
      push(eraKey(era), event)
    }
    else if (year === null) {
      push('__undated', event)
    }
    else if (year < first.from) {
      push('__before', event)
    }
    else {
      push('__after', event)
    }
  }

  const out: Chapter<T>[] = []
  const before = buckets.get('__before')
  if (before) {
    out.push({ key: '__before', kind: 'before', label: `Before ${first.label}`, from: null, to: first.from - 1, ordinal: 0, events: before })
  }
  let ordinal = 0
  for (const era of ordered) {
    const events = buckets.get(eraKey(era))
    ordinal += 1
    if (!events) continue
    out.push({
      key: eraKey(era),
      kind: 'era',
      label: era.label,
      from: era.from,
      to: typeof era.to === 'number' ? era.to : null,
      summary: era.summary,
      estimate: era.estimate,
      anchor: era.anchor,
      ordinal,
      events,
    })
  }
  const after = buckets.get('__after')
  if (after) {
    out.push({ key: '__after', kind: 'after', label: `After ${last.label}`, from: (last.to ?? last.from) + 1, to: null, ordinal: 0, events: after })
  }
  const undated = buckets.get('__undated')
  if (undated) {
    out.push({ key: '__undated', kind: 'undated', label: 'Undated', from: null, to: null, ordinal: 0, events: undated })
  }
  return out
}

/* -------------------------------------------------------- reading cursor -- */

export interface Cursor {
  /** Index of the last entry whose top sits at or above the reading line; -1 with no entries. */
  index: number
  /** 0–1, how far the reading line has travelled from that entry toward the next. */
  t: number
}

/**
 * Where the reader is: the last entry whose offset is at or above `y`, plus
 * the fraction of the way to the next entry, so a cursor drawn from this
 * glides across gaps instead of jumping. Before the first entry the cursor
 * sits on entry 0 at t = 0; past the last it sits on the last at t = 0.
 * `offsets` must be ascending.
 */
export function cursorFor(y: number, offsets: number[]): Cursor {
  if (!offsets.length) return { index: -1, t: 0 }
  let lo = 0
  let hi = offsets.length - 1
  let index = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid]! <= y) {
      index = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }
  if (index < 0) return { index: 0, t: 0 }
  const here = offsets[index]!
  const next = offsets[index + 1]
  if (next === undefined || next <= here) return { index, t: 0 }
  return { index, t: Math.min(1, Math.max(0, (y - here) / (next - here))) }
}

/** Linear interpolation, clamped to [a, b] by t in [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t))
  return a + (b - a) * k
}
