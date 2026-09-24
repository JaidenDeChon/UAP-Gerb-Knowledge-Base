import { describe, expect, it } from 'vitest'
import { buildCompare, normalizeCell, normalizeCue, normalizeMark, normalizeSubject } from './compare'

describe('normalizeMark / normalizeCue', () => {
  it('accepts the four markers case-insensitively and rejects anything else', () => {
    expect(normalizeMark('same')).toBe('same')
    expect(normalizeMark(' Disputed ')).toBe('disputed')
    expect(normalizeMark('agree')).toBeNull()
    expect(normalizeMark(undefined)).toBeNull()
  })
  it('keeps non-negative finite cues as whole seconds', () => {
    expect(normalizeCue(2259.8)).toBe(2259)
    expect(normalizeCue('90')).toBe(90)
    expect(normalizeCue(-1)).toBeNull()
    expect(normalizeCue('soon')).toBeNull()
    expect(normalizeCue('')).toBeNull()
    expect(normalizeCue(0)).toBe(0)
  })
})

describe('normalizeSubject / normalizeCell', () => {
  it('reads a bare title or an object with a note', () => {
    expect(normalizeSubject(' TR-3B ')).toEqual({ name: 'TR-3B', note: '' })
    expect(normalizeSubject({ name: 'Frank Scully', note: '1950' })).toEqual({ name: 'Frank Scully', note: '1950' })
  })
  it('reads bare text, numbers and blanks', () => {
    expect(normalizeCell('Triangle')).toMatchObject({ text: 'Triangle', mark: null, empty: false })
    expect(normalizeCell(300)).toMatchObject({ text: '300', empty: false })
    expect(normalizeCell(null)).toMatchObject({ text: '', empty: true })
  })
  it('only marks a cue approximate when there is a cue', () => {
    expect(normalizeCell({ text: 'x', cue: 12, cueApprox: true })).toMatchObject({ cue: 12, cueApprox: true })
    expect(normalizeCell({ text: 'x', cueApprox: true })).toMatchObject({ cue: null, cueApprox: false })
  })
  it('treats a marker-only cell as not empty', () => {
    expect(normalizeCell({ mark: 'unknown' })).toMatchObject({ text: '', mark: 'unknown', empty: false })
  })
})

describe('buildCompare', () => {
  it('pads short rows and truncates long ones to the subject count', () => {
    const m = buildCompare(['A', 'B', 'C'], [
      { attribute: 'Short', cells: ['a'] },
      { attribute: 'Long', cells: ['a', 'b', 'c', 'd'] },
    ])
    expect(m.rows[0]!.cells).toHaveLength(3)
    expect(m.rows[0]!.cells[2]!.empty).toBe(true)
    expect(m.rows[1]!.cells.map(c => c.text)).toEqual(['a', 'b', 'c'])
  })
  it('drops nameless subjects together with their column', () => {
    const m = buildCompare(['A', '', 'C'], [{ attribute: 'Row', cells: ['a', 'gone', 'c'] }])
    expect(m.subjects.map(s => s.name)).toEqual(['A', 'C'])
    expect(m.rows[0]!.cells.map(c => c.text)).toEqual(['a', 'c'])
  })
  it('drops rows without an attribute and lists used markers in canonical order', () => {
    const m = buildCompare(['A', 'B'], [
      { attribute: '', cells: ['x', 'y'] },
      { attribute: 'Shape', cells: [{ text: 't', mark: 'disputed' }, { text: 't', mark: 'same' }] },
    ])
    expect(m.rows).toHaveLength(1)
    expect(m.marks).toEqual(['same', 'disputed'])
  })
  it('reads a row-level cue', () => {
    const m = buildCompare(['A'], [
      { attribute: 'Cued', cue: '1255', cells: ['a'] },
      { attribute: 'Approx', cue: 90, cueApprox: 'true', cells: ['a'] },
      { attribute: 'None', cueApprox: true, cells: ['a'] },
    ])
    expect(m.rows.map(r => [r.cue, r.cueApprox])).toEqual([[1255, false], [90, true], [null, false]])
  })
  it('is empty, not throwing, for missing input', () => {
    expect(buildCompare(undefined, undefined)).toEqual({ subjects: [], rows: [], marks: [] })
    expect(buildCompare([], [{ attribute: 'x', cells: ['a'] }]).rows).toEqual([])
  })
})
