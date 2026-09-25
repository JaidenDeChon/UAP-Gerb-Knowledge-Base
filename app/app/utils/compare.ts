/**
 * Pure normalisation behind `::wiki-compare` (WikiCompare.vue): turns the
 * loosely typed YAML an author writes into a rectangular grid the component
 * can render as a table (desktop) or as one card per attribute (phone) without
 * any further guarding. No Nuxt runtime, so it is unit-tested directly.
 */

/** The four agreement markers a cell may carry. */
export type CompareMark = 'same' | 'differs' | 'unknown' | 'disputed'

export const COMPARE_MARKS: readonly CompareMark[] = ['same', 'differs', 'unknown', 'disputed']

/** Visible text for each marker: markers are never colour alone. */
export const COMPARE_MARK_LABEL: Record<CompareMark, string> = {
  same: 'Same',
  differs: 'Differs',
  unknown: 'Unknown',
  disputed: 'Disputed',
}

/** One-line meaning for each marker, used in the legend and as a tooltip. */
export const COMPARE_MARK_HINT: Record<CompareMark, string> = {
  same: 'Matches the others on this point',
  differs: 'Differs from the others on this point',
  unknown: 'Not described, or not known',
  disputed: 'Disputed in the video',
}

/** A subject as authored: a bare page title, or an object with an optional kicker. */
export type CompareSubjectInput = string | { name?: string, note?: string }

/** A cell as authored: bare text, or an object with a marker and cue. */
export type CompareCellInput = string | number | null | undefined | {
  text?: string | number
  mark?: string
  cue?: number | string
  cueApprox?: boolean | string
}

export interface CompareRowInput {
  attribute?: string
  note?: string
  /** Where the video discusses this attribute as a whole (all subjects at once). */
  cue?: number | string
  cueApprox?: boolean | string
  cells?: CompareCellInput[]
}

export interface CompareSubject { name: string, note: string }

export interface CompareCell {
  text: string
  mark: CompareMark | null
  cue: number | null
  cueApprox: boolean
  /** True when the author wrote nothing at all for this cell (or it was padded in). */
  empty: boolean
}

export interface CompareRow {
  attribute: string
  note: string
  cue: number | null
  cueApprox: boolean
  cells: CompareCell[]
}

export interface CompareModel {
  subjects: CompareSubject[]
  rows: CompareRow[]
  /** The markers actually used, in canonical order, for the legend. */
  marks: CompareMark[]
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

export function normalizeMark(v: unknown): CompareMark | null {
  const m = str(v).toLowerCase()
  return (COMPARE_MARKS as readonly string[]).includes(m) ? (m as CompareMark) : null
}

export function normalizeCue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

export function normalizeSubject(input: CompareSubjectInput): CompareSubject {
  if (typeof input === 'string') return { name: input.trim(), note: '' }
  return { name: str(input?.name), note: str(input?.note) }
}

export function normalizeCell(input: CompareCellInput): CompareCell {
  if (input === null || input === undefined || typeof input !== 'object') {
    const text = str(input)
    return { text, mark: null, cue: null, cueApprox: false, empty: !text }
  }
  const text = str(input.text)
  const mark = normalizeMark(input.mark)
  const cue = normalizeCue(input.cue)
  return {
    text,
    mark,
    cue,
    cueApprox: cue !== null && (input.cueApprox === true || input.cueApprox === 'true'),
    empty: !text && !mark && cue === null,
  }
}

const EMPTY_CELL: CompareCell = { text: '', mark: null, cue: null, cueApprox: false, empty: true }

/**
 * Normalise the whole block. Subjects without a name are dropped (with their
 * column); rows without an attribute are dropped; every row is padded or
 * truncated to exactly one cell per surviving subject, so the grid is always
 * rectangular.
 */
export function buildCompare(
  subjects: CompareSubjectInput[] | undefined,
  rows: CompareRowInput[] | undefined,
): CompareModel {
  const raw = (Array.isArray(subjects) ? subjects : []).map(normalizeSubject)
  const keep = raw.map((s, i) => (s.name ? i : -1)).filter(i => i >= 0)
  const outSubjects = keep.map(i => raw[i]!)

  const outRows: CompareRow[] = []
  const used = new Set<CompareMark>()
  for (const row of Array.isArray(rows) ? rows : []) {
    const attribute = str(row?.attribute)
    if (!attribute || !outSubjects.length) continue
    const authored = Array.isArray(row.cells) ? row.cells : []
    const cells = keep.map(i => (i < authored.length ? normalizeCell(authored[i]) : { ...EMPTY_CELL }))
    for (const c of cells) if (c.mark) used.add(c.mark)
    const cue = normalizeCue(row.cue)
    outRows.push({
      attribute,
      note: str(row.note),
      cue,
      cueApprox: cue !== null && (row.cueApprox === true || row.cueApprox === 'true'),
      cells,
    })
  }

  return {
    subjects: outSubjects,
    rows: outRows,
    marks: COMPARE_MARKS.filter(m => used.has(m)),
  }
}
