import { describe, expect, it } from 'vitest'
import {
  assignLanes,
  axisTicks,
  eraBands,
  eraOf,
  formatClock,
  formatDate,
  fractionalYear,
  nowPlayingIndex,
  sortEvents,
  timeScale,
  yearOf,
} from './timeline'

describe('yearOf / formatDate', () => {
  it('reads the leading year, including circa dates', () => {
    expect(yearOf('1947-07')).toBe(1947)
    expect(yearOf('c. 2010s')).toBe(2010)
    expect(yearOf('Unknown')).toBeNull()
  })
  it('formats full and partial dates, passing vague ones through', () => {
    expect(formatDate('1953-05-21')).toBe('21 May 1953')
    expect(formatDate('1947-07')).toBe('Jul 1947')
    expect(formatDate('c. 2010s')).toBe('c. 2010s')
  })
})

describe('fractionalYear', () => {
  it('places a bare year at its midpoint and a month within the year', () => {
    expect(fractionalYear('1958')).toBe(1958.5)
    expect(fractionalYear('1947-01')).toBeCloseTo(1947.04, 2)
    expect(fractionalYear('1947-12')).toBeCloseTo(1947.96, 2)
  })
  it('separates two events in the same year by month', () => {
    const a = fractionalYear('1947-07')!
    const b = fractionalYear('1947-09')!
    expect(b).toBeGreaterThan(a)
  })
  it('returns null for an undated entry', () => {
    expect(fractionalYear('Unknown')).toBeNull()
  })
})

describe('sortEvents', () => {
  it('sorts by year, keeps authored order within a year, undated last, without mutating', () => {
    const input = [
      { date: '1955', title: 'c' },
      { date: 'Unknown', title: 'u' },
      { date: '1947-09', title: 'b' },
      { date: '1947-07', title: 'a' },
    ]
    const copy = [...input]
    expect(sortEvents(input).map(e => e.title)).toEqual(['b', 'a', 'c', 'u'])
    expect(input).toEqual(copy)
  })
})

describe('timeScale / axisTicks', () => {
  const events = [{ date: '1933-06' }, { date: '1947-07' }, { date: '2023-07' }]
  it('snaps the axis to 5-year edges and maps years to percentages', () => {
    const scale = timeScale(events)
    expect(scale.min).toBe(1930)
    expect(scale.max).toBe(2025)
    expect(scale.pct(1930)).toBe(0)
    expect(scale.pct(2025)).toBe(100)
    expect(scale.pct(1977.5)).toBeCloseTo(50, 5)
  })
  it('clamps positions outside the axis', () => {
    const scale = timeScale(events)
    expect(scale.pct(1800)).toBe(0)
    expect(scale.pct(2100)).toBe(100)
  })
  it('widens the axis to cover authored eras', () => {
    const scale = timeScale([{ date: '1960' }], [{ label: 'x', from: 1947, to: 1978 }])
    expect(scale.min).toBe(1945)
    expect(scale.max).toBe(1980)
  })
  it('survives no dated events and a single year', () => {
    expect(timeScale([]).pct(1950)).toBe(0)
    const one = timeScale([{ date: '1950' }])
    expect(one.max).toBeGreaterThan(one.min)
  })
  it('emits a tick every 5 years with decades marked major', () => {
    const ticks = axisTicks(timeScale(events))
    expect(ticks[0]).toEqual({ year: 1930, pct: 0, major: true })
    expect(ticks.find(t => t.year === 1935)?.major).toBe(false)
    expect(ticks.at(-1)?.year).toBe(2025)
  })
})

describe('eraBands / eraOf', () => {
  const eras = [
    { label: 'Modern', from: 1994 },
    { label: 'Golden', from: 1947, to: 1978 },
    { label: 'Cold War', from: 1978, to: 1994 },
  ]
  it('orders bands by start and runs an open-ended era to the axis end', () => {
    const scale = timeScale([{ date: '1933' }, { date: '2023' }])
    const bands = eraBands(eras, scale)
    expect(bands.map(b => b.label)).toEqual(['Golden', 'Cold War', 'Modern'])
    expect(bands[2]!.to).toBe(scale.max)
    expect(bands[2]!.pctTo).toBe(100)
    expect(bands[0]!.pctFrom).toBeLessThan(bands[0]!.pctTo)
  })
  it('assigns a boundary year to the era that starts there, and none before the first', () => {
    expect(eraOf(1978, eras)?.label).toBe('Cold War')
    expect(eraOf(1960, eras)?.label).toBe('Golden')
    expect(eraOf(2023, eras)?.label).toBe('Modern')
    expect(eraOf(1933, eras)).toBeNull()
    expect(eraOf(null, eras)).toBeNull()
  })
  it('returns null past a closed era with no successor', () => {
    expect(eraOf(1990, [{ label: 'only', from: 1947, to: 1978 }])).toBeNull()
  })
})

describe('assignLanes', () => {
  it('stacks dots closer than the gap into successive lanes', () => {
    expect(assignLanes([10, 10.5, 12, 30, 30.2, 30.4], 1.5)).toEqual([0, 1, 0, 0, 1, 2])
  })
  it('keeps undated dots in lane 0', () => {
    expect(assignLanes([null, 5], 1)).toEqual([0, 0])
  })
})

describe('nowPlayingIndex', () => {
  const events = [{ cue: 100 }, { cue: 500 }, {}, { cue: 900 }]
  it('picks the latest cue at or before the playhead', () => {
    expect(nowPlayingIndex(events, 499)).toBe(0)
    expect(nowPlayingIndex(events, 500)).toBe(1)
    expect(nowPlayingIndex(events, 5000)).toBe(3)
  })
  it('is -1 before the first cue or with no playhead', () => {
    expect(nowPlayingIndex(events, 50)).toBe(-1)
    expect(nowPlayingIndex(events, null)).toBe(-1)
    expect(nowPlayingIndex([{}], 10)).toBe(-1)
  })
})

describe('formatClock', () => {
  it('formats under and over an hour', () => {
    expect(formatClock(987)).toBe('16:27')
    expect(formatClock(3792)).toBe('1:03:12')
    expect(formatClock(-4)).toBe('0:00')
  })
})
