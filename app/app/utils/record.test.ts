import { describe, expect, it } from 'vitest'
import { buildRecord, compareDates, normalizeRecordKind } from './record'

describe('normalizeRecordKind', () => {
  it('accepts the listed kinds and common aliases, and falls back to other', () => {
    expect(normalizeRecordKind('Testimony')).toBe('testimony')
    expect(normalizeRecordKind('podcast')).toBe('interview')
    expect(normalizeRecordKind('memorandum')).toBe('memo')
    expect(normalizeRecordKind('op-ed')).toBe('article')
    expect(normalizeRecordKind('carrier pigeon')).toBe('other')
    expect(normalizeRecordKind(undefined)).toBe('other')
  })
})

describe('compareDates', () => {
  it('orders by year, then by month when both dates have one, undated last', () => {
    expect(compareDates('2022', '2023')).toBeLessThan(0)
    expect(compareDates('2023-07-26', '2023-06-11')).toBeGreaterThan(0)
    expect(compareDates('2023', '2023-06')).toBe(0)
    expect(compareDates('', '1990')).toBeGreaterThan(0)
    expect(compareDates('', '')).toBe(0)
  })
})

describe('buildRecord', () => {
  const model = buildRecord([
    { date: '2023-07-26', kind: 'testimony', title: 'House hearing', where: 'House Oversight Committee', with: ['Ryan Graves', 'David Fravor'] },
    { kind: 'book', title: 'Undated book' },
    { date: '2023-06-11', kind: 'interview', title: 'NewsNation interview', with: 'Ross Coulthart', source: 'Some Video' },
    { date: '2022', kind: 'complaint', title: 'Whistleblower complaint' },
    { date: '2020', title: '' },
  ])

  it('drops untitled items and sorts by date, undated last', () => {
    expect(model.items.map(i => i.title)).toEqual(['Whistleblower complaint', 'NewsNation interview', 'House hearing', 'Undated book'])
  })

  it('formats dates and wraps a single `with` in a list', () => {
    const interview = model.items[1]!
    expect(interview.shownDate).toBe('11 Jun 2023')
    expect(interview.with).toEqual(['Ross Coulthart'])
    expect(model.items[2]!.shownDate).toBe('26 Jul 2023')
    expect(model.items[3]!.shownDate).toBe('')
  })

  it('lists the kinds used, in a fixed order, and every name to resolve', () => {
    expect(model.kinds).toEqual(['testimony', 'interview', 'book', 'complaint'])
    expect(model.names.sort()).toEqual(['David Fravor', 'House Oversight Committee', 'Ross Coulthart', 'Ryan Graves', 'Some Video'])
  })
})
