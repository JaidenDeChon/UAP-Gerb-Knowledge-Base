/**
 * Pure logic behind the `/world` page: which continent a place is on, the
 * frame each continent's map shows, the heat ramp, and the density grid the
 * 2D heat layer is drawn from. No Nuxt runtime, so it is unit-tested directly
 * and imported by the build-time bake (`wiki/places.ts`) as well as the page.
 *
 * Coordinates are `[lat, lon]`, as everywhere an author writes them; d3-geo
 * wants `[lon, lat]` and gets it through `toLonLat`.
 */
import type { Feature, MultiLineString, MultiPolygon } from 'geojson'
import { geoBounds, geoContains, geoDistance } from 'd3-geo'
import { type GeoBounds, type LatLon, toLonLat } from './map'

export type Continent =
  | 'north-america'
  | 'south-america'
  | 'europe'
  | 'africa'
  | 'asia'
  | 'oceania'
  | 'antarctica'

export interface ContinentMeta {
  id: Continent
  name: string
  /**
   * What the continent's map frames when its places don't reach further: a
   * recognisable outline of the continent, not every island it owns (no
   * Aleutians, no Svalbard). A place outside it widens the frame.
   */
  bounds: GeoBounds
}

/** In display order: the order the continent maps and the list's groups use. */
export const CONTINENTS: readonly ContinentMeta[] = [
  { id: 'north-america', name: 'North America', bounds: [-128, 7, -52, 58] },
  { id: 'south-america', name: 'South America', bounds: [-82, -56, -34, 13] },
  { id: 'europe', name: 'Europe', bounds: [-12, 35, 35, 66] },
  { id: 'africa', name: 'Africa', bounds: [-18, -35, 52, 37] },
  { id: 'asia', name: 'Asia', bounds: [26, -11, 146, 56] },
  { id: 'oceania', name: 'Oceania', bounds: [112, -47, 180, -5] },
  { id: 'antarctica', name: 'Antarctica', bounds: [-180, -90, 180, -60] },
]

export const CONTINENT_BY_ID: ReadonlyMap<Continent, ContinentMeta> = new Map(CONTINENTS.map(c => [c.id, c]))

/*
 * Natural Earth country ids (ISO 3166-1 numeric, as `world.json` carries
 * them) to continents, after the UN M49 regions: the Caribbean and Central
 * America are North America; Western Asia, including Turkey, Cyprus and the
 * Caucasus, is Asia. Russia is split by longitude in `continentOfCountry`.
 */
const IDS: Record<Continent, string> = {
  'north-america': '060 028 044 052 084 092 124 136 188 192 212 214 222 304 308 320 332 340 388 484 500 531 533 534 558 591 630 652 659 660 662 663 666 670 780 796 840 850',
  'south-america': '032 068 076 152 170 218 238 239 328 600 604 740 858 862',
  'europe': '008 040 056 070 100 112 191 203 208 233 246 250 276 300 348 352 372 380 428 440 442 498 499 528 578 616 620 642 688 703 705 724 752 756 804 807 826',
  'africa': '012 024 072 108 120 140 148 178 180 204 226 231 232 262 266 270 288 324 384 404 426 430 434 450 454 466 478 504 508 516 562 566 624 646 654 686 694 706 710 716 728 729 732 748 768 788 800 818 834 854 894',
  'asia': '004 031 050 051 064 096 104 116 144 156 158 196 268 275 356 360 364 368 376 392 398 400 408 410 414 417 418 422 458 496 512 524 586 608 626 634 682 704 760 762 764 784 792 795 860 887',
  'oceania': '036 090 184 242 258 540 548 554 570 598 612',
  'antarctica': '010 260',
}

export const COUNTRY_CONTINENT: ReadonlyMap<string, Continent> = new Map(
  (Object.entries(IDS) as [Continent, string][]).flatMap(([c, ids]) => ids.split(' ').map(id => [id, c] as const)),
)

/** The few Natural Earth features with no ISO id, by name. */
const NAMELESS: Record<string, Continent> = {
  'N. Cyprus': 'asia',
  'Somaliland': 'africa',
  'Kosovo': 'europe',
}

const RUSSIA = '643'
/** Russia west of this longitude is Europe; east of it, Asia (roughly the Urals). */
const URALS_LON = 60

/** The continent of a country feature, or null for one the table doesn't know. */
export function continentOfCountry(id: string, name: string, lon: number): Continent | null {
  if (id === RUSSIA) return lon < URALS_LON ? 'europe' : 'asia'
  return COUNTRY_CONTINENT.get(id) ?? NAMELESS[name] ?? null
}

export type Outline = Feature<MultiPolygon | MultiLineString>

interface Indexed {
  feature: Outline
  bounds: GeoBounds
}

/** Country polygons with their bounds, for `continentOf`. Lakes and line features are left out. */
export function indexCountries(features: Outline[]): Indexed[] {
  return features
    .filter(f => f.id !== 'lake' && f.geometry.type === 'MultiPolygon')
    .map((feature) => {
      const [[w, s], [e, n]] = geoBounds(feature)
      return { feature, bounds: [w, s, e, n] as GeoBounds }
    })
}

function inBounds([w, s, e, n]: GeoBounds, lon: number, lat: number): boolean {
  if (lat < s || lat > n) return false
  // A feature across the antimeridian has west > east.
  return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e
}

/**
 * The continent a place is on: the country containing it, else (a place at
 * sea, or on an island too small for the 1:110m outlines) the country with
 * the nearest border point. Null only with no countries to test.
 */
export function continentOf(at: LatLon, countries: Indexed[]): Continent | null {
  const p = toLonLat(at)
  const name = (f: Outline) => String(f.properties?.name ?? '')
  for (const { feature, bounds } of countries) {
    if (!inBounds(bounds, p[0], p[1]) || !geoContains(feature, p)) continue
    const c = continentOfCountry(String(feature.id ?? ''), name(feature), p[0])
    if (c) return c
  }
  let best: Continent | null = null
  let bestD = Infinity
  for (const { feature } of countries) {
    const c = continentOfCountry(String(feature.id ?? ''), name(feature), p[0])
    if (!c || feature.geometry.type !== 'MultiPolygon') continue
    for (const poly of feature.geometry.coordinates) {
      for (const q of poly[0] ?? []) {
        const d = geoDistance(p, q as [number, number])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
    }
  }
  return best
}

/* -- continent frames ------------------------------------------------------ */

/**
 * What a continent's map shows: its own bounds, widened to take in every
 * place on it (with a little air), so no pin is ever off the edge.
 */
export function continentFrame(continent: Continent, places: LatLon[]): GeoBounds {
  let [w, s, e, n] = CONTINENT_BY_ID.get(continent)!.bounds
  for (const [lat, lon] of places) {
    if (lon < w + 2) w = lon - 4
    if (lon > e - 2) e = lon + 4
    if (lat < s + 2) s = Math.max(-89, lat - 4)
    if (lat > n - 2) n = Math.min(89, lat + 4)
  }
  return [w, s, e, n]
}

/* -- places ---------------------------------------------------------------- */

/** The URL key for a place: the last segment of its wiki path. */
export function placeSlug(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** `military_base` / `neighborhood/city` / `ocean region` → `Military base` / `Neighborhood / city` / `Ocean region`. */
export function formatPlaceType(raw: string | null | undefined): string {
  const t = (raw ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').toLowerCase()
  return t ? t[0]!.toUpperCase() + t.slice(1) : ''
}

/** Case- and accent-insensitive match of every word of `query` in `text`. */
export function matchesQuery(text: string, query: string): boolean {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const hay = fold(text)
  return fold(query).split(/\s+/).filter(Boolean).every(word => hay.includes(word))
}

/* -- heat ------------------------------------------------------------------ */

/** An `hsl()` colour as the theme tokens hold it: `H S% L%`, parsed. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** Parses a token value like `142.1 70.6% 45.3%`; null if it isn't one. */
export function parseHslToken(value: string): Hsl | null {
  const m = /^\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*$/.exec(value)
  if (!m) return null
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) }
}

/**
 * A CSS colour string in the legacy comma syntax: WebGL layers parse colours
 * with d3-color and three.js, which don't read the space-separated form.
 */
export function hslString({ h, s, l }: Hsl, alpha = 1): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000
  return a >= 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`
}

/**
 * An `rgba()` string: the only form three-globe reads alpha from (it parses
 * `rgba(r, g, b, a)` itself and hands anything else to three.js, which has
 * no alpha), so every translucent colour on the globe is written this way.
 */
export function rgbaString(c: Hsl, alpha = 1): string {
  const [r, g, b] = hslToRgb(c)
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/**
 * The heat ramp: one hue (the theme's primary), stepping in lightness from
 * the surface toward full intensity, and in opacity from clear to solid.
 * On a dark surface density reads as light; on a light one, as ink, so the
 * densest cell is always the one that stands out most from the page. `t`
 * is density in 0..1.
 */
export function heatColor(t: number, primary: Hsl, dark: boolean): { hsl: Hsl, alpha: number } {
  const x = Math.min(1, Math.max(0, t))
  const s = Math.min(100, primary.s + 8)
  // Dark surfaces: from a deep primary up to a pale, bright one. Light surfaces: from a pale primary down to a deep one.
  const l = dark ? 30 + x * 50 : 72 - x * 50
  const alpha = x <= 0 ? 0 : Math.min(1, 0.18 + x * 0.95)
  return { hsl: { h: primary.h, s, l }, alpha }
}

/**
 * A 256-entry RGBA lookup table of `heatColor`, for colouring a canvas
 * density layer pixel by pixel (index = density × 255).
 */
export function heatLut(primary: Hsl, dark: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const { hsl, alpha } = heatColor(i / 255, primary, dark)
    const [r, g, b] = hslToRgb(hsl)
    out.set([r, g, b, Math.round(alpha * 255)], i * 4)
  }
  return out
}

/**
 * Colours a density picture in place. `px` is RGBA canvas data where each
 * place was drawn as a soft blob of alpha; each pixel's alpha, relative to
 * the densest pixel's, picks its colour from `lut` (`heatLut`). Pixels no
 * blob reached stay clear.
 */
export function colorizeDensity(px: Uint8ClampedArray, lut: Uint8ClampedArray): void {
  let max = 0
  for (let i = 3; i < px.length; i += 4) max = Math.max(max, px[i]!)
  if (!max) return
  const scale = 255 / max
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!
    if (!a) continue
    const k = Math.min(255, Math.round(a * scale)) * 4
    px[i] = lut[k]!
    px[i + 1] = lut[k + 1]!
    px[i + 2] = lut[k + 2]!
    px[i + 3] = lut[k + 3]!
  }
}

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const S = s / 100
  const L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}
