import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeOutline, type EncodedOutline, type LatLon } from './map'
import {
  colorizeDensity,
  continentFrame,
  continentOf,
  continentOfCountry,
  formatPlaceType,
  globeOutlines,
  heatColor,
  heatLut,
  hslString,
  hslToRgb,
  indexCountries,
  matchesQuery,
  parseHslToken,
  rgbaString,
  simplifyRing,
  placeSlug,
} from './world'

const world = decodeOutline(
  JSON.parse(readFileSync(new URL('../../public/geo/world.json', import.meta.url), 'utf8')) as EncodedOutline,
)
const countries = indexCountries(world.features)

describe('continentOfCountry', () => {
  it('knows every country in the bundled outlines', () => {
    const unknown = world.features
      .filter(f => f.id !== 'lake')
      .filter(f => !continentOfCountry(String(f.id ?? ''), String(f.properties?.name ?? ''), 0))
      .map(f => `${f.id}=${f.properties?.name}`)
    expect(unknown).toEqual([])
  })

  it('splits Russia at the Urals', () => {
    expect(continentOfCountry('643', 'Russia', 37.6)).toBe('europe')
    expect(continentOfCountry('643', 'Russia', 159)).toBe('asia')
  })
})

describe('continentOf', () => {
  const cases: [string, LatLon, string][] = [
    ['Roswell', [33.3943, -104.523], 'north-america'],
    ['Aguadilla, Puerto Rico', [18.4274, -67.1541], 'north-america'],
    ['Howard AFB, Panama', [8.915, -79.5997], 'north-america'],
    ['Lima', [-12.0464, -77.0428], 'south-america'],
    ['Varginha', [-21.5514, -45.4303], 'south-america'],
    ['Milan', [45.4642, 9.19], 'europe'],
    ['Spitsbergen', [78.75, 16], 'europe'],
    ['Tehran', [35.6892, 51.389], 'asia'],
    ['Kamchatka', [56, 159], 'asia'],
    ['Pine Gap', [-23.799, 133.737], 'oceania'],
    ['Johannesburg', [-26.2041, 28.0473], 'africa'],
    ['Gulf of Guinea (at sea)', [3, 2.5], 'africa'],
    ['Ascension Island (at sea)', [-7.9467, -14.3559], 'africa'],
    ['Las Palmas (Canaries, off Africa)', [28.1235, -15.4363], 'africa'],
    ['Shag Harbour (coast)', [43.495, -65.714], 'north-america'],
  ]
  for (const [label, at, want] of cases) {
    it(`puts ${label} in ${want}`, () => {
      expect(continentOf(at, countries)).toBe(want)
    })
  }

  it('is null with no countries to test', () => {
    expect(continentOf([0, 0], [])).toBeNull()
  })
})

describe('globe outlines', () => {
  it('simplifyRing drops points within tolerance and keeps the ends', () => {
    const ring: [number, number][] = [[0, 0], [1, 0.01], [2, 0], [2, 2], [1, 2.01], [0, 2], [0, 0]]
    const out = simplifyRing(ring, 0.05)
    expect(out).toEqual([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])
    expect(simplifyRing(ring, 0)).toEqual(ring)
  })

  it('keeps a ring that would simplify below a triangle', () => {
    const speck: [number, number][] = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]
    expect(simplifyRing(speck, 1)).toEqual(speck)
  })

  it('lightens the bundled outlines: far fewer points, only big lakes, every country kept', () => {
    const count = (fs: typeof world.features) => fs.reduce((n, f) =>
      n + (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat().reduce((m, r) => m + r.length, 0) : 0), 0)
    const light = globeOutlines(world.features)
    const countries = (fs: typeof world.features) => fs.filter(f => f.id !== 'lake').length
    expect(countries(light)).toBe(countries(world.features))
    expect(count(light)).toBeLessThan(count(world.features) / 2)
    const lakes = light.filter(f => f.id === 'lake')
    expect(lakes.length).toBeGreaterThan(5)
    expect(lakes.length).toBeLessThan(80)
  })
})

describe('continentFrame', () => {
  it('is the continent\'s own frame when every place is inside it', () => {
    expect(continentFrame('europe', [[45.46, 9.19]])).toEqual([-12, 35, 35, 66])
  })

  it('widens to take in a place beyond it, with air', () => {
    const [, , , n] = continentFrame('europe', [[78.75, 16]])
    expect(n).toBeGreaterThan(78.75)
    const [w] = continentFrame('north-america', [[61.2, -149.9]])
    expect(w).toBeLessThan(-149.9)
  })
})

describe('placeSlug', () => {
  it('takes the last path segment', () => {
    expect(placeSlug('/wiki/locations/area-51')).toBe('area-51')
  })
})

describe('formatPlaceType', () => {
  it('turns frontmatter values into sentence-case labels', () => {
    expect(formatPlaceType('military_base')).toBe('Military base')
    expect(formatPlaceType('test-range')).toBe('Test range')
    expect(formatPlaceType('neighborhood/city')).toBe('Neighborhood / city')
    expect(formatPlaceType('ocean region')).toBe('Ocean region')
    expect(formatPlaceType(undefined)).toBe('')
  })
})

describe('matchesQuery', () => {
  it('matches every word, ignoring case and accents', () => {
    expect(matchesQuery('Wright-Patterson Air Force Base', 'wright base')).toBe(true)
    expect(matchesQuery('Nürnberg', 'nurnberg')).toBe(true)
    expect(matchesQuery('Area 51', 'area 52')).toBe(false)
    expect(matchesQuery('Anything', '  ')).toBe(true)
  })
})

describe('heat ramp', () => {
  const primary = parseHslToken('142.1 70.6% 45.3%')!

  it('parses theme tokens', () => {
    expect(primary).toEqual({ h: 142.1, s: 70.6, l: 45.3 })
    expect(parseHslToken('not a colour')).toBeNull()
  })

  it('is clear at zero density and opaque at full', () => {
    expect(heatColor(0, primary, true).alpha).toBe(0)
    expect(heatColor(1, primary, true).alpha).toBe(1)
  })

  it('keeps one hue and steps lightness away from the surface', () => {
    const dark = [0.1, 0.5, 1].map(t => heatColor(t, primary, true).hsl)
    expect(new Set(dark.map(c => c.h))).toEqual(new Set([primary.h]))
    expect(dark[0]!.l).toBeLessThan(dark[2]!.l)
    const light = [0.1, 1].map(t => heatColor(t, primary, false).hsl)
    expect(light[0]!.l).toBeGreaterThan(light[1]!.l)
  })

  it('builds a 256-step RGBA table', () => {
    const lut = heatLut(primary, false)
    expect(lut.length).toBe(1024)
    expect(lut[3]).toBe(0)
    expect(lut[1023]).toBe(255)
  })

  it('writes colours in the comma syntax WebGL colour parsers read', () => {
    expect(hslString({ h: 142, s: 70, l: 45 })).toBe('hsl(142, 70%, 45%)')
    expect(hslString({ h: 142, s: 70, l: 45 }, 0.25)).toBe('hsla(142, 70%, 45%, 0.25)')
  })

  it('colours density on an absolute scale, leaving empty pixels clear', () => {
    const lut = heatLut(primary, true)
    const px = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 120])
    colorizeDensity(px, lut)
    expect([...px.slice(0, 4)]).toEqual([0, 0, 0, 0])
    // Not stretched to the densest pixel: 120 stays 120, not full heat.
    expect([...px.slice(8, 12)]).toEqual([...lut.slice(120 * 4, 121 * 4)])
    expect([...px.slice(4, 8)]).toEqual([...lut.slice(60 * 4, 61 * 4)])
  })

  it('writes rgba() for the globe, alpha clamped', () => {
    expect(rgbaString({ h: 0, s: 100, l: 50 }, 0.5)).toBe('rgba(255, 0, 0, 0.5)')
    expect(rgbaString({ h: 0, s: 100, l: 50 }, 2)).toBe('rgba(255, 0, 0, 1)')
  })

  it('converts hsl to rgb', () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual([255, 0, 0])
    expect(hslToRgb({ h: 120, s: 100, l: 25 })).toEqual([0, 128, 0])
  })
})
