import { describe, expect, it } from 'vitest'
import {
  boundsArea,
  boxHits,
  boundsOutline,
  buildMap,
  chooseLocator,
  containsBounds,
  decodeOutline,
  frameRing,
  LOCATOR_MIN_MARK,
  LOCATOR_REGIONS,
  locatorEnabled,
  locatorMark,
  type LocatorRegion,
  MIN_FRAME_SPAN,
  mapFrame,
  niceLength,
  normalizeLatLon,
  normalizeRegion,
  layoutInset,
  placeLabels,
  placePins,
  radiusPoints,
  ringBounds,
  spreadPins,
  stopIndex,
  unionBounds,
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

describe('locator: chooseLocator', () => {
  const peru: LocatorRegion = { id: 'c604', name: 'Peru', label: 'Peru', bounds: [-81.4, -18.4, -68.7, -0.04], kind: 'country' }
  const mexico: LocatorRegion = { id: 'c484', name: 'Mexico', label: 'Mexico', bounds: [-117.1, 14.5, -86.7, 32.7], kind: 'country' }

  it('puts a view of the Mojave in the contiguous United States', () => {
    expect(chooseLocator([-119.5, 33.5, -115, 37.5])?.id).toBe('us')
  })

  it('keeps a view spilling a little past the border in the United States', () => {
    // Pennsylvania to Michigan, reaching into Ontario.
    expect(chooseLocator([-85, 39.5, -78, 44.5])?.id).toBe('us')
  })

  it('prefers the country the view is centred in when it holds the view', () => {
    expect(chooseLocator([-78, -14, -72, -6], [...LOCATOR_REGIONS, peru])?.id).toBe('c604')
  })

  it('moves up to the continent when the view spills well past the country', () => {
    expect(chooseLocator([-80, -15, -66, 1], [...LOCATOR_REGIONS, peru])?.id).toBe('south-america')
  })

  it('chooses the smaller of two regions that both hold the view', () => {
    // Chihuahua and West Texas: inside both Mexico (with margin) and the US; Mexico is smaller.
    expect(chooseLocator([-107, 28, -103, 32], [...LOCATOR_REGIONS, mexico])?.id).toBe('c484')
  })

  it('uses the continent for a sea with no country', () => {
    // Persian Gulf to the South China Sea.
    expect(chooseLocator([45, -4, 120, 30])?.id).toBe('asia')
  })

  it('falls back to the world for a view no continent holds', () => {
    // The South Pacific, inside none of the boxes.
    expect(chooseLocator([-150, -30, -120, -10])?.id).toBe('world')
  })

  it('skips a region the view already mostly shows, trying the next one up', () => {
    // Nearly the whole lower 48: the US adds nothing, North America does.
    expect(chooseLocator([-124, 25, -67, 49])?.id).toBe('north-america')
    // A Hawaii view as wide as the island chain.
    expect(chooseLocator([-160.5, 18.6, -154.5, 22.5])?.id).toBe('north-america')
  })

  it('returns null when even the world is mostly in view', () => {
    expect(chooseLocator([-180, -58, 180, 84])).toBeNull()
  })
})

describe('locator: bounds helpers', () => {
  it('measures a box on the sphere', () => {
    expect(boundsArea([-180, -90, 180, 90])).toBeCloseTo(4 * Math.PI)
    // The same span of longitude holds less area near the pole.
    expect(boundsArea([0, 60, 10, 70])).toBeLessThan(boundsArea([0, 0, 10, 10]))
    expect(boundsArea([10, 0, 0, 10])).toBe(0)
  })

  it('contains with a margin of the outer span', () => {
    expect(containsBounds([0, 0, 10, 10], [-0.9, 2, 5, 10.9])).toBe(true)
    expect(containsBounds([0, 0, 10, 10], [-1.1, 2, 5, 5])).toBe(false)
    expect(containsBounds([0, 0, 10, 10], [-0.9, 2, 5, 5], 0)).toBe(false)
  })

  it('unions and bounds a ring', () => {
    expect(unionBounds([0, 0, 10, 10], [-5, 2, 3, 12])).toEqual([-5, 0, 10, 12])
    expect(ringBounds([[1, 2], [-3, 5], [4, -1]])).toEqual([-3, -1, 4, 5])
    expect(ringBounds([])).toBeNull()
    // A ring across the antimeridian takes every longitude.
    expect(ringBounds([[179, 0], [-179, 5]])).toEqual([-180, 0, 180, 5])
  })
})

describe('locator: frameRing', () => {
  it('walks the frame clockwise from the top-left, steps per side', () => {
    expect(frameRing(100, 50, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 25 },
      { x: 100, y: 50 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
      { x: 0, y: 25 },
    ])
  })
})

describe('locator: locatorMark (the speck threshold)', () => {
  it('outlines a view large enough to read', () => {
    const m = locatorMark([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 10, y: 20 }])
    expect(m).toEqual({ kind: 'area', d: 'M10.0,10.0 L30.0,10.0 L30.0,20.0 L10.0,20.0 Z' })
  })

  it('keeps the outline when only one side reaches the minimum', () => {
    expect(locatorMark([{ x: 0, y: 0 }, { x: LOCATOR_MIN_MARK, y: 0 }, { x: LOCATOR_MIN_MARK, y: 2 }])?.kind).toBe('area')
  })

  it('marks a speck with a ring at its centre', () => {
    expect(locatorMark([{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 13 }, { x: 10, y: 13 }]))
      .toEqual({ kind: 'dot', x: 12, y: 11.5 })
  })

  it('returns null for an empty ring', () => {
    expect(locatorMark([])).toBeNull()
  })
})

describe('locator: boxHits', () => {
  it('detects overlap, and a near miss within the margin', () => {
    const box = { x0: 0, y0: 0, x1: 10, y1: 10 }
    expect(boxHits(box, [{ x0: 5, y0: 5, x1: 15, y1: 15 }])).toBe(true)
    expect(boxHits(box, [{ x0: 13, y0: 0, x1: 20, y1: 10 }])).toBe(false)
    expect(boxHits(box, [{ x0: 13, y0: 0, x1: 20, y1: 10 }], 4)).toBe(true)
    // Touching edges is not an overlap.
    expect(boxHits(box, [{ x0: 10, y0: 0, x1: 20, y1: 10 }])).toBe(false)
  })
})

describe('locator: layoutInset (never covers a pin)', () => {
  // A 400 × 300 map, 14px padding, an 80 × 60 inset over a 100 × 25 scale bar.
  const base = {
    width: 400,
    height: 300,
    pad: 14,
    inset: { w: 80, h: 60 },
    scale: { w: 100, h: 25 },
    scaleBottom: 11,
    gap: 4,
    margin: 4,
  }
  const pin = (x: number, y: number) => ({ x0: x - 12.5, y0: y - 12.5, x1: x + 12.5, y1: y + 12.5 })
  const clearOf = (l: ReturnType<typeof layoutInset>, obstacles: { x0: number, y0: number, x1: number, y1: number }[]) =>
    [l.inset, l.scale].every(b => !b || !boxHits(b, obstacles, base.margin))

  it('puts the inset right above the scale bar, bottom left, when that is clear', () => {
    const l = layoutInset({ ...base, obstacles: [pin(300, 100)] })
    expect(l.extra).toBe(0)
    expect(l.scale).toEqual({ x0: 14, y0: 264, x1: 114, y1: 289 })
    expect(l.inset).toEqual({ x0: 14, y0: 200, x1: 94, y1: 260 })
  })

  it('moves the inset to the next clear corner when a pin sits above the scale bar', () => {
    const obstacles = [pin(50, 230)]
    const l = layoutInset({ ...base, obstacles })
    expect(l.extra).toBe(0)
    expect(l.inset).toEqual({ x0: 306, y0: 226, x1: 386, y1: 286 }) // bottom right
    expect(clearOf(l, obstacles)).toBe(true)
  })

  it('tries top left, then top right', () => {
    const obstacles = [pin(50, 230), pin(350, 250)]
    expect(layoutInset({ ...base, obstacles }).inset).toMatchObject({ x0: 14, y0: 14 })
    obstacles.push(pin(40, 40))
    expect(layoutInset({ ...base, obstacles }).inset).toMatchObject({ x0: 306, y0: 14 })
  })

  it('extends the map below every obstacle in its column when no corner is clear', () => {
    const obstacles = [pin(50, 230), pin(350, 250), pin(40, 40), pin(360, 40)]
    const l = layoutInset({ ...base, obstacles })
    expect(l.extra).toBeGreaterThan(0)
    expect(clearOf(l, obstacles)).toBe(true)
    // The column sits just below the lowest pin in its path: no more room than needed.
    expect(l.inset!.y0).toBeLessThanOrEqual(230 + 12.5 + 4 + 2)
    expect(l.scale!.y1).toBe(300 + l.extra - 11)
  })

  it('extends for a scale bar that would cover a pin, even with no inset', () => {
    const obstacles = [pin(40, 280)]
    const l = layoutInset({ ...base, inset: null, obstacles })
    expect(l.inset).toBeNull()
    expect(l.extra).toBeGreaterThan(0)
    expect(clearOf(l, obstacles)).toBe(true)
  })

  it('does not move the inset to a corner while the scale bar itself covers something', () => {
    const obstacles = [pin(40, 280)]
    const l = layoutInset({ ...base, obstacles })
    expect(l.extra).toBeGreaterThan(0)
    expect(l.inset!.x0).toBe(14)
    expect(clearOf(l, obstacles)).toBe(true)
  })

  it('never overlaps, over many random maps', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let t = 0; t < 300; t++) {
      const width = 260 + Math.round(rand() * 500)
      const height = Math.round(width * (0.42 + rand() * 0.6))
      const obstacles = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => {
        const x = 14 + rand() * (width - 28)
        const y = 14 + rand() * (height - 28)
        const w = 5 + rand() * 90
        return { x0: x - 12, y0: y - 12, x1: x + w, y1: y + 12 }
      })
      const l = layoutInset({ ...base, width, height, obstacles })
      expect(clearOf(l, obstacles)).toBe(true)
      expect(l.inset!.y0).toBeGreaterThanOrEqual(0)
      expect(l.inset!.x1).toBeLessThanOrEqual(width)
    }
  })

  it('makes room on a map too short to hold the inset', () => {
    const l = layoutInset({ ...base, height: 80, obstacles: [] })
    expect(l.inset!.y0).toBeGreaterThanOrEqual(base.pad)
  })
})

describe('locator: locatorEnabled', () => {
  it('reads the locator switch', () => {
    expect(locatorEnabled(undefined)).toBe(true)
    expect(locatorEnabled(true)).toBe(true)
    expect(locatorEnabled('true')).toBe(true)
    expect(locatorEnabled(false)).toBe(false)
    expect(locatorEnabled('false')).toBe(false)
    expect(locatorEnabled('Off')).toBe(false)
    expect(locatorEnabled('none')).toBe(false)
  })
})
