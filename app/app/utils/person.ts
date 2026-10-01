import { formatDate, fractionalYear, yearOf } from './timeline'

/**
 * Lifespan and activity for a People page, from optional frontmatter:
 *
 * ```yaml
 * born: "1987"            # YYYY, YYYY-MM, YYYY-MM-DD or "c. 1920"
 * died: "2011-05-03"      # same formats; omit while unknown or living
 * active_from: 2004       # first year the person is active in the record
 * active_to: present      # a year, or "present"
 * ```
 *
 * Nothing here claims a person is alive: with no `died`, the life bar simply
 * runs open-ended to today.
 */
export interface PersonDates {
  born: string | null
  died: string | null
  activeFrom: number | null
  /** A year, `'present'`, or null when only a start is known. */
  activeTo: number | 'present' | null
}

/** A frontmatter date as a trimmed string, or null for blanks and `NA`. */
function dateValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = String(value).trim()
  if (!s || /^(na|n\/a|null|unknown)$/i.test(s)) return null
  return yearOf(s) === null ? null : s
}

function yearValue(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const year = yearOf(String(value))
  return year
}

/** Read the four optional fields, dropping anything that has no year in it. */
export function readPersonDates(read: (key: string) => unknown): PersonDates {
  const rawTo = read('active_to')
  const present = typeof rawTo === 'string' && /^(present|now|today)$/i.test(rawTo.trim())
  return {
    born: dateValue(read('born')),
    died: dateValue(read('died')),
    activeFrom: yearValue(read('active_from')),
    activeTo: present ? 'present' : yearValue(rawTo),
  }
}

export function hasPersonDates(dates: PersonDates): boolean {
  return Boolean(dates.born || dates.died || dates.activeFrom !== null)
}

/** "8 Jul 1947", "Jul 1947", "1987" or "c. 1920", for a frontmatter date. */
export function formatLifeDate(date: string): string {
  return formatDate(date)
}

/**
 * Age at death in whole years, only when both dates are exact to the day:
 * a year-only date could be off by one, and a wrong age is worse than none.
 */
export function ageAtDeath(born: string | null, died: string | null): number | null {
  const a = born && /^(\d{4})-(\d{2})-(\d{2})$/.exec(born)
  const b = died && /^(\d{4})-(\d{2})-(\d{2})$/.exec(died)
  if (!a || !b) return null
  let age = Number(b[1]) - Number(a[1])
  if (Number(b[2]) * 100 + Number(b[3]) < Number(a[2]) * 100 + Number(a[3])) age -= 1
  return age >= 0 ? age : null
}

/** "2004 to 2023", "Since 2004", "From 2004", or null. */
export function activeLabel(dates: PersonDates): string | null {
  const { activeFrom: from, activeTo: to } = dates
  if (from === null) return null
  if (to === 'present') return `Since ${from}`
  if (to === null) return `From ${from}`
  return to === from ? String(from) : `${from} to ${to}`
}

export interface LifeBar {
  /** First and last year on the axis, on decade boundaries. */
  start: number
  end: number
  /** Decade marks to label, as `{ year, pct }`. */
  ticks: { year: number, pct: number }[]
  /** The lifespan, when a birth date is known. `open` when no death date is. */
  life: { from: number, to: number, open: boolean } | null
  /** The active years, when a start is known. `open` when it runs to the present. */
  active: { from: number, to: number, open: boolean } | null
  /** The video coverage window, as percentages, when given. */
  coverage: { from: number, to: number } | null
}

/**
 * Geometry for the at-a-glance bar: percentages along a decade-snapped axis
 * that takes in the life, the active years and (optionally) the span of the
 * videos that cover the person. Null when there's nothing dated to draw.
 */
export function lifeBar(dates: PersonDates, now: number, coverage?: [string, string] | null): LifeBar | null {
  const born = dates.born ? fractionalYear(dates.born) : null
  const died = dates.died ? fractionalYear(dates.died) : null
  const activeFrom = dates.activeFrom
  if (born === null && activeFrom === null) return null

  const activeEnd = dates.activeTo === 'present'
    ? now
    : dates.activeTo ?? activeFrom
  const cover = coverage ? [fractionalYear(coverage[0]), fractionalYear(coverage[1])] : null

  const points = [born, died, activeFrom, activeEnd === null ? null : activeEnd + 1, cover?.[0], cover?.[1]]
    .filter((x): x is number => typeof x === 'number')
  if (born !== null && died === null) points.push(now)

  const start = Math.floor(Math.min(...points) / 10) * 10
  let end = Math.ceil(Math.max(...points) / 10) * 10
  if (end <= start) end = start + 10
  const pct = (year: number): number => Math.min(100, Math.max(0, ((year - start) / (end - start)) * 100))

  const ticks: { year: number, pct: number }[] = []
  const step = end - start > 80 ? 20 : 10
  for (let year = start; year <= end; year += step) ticks.push({ year, pct: pct(year) })

  const life = born === null
    ? null
    : { from: pct(born), to: pct(died ?? now), open: died === null }

  const active = activeFrom === null
    ? null
    : {
        from: pct(activeFrom),
        // An active span is inclusive of its last year: 2004 to 2023 runs to the end of 2023.
        to: pct(dates.activeTo === 'present' ? now : (activeEnd ?? activeFrom) + 1),
        open: dates.activeTo === 'present',
      }

  const covered = cover && cover[0] !== null && cover[1] !== null
    ? { from: pct(cover[0]), to: pct(cover[1]) }
    : null

  return { start, end, ticks, life, active, coverage: covered }
}
