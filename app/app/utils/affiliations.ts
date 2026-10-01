/**
 * Pure normalisation and geometry behind `::wiki-affiliations`
 * (WikiAffiliations.vue): where a person worked, served or belonged, and
 * when, drawn as bars on one shared axis of years. No Nuxt runtime, so it is
 * unit-tested directly.
 */
import { formatDate, fractionalYear, yearOf } from './timeline'

export interface AffiliationInput {
  /** A page title, resolved to a link. */
  name?: string
  /** A body with no page, never resolved. */
  text?: string
  /** The person's role or title there. */
  role?: string
  /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  from?: string | number
  /** Same formats, or `present`. Omit when only the start is known. */
  to?: string | number
  /** One line on what they did there. */
  note?: string
  /** True when either end is an estimate: the bar's ends are dashed and the dates say "about". */
  approx?: boolean | string
}

export interface Affiliation {
  key: string
  /** The page title or plain text, as written. */
  label: string
  /** True when `label` is a page title to resolve. */
  linked: boolean
  role: string
  note: string
  approx: boolean
  /** Axis positions, in fractional years. `end` is inclusive of the last year named. */
  start: number
  end: number
  /** True when the bar runs on to the present. */
  ongoing: boolean
  /** True when only a start is known: the bar is a short open-ended stub. */
  openEnded: boolean
  /** "2016 to 2021", "Since 2025", "From 1969", "About 2009 to 2023". */
  span: string
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

function isPresent(value: string): boolean {
  return /^(present|now|today|ongoing)$/i.test(value)
}

/** "2016", "Jul 2022", "8 Jul 1947". */
function shown(date: string): string {
  return formatDate(date)
}

/**
 * Start of a date on the axis: a bare year starts on 1 January (not its
 * midpoint, as a timeline tick would), so "2016 to 2021" spans whole years.
 */
function startOf(date: string): number | null {
  if (/^\d{4}$/.test(date)) return Number(date)
  return fractionalYear(date)
}

/** End of a date on the axis, inclusive: a bare year runs to 31 December. */
function endOf(date: string): number | null {
  if (/^\d{4}$/.test(date)) return Number(date) + 1
  const f = fractionalYear(date)
  return f === null ? null : f + 1 / 12
}

/**
 * Normalise the rows: drop any without a name or a usable start, read
 * `present`, work out the span wording, and sort by start (ties keep the
 * authored order). `now` is the fractional current year, for open spans.
 */
export function buildAffiliations(rows: AffiliationInput[], now: number): { rows: Affiliation[], names: string[] } {
  const out: Affiliation[] = []
  rows.forEach((row, i) => {
    const name = str(row.name)
    const text = str(row.text)
    const label = name || text
    const fromRaw = str(row.from)
    if (!label || !fromRaw || yearOf(fromRaw) === null) return
    const start = startOf(fromRaw)
    if (start === null) return

    const toRaw = str(row.to)
    const ongoing = isPresent(toRaw)
    const toKnown = !ongoing && toRaw !== '' && yearOf(toRaw) !== null
    const openEnded = !ongoing && !toKnown
    let end = ongoing ? now : toKnown ? endOf(toRaw)! : start + 1
    if (end <= start) end = start + 1

    const approx = row.approx === true || str(row.approx).toLowerCase() === 'true'
    const about = approx ? 'About ' : ''
    let span: string
    if (ongoing) span = `${approx ? 'Since about' : 'Since'} ${shown(fromRaw)}`
    else if (openEnded) span = `${approx ? 'From about' : 'From'} ${shown(fromRaw)}`
    else if (shown(fromRaw) === shown(toRaw)) span = `${about}${shown(fromRaw)}`
    else span = `${about}${shown(fromRaw)} to ${shown(toRaw)}`

    out.push({
      key: `${i}:${label}`,
      label,
      linked: Boolean(name),
      role: str(row.role),
      note: str(row.note),
      approx,
      start,
      end,
      ongoing,
      openEnded,
      span,
    })
  })

  const sorted = out
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.start - b.row.start || a.i - b.i)
    .map(x => x.row)

  return { rows: sorted, names: sorted.filter(r => r.linked).map(r => r.label) }
}

export interface AffiliationAxis {
  start: number
  end: number
  ticks: { year: number, pct: number }[]
}

/**
 * The shared axis: snapped out to 5-year marks around every bar (10-year
 * steps when it covers more than 40 years, 20 past 80), so bars never touch
 * the edges.
 */
export function affiliationAxis(rows: Affiliation[]): AffiliationAxis | null {
  if (!rows.length) return null
  const lo = Math.min(...rows.map(r => r.start))
  const hi = Math.max(...rows.map(r => r.end))
  const start = Math.floor(lo / 5) * 5
  let end = Math.ceil(hi / 5) * 5
  if (end - start < 10) end = start + 10
  const range = end - start
  const step = range > 80 ? 20 : range > 40 ? 10 : 5
  const ticks: { year: number, pct: number }[] = []
  for (let year = Math.ceil(start / step) * step; year <= end; year += step) {
    ticks.push({ year, pct: ((year - start) / range) * 100 })
  }
  return { start, end, ticks }
}

/** A bar's left edge and width on the axis, in percent. */
export function barGeometry(row: Affiliation, axis: AffiliationAxis): { left: number, width: number } {
  const range = axis.end - axis.start
  const left = ((row.start - axis.start) / range) * 100
  const width = Math.max(((row.end - row.start) / range) * 100, 1.2)
  return { left, width: Math.min(width, 100 - left) }
}
