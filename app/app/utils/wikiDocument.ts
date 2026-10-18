/**
 * Pure helpers for `::wiki-document` (components/content/WikiDocument.vue),
 * the document frame it shares with the document page
 * (components/wiki/DocumentPdfFrame.vue)
 * and its transcript dialog (components/wiki/DocumentTranscriptDialog.vue).
 */

/** The 1-based page to show: `page` rounded, at least 1, at most `pages` when the count is known. */
export function clampPage(page: unknown, pages?: number): number {
  const n = Math.round(Number(page) || 1)
  const low = Math.max(1, n)
  return pages ? Math.min(low, pages) : low
}

/**
 * `region` as a `[from, to]` band of the page's height, each clamped to 0–1,
 * or null when it's missing, malformed or under 0.05 tall (too thin to read).
 */
export function normaliseBand(region: readonly unknown[] | undefined): [number, number] | null {
  if (!region || region.length < 2) return null
  const [from, to] = region.map(Number)
  if (from === undefined || to === undefined || !Number.isFinite(from) || !Number.isFinite(to)) return null
  const a = Math.min(Math.max(0, from), 1)
  const b = Math.min(Math.max(0, to), 1)
  return b - a >= 0.05 ? [a, b] : null
}

/**
 * Does a heading's text open a transcription's section for page `n`?
 * Transcriptions head each page `## Page N` (see docs/documents.md,
 * "Transcriptions"); a span such as "Page 8–9" counts for page 8.
 */
export function isPageHeading(text: string, n: number): boolean {
  const m = /^\s*page\s+(\d+)(?!\d)/i.exec(text)
  return m !== null && Number(m[1]) === n
}

/**
 * The heading for page `n` inside a rendered transcription: the `## Page N`
 * whose id @nuxt/content derived (`page-n`), or, should the slug differ, the
 * first h2 whose text says it.
 */
export function findPageHeading(root: ParentNode, n: number): HTMLElement | null {
  const byId = root.querySelector<HTMLElement>(`h2#page-${n}`)
  if (byId) return byId
  for (const h of root.querySelectorAll<HTMLElement>('h2')) {
    if (isPageHeading(h.textContent ?? '', n)) return h
  }
  return null
}

/**
 * Where a document frame should scroll to open on a page: its top, just
 * inside the frame's padding (`pad`), or, with a `band`, so that the band sits
 * in view. A band that fits sits a little above the middle (at most 30% of the
 * frame down, so the reader sees what comes next); one taller than the frame
 * starts at its top. Never negative.
 */
export function openingScrollTop(o: {
  pageTop: number
  pageHeight: number
  frameHeight: number
  band?: readonly [number, number] | null
  pad?: number
}): number {
  const pad = o.pad ?? 16
  if (!o.band) return Math.max(0, o.pageTop - pad)
  const top = o.pageTop + o.band[0] * o.pageHeight
  const height = (o.band[1] - o.band[0]) * o.pageHeight
  const room = o.frameHeight - height
  const above = room >= 2 * pad ? Math.min(room / 2, o.frameHeight * 0.3) : pad
  return Math.max(0, top - Math.max(pad, above))
}

/**
 * The page at scroll offset `y`: the last of `count` pages (1-based) whose top
 * (`topOf(n)`, increasing with `n`) is at or above `y`. A binary search, so a
 * 412-page report reads a handful of offsets per scroll, not all of them.
 */
export function pageAt(count: number, topOf: (n: number) => number, y: number): number {
  let lo = 1
  let hi = count
  let best = 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (topOf(mid) <= y) {
      best = mid
      lo = mid + 1
    }
    else {
      hi = mid - 1
    }
  }
  return best
}

/** Zoom levels a document frame steps through; 1 fits the page to the frame's width. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const

/** The next zoom level from `zoom` in direction `step`, staying within the steps. */
export function stepZoom(zoom: number, step: 1 | -1): number {
  const steps: readonly number[] = ZOOM_STEPS
  let i = steps.indexOf(zoom)
  if (i < 0) {
    const above = steps.findIndex(z => z > zoom)
    i = (above < 0 ? steps.length : above) - (step > 0 ? 1 : 0)
  }
  return steps[Math.min(Math.max(0, i + step), steps.length - 1)]!
}
