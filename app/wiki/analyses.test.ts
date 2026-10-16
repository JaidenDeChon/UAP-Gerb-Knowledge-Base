import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ANALYSIS_CONFIDENCES, ANALYSIS_KINDS, ANALYSIS_NOVELTIES } from '../shared/types/wiki'
import { buildAnalyses, buildFootnotes, countFootnoteEntries, listValue, scalar } from './analyses'
import { graphIndex } from './graph'
import { VAULT_DIR, walkVault } from './vault'

/** Notes directly under `Analyses/` whose frontmatter says `kind: footnotes`. */
function footnotesLogs(): string[] {
  return walkVault()
    .filter(stem => /^Analyses\/[^/]+$/.test(stem))
    .filter(stem => /^kind:\s*["']?footnotes["']?\s*$/m.test(readFileSync(`${VAULT_DIR}/${stem}.md`, 'utf8').split(/\r?\n---/)[0]!))
}

// These run against the real vault, like ./videos.test.ts. The Analyses folder
// may be empty or missing (it is until the first post lands), and so may the
// footnotes log; every assertion below must hold then too.
describe('buildAnalyses', () => {
  const analyses = buildAnalyses()
  const { nodes } = graphIndex().payload

  it('lists every note under Analyses/ but the footnotes log, and nothing else', () => {
    const notes = walkVault().filter(stem => /^Analyses\/[^/]+$/.test(stem))
    expect(analyses).toHaveLength(notes.length - footnotesLogs().length)
    expect(analyses.every(a => nodes[a.i]!.c === 'Analyses')).toBe(true)
  })

  it('never lists the footnotes log', () => {
    const log = buildFootnotes()
    expect(footnotesLogs().length > 0).toBe(log !== null)
    if (log) expect(analyses.some(a => a.i === log.i)).toBe(false)
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

describe('countFootnoteEntries', () => {
  it('counts the `## ` headings, skipping frontmatter, deeper headings and fenced code', () => {
    const raw = [
      '---',
      'kind: footnotes',
      '## not a heading in frontmatter',
      '---',
      '# Footnotes and Corrections',
      '## One',
      'text',
      '### A detail',
      '```',
      '## inside a fence',
      '```',
      '## Two',
    ].join('\n')
    expect(countFootnoteEntries(raw)).toBe(2)
  })

  it('gives 0 for a log with no entries yet', () => {
    expect(countFootnoteEntries('---\nkind: footnotes\n---\nNothing yet.')).toBe(0)
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

  it('undoes YAML quote escapes in list items', () => {
    expect(listValue('videos: ["Say \\"hi\\"", \'It\'\'s\']', 'videos')).toEqual(['Say "hi"', "It's"])
    expect(listValue('videos:\n  - "A \\"b\\""\n  - \'c\'\'d\'', 'videos')).toEqual(['A "b"', "c'd"])
  })
})

describe('scalar', () => {
  it('unquotes a value and undoes its YAML escapes', () => {
    expect(scalar('dek: "Says \\"one craft\\" twice"', 'dek')).toBe('Says "one craft" twice')
    expect(scalar("dek: 'Gerb''s gloss'", 'dek')).toBe("Gerb's gloss")
    expect(scalar('dek: plain text', 'dek')).toBe('plain text')
    expect(scalar('title: X', 'dek')).toBeUndefined()
  })
})
