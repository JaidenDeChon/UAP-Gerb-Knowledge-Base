import { describe, expect, it } from 'vitest'
import { affiliationAxis, barGeometry, buildAffiliations } from './affiliations'

const NOW = 2026.75

describe('buildAffiliations', () => {
  it('drops rows with no name or no usable start', () => {
    const { rows } = buildAffiliations([
      { name: 'NRO', from: 2016, to: 2021 },
      { role: 'Nameless', from: 2000 },
      { name: 'Undated' },
      { text: 'Bad date', from: 'someday' },
    ], NOW)
    expect(rows.map(r => r.label)).toEqual(['NRO'])
  })

  it('sorts by start and keeps authored order on ties', () => {
    const { rows, names } = buildAffiliations([
      { name: 'B', from: 2016, to: 2021 },
      { text: 'A', from: 2009, to: 2023 },
      { name: 'C', from: 2016, to: 2017 },
    ], NOW)
    expect(rows.map(r => r.label)).toEqual(['A', 'B', 'C'])
    expect(names).toEqual(['B', 'C'])
  })

  it('spans whole years for bare years, inclusive of the last', () => {
    const [row] = buildAffiliations([{ name: 'NRO', from: 2016, to: 2021 }], NOW).rows
    expect(row).toMatchObject({ start: 2016, end: 2022, span: '2016 to 2021', ongoing: false, openEnded: false })
  })

  it('words month dates, single years, present and open ends', () => {
    const { rows } = buildAffiliations([
      { name: 'A', from: '2016-04', to: '2021-11' },
      { name: 'B', from: 2023, to: 2023 },
      { name: 'C', from: 2025, to: 'present' },
      { name: 'D', from: 1969 },
    ], NOW)
    expect(rows.map(r => r.span)).toEqual(['From 1969', 'Apr 2016 to Nov 2021', '2023', 'Since 2025'])
    expect(rows.find(r => r.label === 'C')).toMatchObject({ ongoing: true, end: NOW })
    expect(rows.find(r => r.label === 'D')).toMatchObject({ openEnded: true, end: 1970 })
  })

  it('says "about" for approximate spans', () => {
    const { rows } = buildAffiliations([
      { name: 'A', from: 2009, to: 2023, approx: true },
      { name: 'B', from: 2020, to: 'present', approx: 'true' },
    ], NOW)
    expect(rows.map(r => r.span)).toEqual(['About 2009 to 2023', 'Since about 2020'])
    expect(rows.every(r => r.approx)).toBe(true)
  })
})

describe('affiliationAxis', () => {
  it('snaps to 5-year marks around the bars', () => {
    const { rows } = buildAffiliations([{ name: 'A', from: 2009, to: 2023 }, { name: 'B', from: 2025, to: 'present' }], NOW)
    const axis = affiliationAxis(rows)!
    expect(axis.start).toBe(2005)
    expect(axis.end).toBe(2030)
    expect(axis.ticks.map(t => t.year)).toEqual([2005, 2010, 2015, 2020, 2025, 2030])
  })

  it('uses wider steps on a long axis and is null with no rows', () => {
    const { rows } = buildAffiliations([{ name: 'A', from: 1942, to: 1963 }, { name: 'B', from: 1990, to: 1998 }], NOW)
    expect(affiliationAxis(rows)!.ticks.map(t => t.year)).toEqual([1940, 1950, 1960, 1970, 1980, 1990, 2000])
    expect(affiliationAxis([])).toBeNull()
  })

  it('places a bar in percent, with a minimum visible width', () => {
    const { rows } = buildAffiliations([{ name: 'A', from: 2010, to: 2019 }, { name: 'B', from: 2025, to: '2025-01' }], NOW)
    const axis = affiliationAxis(rows)!
    expect(barGeometry(rows[0]!, axis)).toEqual({ left: 0, width: 50 })
    expect(barGeometry(rows[1]!, axis).width).toBeGreaterThanOrEqual(1.2)
  })
})
