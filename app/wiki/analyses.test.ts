import { describe, expect, it } from 'vitest'
import { ANALYSIS_CONFIDENCES, ANALYSIS_KINDS, ANALYSIS_NOVELTIES } from '../shared/types/wiki'
import { buildAnalyses, listValue } from './analyses'
import { graphIndex } from './graph'
import { walkVault } from './vault'

// These run against the real vault, like ./videos.test.ts. The Analyses folder
// may be empty or missing (it is until the first post lands), and every
// assertion below must hold then too.
describe('buildAnalyses', () => {
  const analyses = buildAnalyses()
  const { nodes } = graphIndex().payload

  it('lists every note under Analyses/, and nothing else', () => {
    const notes = walkVault().filter(stem => /^Analyses\/[^/]+$/.test(stem))
    expect(analyses).toHaveLength(notes.length)
    expect(analyses.every(a => nodes[a.i]!.c === 'Analyses')).toBe(true)
  })

  it('orders by date, newest first, undated last', () => {
    const dated = analyses.filter(a => a.date)
    expect(dated.map(a => a.date)).toEqual(dated.map(a => a.date).sort().reverse())
    expect(analyses.slice(dated.length).every(a => a.date === null)).toBe(true)
  })

  it('keeps kind, confidence and novelty inside their enums', () => {
    for (const a of analyses) {
      expect(a.kind === null || ANALYSIS_KINDS.includes(a.kind)).toBe(true)
      expect(a.confidence === null || ANALYSIS_CONFIDENCES.includes(a.confidence)).toBe(true)
      expect(a.novelty === null || ANALYSIS_NOVELTIES.includes(a.novelty)).toBe(true)
    }
  })
})

describe('listValue', () => {
  it('reads an inline list, keeping commas inside quoted items', () => {
    const block = 'title: "X"\nvideos: ["One, Two", \'Three\', Four]\ntags: [analysis]'
    expect(listValue(block, 'videos')).toEqual(['One, Two', 'Three', 'Four'])
    expect(listValue(block, 'tags')).toEqual(['analysis'])
  })

  it('reads a block list', () => {
    const block = 'videos:\n  - "One"\n  - Two\ntags: [analysis]'
    expect(listValue(block, 'videos')).toEqual(['One', 'Two'])
  })

  it('gives [] for a missing or empty list', () => {
    expect(listValue('title: X', 'videos')).toEqual([])
    expect(listValue('videos: []', 'videos')).toEqual([])
  })
})
