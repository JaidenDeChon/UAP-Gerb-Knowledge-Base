import { describe, expect, it } from 'vitest'
import {
  assignLanes,
  axisTicks,
  chapterize,
  cursorFor,
  eraBands,
  eraOf,
  formatClock,
  formatDate,
  fractionalYear,
  lerp,
  nowPlayingIndex,
  positionForPct,
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

describe('chapterize', () => {
  const eras = [
    { id: 'golden', label: 'Golden', from: 1947, to: 1978 },
    { id: 'cold', label: 'Cold War', from: 1978, to: 1994 },
    { id: 'modern', label: 'Modern', from: 1994 },
  ]
  const events = [
    { date: '1933', title: 'prologue' },
    { date: '1947', title: 'roswell' },
    { date: '1978', title: 'eo12036' },
    { date: '1994', title: 'kissner', era: 'cold' },
    { date: '1994', title: 'group' },
    { date: 'Unknown', title: 'undated' },
  ]

  it('groups by era with automatic before/undated chapters and honours an era override', () => {
    const chapters = chapterize(events, eras)
    expect(chapters.map(c => [c.kind, c.label, c.events.map(e => e.title)])).toEqual([
      ['before', 'Before Golden', ['prologue']],
      ['era', 'Golden', ['roswell']],
      ['era', 'Cold War', ['eo12036', 'kissner']],
      ['era', 'Modern', ['group']],
      ['undated', 'Undated', ['undated']],
    ])
  })

  it('numbers era chapters by their authored order, skipping empty eras without renumbering', () => {
    const chapters = chapterize([{ date: '1950', title: 'a' }, { date: '2000', title: 'b' }], eras)
    expect(chapters.map(c => [c.label, c.ordinal])).toEqual([['Golden', 1], ['Modern', 3]])
  })

  it('files a year in a gap between eras under the era it follows, keeping date order', () => {
    const gapped = [{ label: 'A', from: 1947, to: 1970 }, { label: 'B', from: 1978, to: 1993 }]
    const input = [{ date: '1972', title: 'x' }, { date: '1975', title: 'gap' }, { date: '1978', title: 'y' }, { date: '1990', title: 'z' }]
    const chapters = chapterize(input, gapped)
    expect(chapters.map(c => [c.label, c.events.map(e => e.title)])).toEqual([['A', ['x', 'gap']], ['B', ['y', 'z']]])
    expect(chapters.flatMap(c => c.events)).toEqual(input)
  })

  it('emits an after-chapter for events past a closed final era', () => {
    const closed = [{ label: 'Only', from: 1947, to: 1978 }]
    const chapters = chapterize([{ date: '1990', title: 'late' }], closed)
    expect(chapters[0]!.kind).toBe('after')
    expect(chapters[0]!.from).toBe(1979)
  })

  it('falls back to decade chapters with no eras', () => {
    const chapters = chapterize([{ date: '1947', title: 'a' }, { date: '1948', title: 'b' }, { date: '1955', title: 'c' }], [])
    expect(chapters.map(c => [c.kind, c.label, c.events.length])).toEqual([['decade', '1940s', 2], ['decade', '1950s', 1]])
  })
})

describe('cursorFor / lerp', () => {
  const offsets = [100, 300, 600]
  it('finds the entry under the reading line and the fraction toward the next', () => {
    expect(cursorFor(100, offsets)).toEqual({ index: 0, t: 0 })
    expect(cursorFor(200, offsets)).toEqual({ index: 0, t: 0.5 })
    expect(cursorFor(450, offsets)).toEqual({ index: 1, t: 0.5 })
  })
  it('clamps before the first and after the last entry', () => {
    expect(cursorFor(10, offsets)).toEqual({ index: 0, t: 0 })
    expect(cursorFor(9999, offsets)).toEqual({ index: 2, t: 0 })
    expect(cursorFor(5, [])).toEqual({ index: -1, t: 0 })
  })
  it('lerps with a clamped t', () => {
    expect(lerp(1947, 1957, 0.5)).toBe(1952)
    expect(lerp(1947, 1957, 2)).toBe(1957)
  })
})

describe('positionForPct', () => {
  const pcts = [0, 10, 10, 40, 100]

  it('clamps before the first and after the last entry', () => {
    expect(positionForPct(-5, pcts)).toEqual({ index: 0, t: 0 })
    expect(positionForPct(120, pcts)).toEqual({ index: 4, t: 0 })
  })

  it('interpolates between neighbouring entries', () => {
    expect(positionForPct(5, pcts)).toEqual({ index: 0, t: 0.5 })
    expect(positionForPct(25, pcts)).toEqual({ index: 2, t: 0.5 })
    expect(positionForPct(70, pcts)).toEqual({ index: 3, t: 0.5 })
  })

  it('round-trips with lerp, which is how the cursor is drawn', () => {
    for (const pct of [3, 17, 55, 99]) {
      const { index, t } = positionForPct(pct, pcts)
      expect(lerp(pcts[index]!, pcts[index + 1] ?? pcts[index]!, t)).toBeCloseTo(pct)
    }
  })

  it('is empty-safe', () => {
    expect(positionForPct(50, [])).toEqual({ index: -1, t: 0 })
  })
})
