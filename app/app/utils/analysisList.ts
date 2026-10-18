import type { AnalysisCard, AnalysisConfidence, AnalysisKind, AnalysisNovelty } from '#shared/types/wiki'

// Type-only imports from `#shared`, so the tests run without Nuxt's aliases.
// The labels for kinds, confidences and novelties live in ./analysis.ts.

const CONFIDENCE_RANK: Record<AnalysisConfidence, number> = { strong: 3, moderate: 2, speculative: 1 }

/** The `/analyses` sort orders, in the order the menu lists them. */
export type AnalysisSort = 'newest' | 'oldest' | 'impact' | 'confidence' | 'connected'

export const ANALYSIS_SORTS: AnalysisSort[] = ['newest', 'oldest', 'impact', 'confidence', 'connected']

export const SORT_LABEL: Record<AnalysisSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  impact: 'Most significant',
  confidence: 'Strongest evidence',
  connected: 'Most connected',
}

/** A filter left at null lets every analysis through. */
export interface AnalysisFilter {
  kind: AnalysisKind | null
  confidence: AnalysisConfidence | null
  novelty: AnalysisNovelty | null
}

const byNewest = (a: AnalysisCard, b: AnalysisCard): number => (b.date ?? '').localeCompare(a.date ?? '')

/** Higher first; missing values last. */
const byDesc = (pick: (a: AnalysisCard) => number | null) => (a: AnalysisCard, b: AnalysisCard): number =>
  (pick(b) ?? -1) - (pick(a) ?? -1)

const COMPARE: Record<AnalysisSort, (a: AnalysisCard, b: AnalysisCard) => number> = {
  newest: byNewest,
  oldest: (a, b) => (a.date ?? '￿').localeCompare(b.date ?? '￿'),
  impact: byDesc(a => a.impact),
  confidence: byDesc(a => (a.confidence ? CONFIDENCE_RANK[a.confidence] : null)),
  connected: byDesc(a => a.entityCount),
}

/**
 * The analyses that pass `filter`, in `sort` order. Ties fall back to newest
 * first, then title, so the list never reshuffles between renders.
 */
export function filterAndSortAnalyses(list: readonly AnalysisCard[], filter: AnalysisFilter, sort: AnalysisSort): AnalysisCard[] {
  return list
    .filter(a => (!filter.kind || a.kind === filter.kind)
      && (!filter.confidence || a.confidence === filter.confidence)
      && (!filter.novelty || a.novelty === filter.novelty))
    .sort((a, b) => COMPARE[sort](a, b) || byNewest(a, b) || a.title.localeCompare(b.title))
}
