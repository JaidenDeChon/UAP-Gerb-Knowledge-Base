import type { AnalysisCard } from '#shared/types/wiki'
import { describe, expect, it } from 'vitest'
import { filterAndSortAnalyses } from './analysisList'

const card = (over: Partial<AnalysisCard>): AnalysisCard => ({
  path: over.title ?? 'x',
  title: 'x',
  dek: '',
  date: null,
  kind: null,
  confidence: null,
  novelty: null,
  impact: null,
  videoCount: 0,
  entityCount: 0,
  ...over,
})

const list = [
  card({ title: 'A', date: '2026-10-01', kind: 'contradiction', confidence: 'moderate', novelty: 'new', impact: 4, entityCount: 3 }),
  card({ title: 'B', date: '2026-10-17', kind: 'smoking-gun', confidence: 'strong', novelty: 'partly-known', impact: 5, entityCount: 9 }),
  card({ title: 'C', date: '2026-10-10', kind: 'contradiction', confidence: 'speculative', novelty: 'new', impact: null, entityCount: 5 }),
]
const none = { kind: null, confidence: null, novelty: null }
const titles = (cards: AnalysisCard[]) => cards.map(c => c.title)

describe('filterAndSortAnalyses', () => {
  it('lets everything through with no filter', () => {
    expect(titles(filterAndSortAnalyses(list, none, 'newest'))).toEqual(['B', 'C', 'A'])
  })

  it('combines filters', () => {
    expect(titles(filterAndSortAnalyses(list, { ...none, kind: 'contradiction', novelty: 'new' }, 'newest'))).toEqual(['C', 'A'])
    expect(titles(filterAndSortAnalyses(list, { ...none, confidence: 'strong' }, 'newest'))).toEqual(['B'])
  })

  it('sorts each way, missing values last', () => {
    expect(titles(filterAndSortAnalyses(list, none, 'oldest'))).toEqual(['A', 'C', 'B'])
    expect(titles(filterAndSortAnalyses(list, none, 'impact'))).toEqual(['B', 'A', 'C'])
    expect(titles(filterAndSortAnalyses(list, none, 'confidence'))).toEqual(['B', 'A', 'C'])
    expect(titles(filterAndSortAnalyses(list, none, 'connected'))).toEqual(['B', 'C', 'A'])
  })

  it('leaves the input untouched', () => {
    filterAndSortAnalyses(list, none, 'oldest')
    expect(titles(list)).toEqual(['A', 'B', 'C'])
  })
})
