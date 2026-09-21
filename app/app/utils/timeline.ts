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
}

/** An authored era: a labelled span of years the video itself frames. */
export interface TimelineEra {
  label: string
  from: number
  /** Inclusive end year; omit for "to the present" (the scale's max year). */
  to?: number
  /** One-line description shown under the era's chapter heading. */
  summary?: string
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
