import { describe, expect, it } from 'vitest'
import {
  boundsOutline,
  buildMap,
  decodeOutline,
  MIN_FRAME_SPAN,
  mapFrame,
  niceLength,
  normalizeLatLon,
  normalizeRegion,
  placeLabels,
  placePins,
  radiusPoints,
  spreadPins,
  stopIndex,
  US_BOUNDS,
  WORLD_BOUNDS,
} from './map'

describe('buildMap', () => {
  it('numbers bare titles and objects in order, dropping empty pins', () => {
    const m = buildMap(
      [
        'Kecksburg, Pennsylvania',
        { text: '' },
        { name: 'Lockbourne Air Force Base, Columbus, Ohio', note: 'Hangar', date: '1965-12-10', cue: '3126' },
        { text: 'Lapeer, Michigan', coordinates: [43.05, -83.32], label: 'Lapeer' },
      ],
      [],
    )
    expect(m.pins.map(p => [p.n, p.name, p.resolvable])).toEqual([
      [1, 'Kecksburg, Pennsylvania', true],
      [2, 'Lockbourne Air Force Base, Columbus, Ohio', true],
      [3, 'Lapeer, Michigan', false],
    ])
    expect(m.pins[1]).toMatchObject({ note: 'Hangar', date: '10 Dec 1965', cue: 3126, cueApprox: false })
    expect(m.pins[2]).toMatchObject({ label: 'Lapeer', coordinates: [43.05, -83.32] })
    expect(m.names).toEqual(['Kecksburg, Pennsylvania', 'Lockbourne Air Force Base, Columbus, Ohio'])
  })

  it('only honours cueApprox on a pin that has a cue', () => {
    const m = buildMap([{ name: 'A', cueApprox: true }, { name: 'B', cue: 5, cueApprox: 'true' }], [])
    expect(m.pins[0]!.cueApprox).toBe(false)
    expect(m.pins[1]!.cueApprox).toBe(true)
  })

  it('reads routes as lists, paths and from/to, by number or by name', () => {
    const m = buildMap(
      ['A', 'B', { name: 'C', label: 'See' }],
      [
        [1, 2],
        { path: ['b', 'see'], label: 'Truck', style: 'dashed' },
        { from: 3, to: 'A', dashed: true },
      ],
    )
    expect(m.routes).toEqual([
      { stops: [0, 1], label: '', dashed: false },
      { stops: [1, 2], label: 'Truck', dashed: true },
      { stops: [2, 0], label: '', dashed: true },
    ])
  })

  it('drops unknown and repeated stops, then routes left with fewer than two', () => {
    const m = buildMap(['A', 'B'], [[1, 1, 9, 'Nowhere'], [1, 'Nowhere', 2, 2], { from: 1 }])
    expect(m.routes).toEqual([{ stops: [0, 1], label: '', dashed: false }])
  })

  it('tolerates junk input', () => {
    expect(buildMap(undefined, 'x')).toEqual({ pins: [], routes: [], names: [] })
    expect(buildMap([null, 3, {}], null).pins.map(p => p.name)).toEqual(['3'])
  })
})

describe('stopIndex', () => {
  const { pins } = buildMap(['Alpha', { text: 'Beta', label: 'B' }], [])
  it('reads 1-based numbers, including numeric strings', () => {
    expect(stopIndex(1, pins)).toBe(0)
    expect(stopIndex('2', pins)).toBe(1)
    expect(stopIndex(0, pins)).toBeNull()
    expect(stopIndex(3, pins)).toBeNull()
  })
  it('matches names and labels case-insensitively', () => {
    expect(stopIndex('alpha', pins)).toBe(0)
    expect(stopIndex('b', pins)).toBe(1)
    expect(stopIndex('gamma', pins)).toBeNull()
  })
})

describe('normalizeLatLon / normalizeRegion', () => {
  it('validates pairs', () => {
    expect(normalizeLatLon([40.28, '-79.41'])).toEqual([40.28, -79.41])
    expect(normalizeLatLon([95, 0])).toBeNull()
    expect(normalizeLatLon('40, -79')).toBeNull()
  })
  it('falls back to auto', () => {
    expect(normalizeRegion('US')).toBe('us')
    expect(normalizeRegion('mars')).toBe('auto')
  })
})

describe('placePins', () => {
  it('prefers a pin\'s own coordinates, then its page\'s, else null', () => {
    const { pins } = buildMap(
      ['Has page', { name: 'Override', coordinates: [1, 2] }, 'No coords', { text: 'Plain' }],
      [],
    )
    const pages: Record<string, [number, number]> = { 'Has page': [10, 20], 'Override': [30, 40] }
    expect(placePins(pins, n => pages[n])).toEqual([[10, 20], [1, 2], null, null])
  })
})

describe('mapFrame', () => {
  it('is null with no points unless a region is fixed', () => {
    expect(mapFrame([], 'auto')).toBeNull()
    expect(mapFrame([], 'us')?.bounds).toEqual(US_BOUNDS)
    expect(mapFrame([], 'world')?.kind).toBe('world')
  })

  it('pads a regional extent and centres on it', () => {
    const f = mapFrame([[40, -80], [30, -100]])!
    expect(f.kind).toBe('region')
    expect(f.center).toEqual([-90, 35])
    const [w, s, e, n] = f.bounds
    expect(w).toBeCloseTo(-104)
    expect(e).toBeCloseTo(-76)
    expect(s).toBeCloseTo(28)
    expect(n).toBeCloseTo(42)
  })

  it('never frames tighter than the minimum span', () => {
    const [, s, , n] = mapFrame([[34.6, -118.1]])!.bounds
    expect(n - s).toBeGreaterThanOrEqual(MIN_FRAME_SPAN)
  })

  it('switches to a world map for pins across continents', () => {
    expect(mapFrame([[40, -80], [-30, 150]])?.kind).toBe('world')
    expect(mapFrame([[40, -80]], 'world')?.bounds).toEqual(WORLD_BOUNDS)
  })

  it('widens the US frame to take in a pin outside it', () => {
    const f = mapFrame([[-12, -77]], 'us')!
    expect(f.bounds[1]).toBe(-12)
    expect(f.bounds[0]).toBe(US_BOUNDS[0])
  })
})

describe('boundsOutline', () => {
  it('samples every edge, corners included', () => {
    const pts = boundsOutline([0, 0, 10, 20], 2)
    expect(pts).toContainEqual([0, 0])
    expect(pts).toContainEqual([10, 20])
    expect(pts).toContainEqual([5, 0])
    expect(pts).toContainEqual([0, 10])
  })
})

describe('spreadPins', () => {
  it('leaves pins that are already clear untouched', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    expect(spreadPins(pts, 20)).toEqual(pts)
  })

  it('separates overlapping and coincident pins to at least minDist', () => {
    const out = spreadPins([{ x: 50, y: 50 }, { x: 50, y: 50 }, { x: 55, y: 52 }], 20)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        expect(Math.hypot(out[i]!.x - out[j]!.x, out[i]!.y - out[j]!.y)).toBeGreaterThanOrEqual(19.9)
      }
    }
  })

  it('does not mutate its input and is deterministic', () => {
    const pts = [{ x: 1, y: 1 }, { x: 1, y: 1 }]
    const a = spreadPins(pts, 10)
    expect(pts).toEqual([{ x: 1, y: 1 }, { x: 1, y: 1 }])
    expect(spreadPins(pts, 10)).toEqual(a)
  })
})

describe('niceLength', () => {
  it('rounds down to 1, 2 or 5 × 10^n', () => {
    expect(niceLength(73)).toBe(50)
    expect(niceLength(240)).toBe(200)
    expect(niceLength(1.9)).toBe(1)
    expect(niceLength(1000)).toBe(1000)
    expect(niceLength(0)).toBe(0)
  })
})

describe('decodeOutline', () => {
  it('undoes the delta encoding and closes rings', () => {
    const fc = decodeOutline({
      v: 1,
      scale: 100,
      features: [{ id: '1', n: 'Box', p: [[[100, 200, 100, 0, 0, 100, -100, 0]]] }],
    })
    expect(fc.features[0]!.properties).toEqual({ name: 'Box' })
    const geom = fc.features[0]!.geometry
    expect(geom.type).toBe('MultiPolygon')
    expect((geom.coordinates as number[][][][])[0]![0]).toEqual([
      [1, 2],
      [2, 2],
      [2, 3],
      [1, 3],
      [1, 2],
    ])
  })
})

describe('decodeOutline lines', () => {
  it('decodes `l` features as open MultiLineStrings', () => {
    const fc = decodeOutline({ v: 1, scale: 10, features: [{ id: 'x', n: 'Borders', l: [[10, 10, 10, 0]] }] })
    expect(fc.features[0]!.geometry).toEqual({ type: 'MultiLineString', coordinates: [[[1, 1], [2, 1]]] })
  })
})

describe('radius', () => {
  it('keeps a sane positive radius in miles and drops the rest', () => {
    const m = buildMap([{ name: 'A', radius: 90 }, { name: 'B', radius: '-3' }, { name: 'C', radius: 'wide' }, { name: 'D', radius: 5000 }], [])
    expect(m.pins.map(p => p.radius)).toEqual([90, null, null, null])
  })

  it('reaches the circle\'s extremes for framing', () => {
    const [n, s, e, w] = radiusPoints([0, 0], 69.09)
    expect(n![0]).toBeCloseTo(1, 2)
    expect(s![0]).toBeCloseTo(-1, 2)
    expect(e![1]).toBeCloseTo(1, 2)
    expect(w![1]).toBeCloseTo(-1, 2)
  })
})

describe('placeLabels', () => {
  it('prefers the right, and skips pins without a label', () => {
    expect(placeLabels([{ x: 50, y: 50, width: 40 }, { x: 300, y: 50, width: 0 }], 10, 400, 200)).toEqual(['right', null])
  })

  it('moves a label off a neighbouring pin', () => {
    // A pin 40px to the right blocks the right side.
    expect(placeLabels([{ x: 100, y: 100, width: 60 }, { x: 140, y: 100, width: 0 }], 10, 400, 200)[0]).toBe('left')
  })

  it('keeps labels inside the map', () => {
    expect(placeLabels([{ x: 390, y: 100, width: 60 }], 10, 400, 200)[0]).toBe('left')
  })

  it('keeps two labels from overlapping each other', () => {
    const sides = placeLabels([{ x: 100, y: 100, width: 80 }, { x: 100, y: 112, width: 80 }], 5, 400, 200)
    expect(sides[0]).toBe('right')
    expect(sides[1]).not.toBe('right')
  })
})
