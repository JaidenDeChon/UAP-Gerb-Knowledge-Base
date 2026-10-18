/**
 * Pure helpers for `::wiki-document` (components/content/WikiDocument.vue)
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
