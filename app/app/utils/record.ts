/**
 * Pure normalisation behind `::wiki-record` (WikiRecord.vue): what a person
 * put on the record, and when. Memos, letters, sworn testimony, interviews,
 * books, papers, complaints, statements. No Nuxt runtime, so it is
 * unit-tested directly.
 */
import { formatDate, yearOf } from './timeline'

export type RecordKind =
  | 'testimony'
  | 'interview'
  | 'memo'
  | 'letter'
  | 'report'
  | 'book'
  | 'article'
  | 'paper'
  | 'statement'
  | 'complaint'
  | 'lawsuit'
  | 'patent'
  | 'other'

export const RECORD_KINDS: readonly RecordKind[] = [
  'testimony', 'interview', 'memo', 'letter', 'report', 'book', 'article',
  'paper', 'statement', 'complaint', 'lawsuit', 'patent', 'other',
]

/** The word on each item's tag. Kind is never shown by icon alone. */
export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  testimony: 'Testimony',
  interview: 'Interview',
  memo: 'Memo',
  letter: 'Letter',
  report: 'Report',
  book: 'Book',
  article: 'Article',
  paper: 'Paper',
  statement: 'Statement',
  complaint: 'Complaint',
  lawsuit: 'Lawsuit',
  patent: 'Patent',
  other: 'Record',
}

/** Plural of each label, for the filter buttons. */
export const RECORD_KIND_PLURAL: Record<RecordKind, string> = {
  testimony: 'Testimony',
  interview: 'Interviews',
  memo: 'Memos',
  letter: 'Letters',
  report: 'Reports',
  book: 'Books',
  article: 'Articles',
  paper: 'Papers',
  statement: 'Statements',
  complaint: 'Complaints',
  lawsuit: 'Lawsuits',
  patent: 'Patents',
  other: 'Other',
}

const KIND_ALIASES: Record<string, RecordKind> = {
  hearing: 'testimony',
  deposition: 'testimony',
  affidavit: 'testimony',
  podcast: 'interview',
  broadcast: 'interview',
  memorandum: 'memo',
  email: 'letter',
  correspondence: 'letter',
  study: 'report',
  'white paper': 'paper',
  whitepaper: 'paper',
  op_ed: 'article',
  'op-ed': 'article',
  oped: 'article',
  speech: 'statement',
  remarks: 'statement',
  post: 'statement',
  filing: 'complaint',
  suit: 'lawsuit',
}

export function normalizeRecordKind(value: unknown): RecordKind {
  const s = String(value ?? '').trim().toLowerCase()
  if ((RECORD_KINDS as readonly string[]).includes(s)) return s as RecordKind
  return KIND_ALIASES[s] ?? 'other'
}

export interface RecordInput {
  date?: string | number
  kind?: string
  /** What the item is: a document's title, or a short description. Required. */
  title?: string
  /** Where it was given or published: a hearing, outlet, book publisher, page title. */
  where?: string
  /** Others who took part (co-authors, the interviewer, fellow witnesses). Page titles or plain names. */
  with?: string | string[]
  /** One or two lines on what it says or why it matters. */
  note?: string
  /** A short, verbatim quotation from it. */
  quote?: string
  /** The page this item is drawn from, usually a video summary's title. */
  source?: string
}

export interface RecordItem {
  key: string
  date: string
  /** "26 Jul 2023", "Jun 2023", "2022", or '' when undated. */
  shownDate: string
  kind: RecordKind
  title: string
  where: string
  with: string[]
  note: string
  quote: string
  source: string
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

const ISO = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/

/**
 * Order two dates: by year, undated last; within a year, two dates that both
 * name a month go by month and day. A bare year doesn't say where in the year
 * it falls, so against a month it keeps the authored order (0).
 */
export function compareDates(a: string, b: string): number {
  const ay = yearOf(a)
  const by = yearOf(b)
  if (ay === null || by === null) return ay === by ? 0 : ay === null ? 1 : -1
  if (ay !== by) return ay - by
  const am = ISO.exec(a)
  const bm = ISO.exec(b)
  if (!am || !bm) return 0
  return a.localeCompare(b)
}

/**
 * Drop items without a title, normalise kinds, split `with`, and sort by
 * date (undated last, authored order kept within a year). `names` is every
 * `where`, `with` and `source` value, for one batched resolve: a `where` that
 * names a page (a committee, an outlet) becomes a link, and plain text stays
 * plain.
 */
export function buildRecord(items: RecordInput[]): { items: RecordItem[], kinds: RecordKind[], names: string[] } {
  const out: RecordItem[] = []
  items.forEach((item, i) => {
    const title = str(item.title)
    if (!title) return
    const date = str(item.date)
    const withList = (Array.isArray(item.with) ? item.with : item.with ? [item.with] : [])
      .map(str)
      .filter(Boolean)
    out.push({
      key: `${i}:${title}`,
      date,
      shownDate: date ? formatDate(date) : '',
      kind: normalizeRecordKind(item.kind),
      title,
      where: str(item.where),
      with: [...new Set(withList)],
      note: str(item.note),
      quote: str(item.quote),
      source: str(item.source),
    })
  })

  const sorted = out
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareDates(a.item.date, b.item.date) || a.index - b.index)
    .map(({ item }) => item)

  const kinds = RECORD_KINDS.filter(kind => sorted.some(item => item.kind === kind))
  const names = [...new Set(sorted.flatMap(item => [item.where, item.source, ...item.with]).filter(Boolean))]
  return { items: sorted, kinds, names }
}
