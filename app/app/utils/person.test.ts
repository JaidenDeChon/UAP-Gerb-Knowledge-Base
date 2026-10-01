import { describe, expect, it } from 'vitest'
import { activeLabel, ageAtDeath, hasPersonDates, lifeBar, readPersonDates } from './person'

const read = (fm: Record<string, unknown>) => (key: string) => fm[key]

describe('readPersonDates', () => {
  it('reads all four fields', () => {
    expect(readPersonDates(read({ born: '1987', died: '2011-05-03', active_from: 2004, active_to: 2023 }))).toEqual({
      born: '1987',
      died: '2011-05-03',
      activeFrom: 2004,
      activeTo: 2023,
    })
  })

  it('takes "present" as an open end', () => {
    expect(readPersonDates(read({ active_from: '2004', active_to: 'Present' })).activeTo).toBe('present')
  })

  it('drops blanks, NA and values with no year', () => {
    const dates = readPersonDates(read({ born: 'NA', died: 'Unknown', active_from: 'soon' }))
    expect(dates).toEqual({ born: null, died: null, activeFrom: null, activeTo: null })
    expect(hasPersonDates(dates)).toBe(false)
  })

  it('keeps a circa date', () => {
    expect(readPersonDates(read({ born: 'c. 1920' })).born).toBe('c. 1920')
  })
})

describe('ageAtDeath', () => {
  it('counts whole years when both dates are exact', () => {
    expect(ageAtDeath('1924-07-01', '2008-06-30')).toBe(83)
    expect(ageAtDeath('1924-07-01', '2008-07-01')).toBe(84)
  })

  it('gives nothing when either date is only a year or a month', () => {
    expect(ageAtDeath('1924', '2008-07-01')).toBeNull()
    expect(ageAtDeath('1924-07', '2008-07-01')).toBeNull()
    expect(ageAtDeath('1924-07-01', null)).toBeNull()
  })
})

describe('activeLabel', () => {
  const base = { born: null, died: null }
  it('words each shape of span', () => {
    expect(activeLabel({ ...base, activeFrom: 2004, activeTo: 2023 })).toBe('2004 to 2023')
    expect(activeLabel({ ...base, activeFrom: 2004, activeTo: 'present' })).toBe('Since 2004')
    expect(activeLabel({ ...base, activeFrom: 2004, activeTo: null })).toBe('From 2004')
    expect(activeLabel({ ...base, activeFrom: 1990, activeTo: 1990 })).toBe('1990')
    expect(activeLabel({ ...base, activeFrom: null, activeTo: 2000 })).toBeNull()
  })
})

describe('lifeBar', () => {
  const NOW = 2026.75

  it('is null with no birth and no active start', () => {
    expect(lifeBar({ born: null, died: '2000', activeFrom: null, activeTo: null }, NOW)).toBeNull()
  })

  it('snaps the axis to decades around the life and runs an open life to now', () => {
    const bar = lifeBar({ born: '1987', died: null, activeFrom: 2004, activeTo: 'present' }, NOW)!
    expect(bar.start).toBe(1980)
    expect(bar.end).toBe(2030)
    expect(bar.life).toMatchObject({ open: true })
    expect(bar.life!.from).toBeCloseTo(15, 0)
    expect(bar.life!.to).toBeCloseTo(93.5, 1)
    expect(bar.active).toMatchObject({ open: true })
    expect(bar.ticks.map(t => t.year)).toEqual([1980, 1990, 2000, 2010, 2020, 2030])
  })

  it('closes the life at the death date and the active span at the end of its last year', () => {
    const bar = lifeBar({ born: '1920', died: '1999', activeFrom: 1950, activeTo: 1959 }, NOW)!
    expect(bar.start).toBe(1920)
    expect(bar.end).toBe(2000)
    expect(bar.life).toMatchObject({ open: false })
    expect(bar.active!.from).toBeCloseTo(37.5, 1)
    expect(bar.active!.to).toBeCloseTo(50, 1)
  })

  it('widens to take in the video coverage and uses 20-year ticks on a long axis', () => {
    const bar = lifeBar({ born: '1910', died: '1985', activeFrom: null, activeTo: null }, NOW, ['2024-01-10', '2026-09-18'])!
    expect(bar.end).toBe(2030)
    expect(bar.coverage!.to).toBeGreaterThan(bar.coverage!.from)
    expect(bar.ticks.map(t => t.year)).toEqual([1910, 1930, 1950, 1970, 1990, 2010, 2030])
  })

  it('draws an activity-only bar when no birth date is known', () => {
    const bar = lifeBar({ born: null, died: null, activeFrom: 1979, activeTo: 1982 }, NOW)!
    expect(bar.life).toBeNull()
    expect(bar.start).toBe(1970)
    expect(bar.end).toBe(1990)
  })
})
