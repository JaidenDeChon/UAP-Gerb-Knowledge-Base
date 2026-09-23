/**
 * Pure logic behind `::wiki-map` (WikiMap.vue): normalising the loosely typed
 * YAML an author writes into numbered pins and routes, choosing the map's
 * frame, nudging overlapping pins apart, picking a round scale-bar length,
 * and decoding the bundled outline files. No Nuxt runtime and no d3, so it is
 * unit-tested directly; the component owns the projection.
 *
 * Coordinates are `[lat, lon]` in decimal degrees everywhere an author or a
 * page's frontmatter writes them (the order gazetteers print). GeoJSON and
 * d3-geo use `[lon, lat]`; the conversion happens once, in `toLonLat`.
 */
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon } from 'geojson'
import { formatDate } from './timeline'

/** `[latitude, longitude]` in decimal degrees. */
export type LatLon = [number, number]

/** `[longitude, latitude]`, the order GeoJSON and d3-geo use. */
export type LonLat = [number, number]

/** `[west, south, east, north]` in degrees. */
export type GeoBounds = [number, number, number, number]

/** Which part of the globe the map shows. `auto` fits the pins. */
export type MapRegion = 'auto' | 'us' | 'world'

export const MAP_REGIONS: readonly MapRegion[] = ['auto', 'us', 'world']

/** The contiguous United States, for `region: us`. */
export const US_BOUNDS: GeoBounds = [-124.8, 24.5, -66.9, 49.4]

/**
 * The smallest frame, in degrees of latitude (about 330 km). A map of pins a
 * few miles apart still shows enough country to say where they are, and the
 * outlines (1:10m states, 1:50m countries) never get close enough to look
 * coarse.
 */
export const MIN_FRAME_SPAN = 3

/** Pins spread wider than this (degrees of longitude / latitude) get a world map. */
export const WORLD_LON_SPAN = 100
export const WORLD_LAT_SPAN = 60

/** Share of the pins' extent added on each side of the frame. */
const FRAME_PAD = 0.2

export interface MapPinInput {
  /** A page title: linked, and placed from the page's `coordinates:` frontmatter. */
  name?: string
  /** Plain text for a place with no page; never resolved, so it needs `coordinates`. */
  text?: string
  /** Optional short label drawn beside the pin on the map. */
  label?: string
  note?: string
  date?: string | number
  cue?: number | string
  cueApprox?: boolean | string
  /** `[lat, lon]`. Overrides the page's own coordinates (a site within a larger place). */
  coordinates?: unknown
  /** Miles: draws a dashed circle of this radius around the pin (a search area, a range). */
  radius?: number | string
}

/** A pin as authored: a bare page title, or an object. */
export type MapPinSpec = string | MapPinInput

/** A stop in a route: a pin's number as shown on the map (1-based), or its name. */
export type MapStopRef = number | string

export interface MapRouteInput {
  /** Two or more stops, in order. */
  path?: MapStopRef[]
  /** Shorthand for a two-stop path. */
  from?: MapStopRef
  to?: MapStopRef
  /** What the route is ("Army flatbed, 10 Dec"); shown in the legend. */
  label?: string
  /** `dashed` for an alleged, reported or uncertain leg. */
  style?: string
  dashed?: boolean | string
}

/** A route as authored: a bare list of stops, or an object. */
export type MapRouteSpec = MapStopRef[] | MapRouteInput

export interface MapPin {
  /** 1-based number, as drawn on the pin and in the legend. */
  n: number
  /** The display name (the page title, or the plain text). */
  name: string
  /** True when `name` came from `name:` and should be resolved to a page. */
  resolvable: boolean
  label: string
  note: string
  /** Formatted for display ("10 Dec 1965"); empty when none. */
  date: string
  cue: number | null
  cueApprox: boolean
  /** Coordinates written on the pin itself, if any. */
  coordinates: LatLon | null
  /** Radius in miles of a circle drawn around the pin; null for none. */
  radius: number | null
}

export interface MapRoute {
  /** 0-based pin indexes, in order; always two or more. */
  stops: number[]
  label: string
  dashed: boolean
}

export interface MapModel {
  pins: MapPin[]
  routes: MapRoute[]
  /** Every resolvable name, for one batched resolve. */
  names: string[]
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

function normalizeCue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

function truthy(v: unknown): boolean {
  return v === true || v === 'true'
}

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** `[lat, lon]` from a YAML value, or null when it isn't a valid pair. */
export function normalizeLatLon(v: unknown): LatLon | null {
  if (!Array.isArray(v) || v.length !== 2) return null
  const lat = num(v[0])
  const lon = num(v[1])
  if (lat === null || lon === null) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return [lat, lon]
}

export function normalizeRegion(v: unknown): MapRegion {
  const r = str(v).toLowerCase()
  return (MAP_REGIONS as readonly string[]).includes(r) ? (r as MapRegion) : 'auto'
}

function normalizePin(raw: unknown, n: number): MapPin | null {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const name = str(raw)
    return name
      ? { n, name, resolvable: true, label: '', note: '', date: '', cue: null, cueApprox: false, coordinates: null, radius: null }
      : null
  }
  if (!raw || typeof raw !== 'object') return null
  const p = raw as MapPinInput
  const name = str(p.name)
  const text = str(p.text)
  if (!name && !text) return null
  const cue = normalizeCue(p.cue)
  const date = str(p.date)
  return {
    n,
    name: name || text,
    resolvable: Boolean(name),
    label: str(p.label),
    note: str(p.note),
    date: date ? formatDate(date) : '',
    cue,
    cueApprox: cue !== null && truthy(p.cueApprox),
    coordinates: normalizeLatLon(p.coordinates),
    radius: normalizeRadius(p.radius),
  }
}

/** Miles per degree of latitude (mean Earth radius 3,958.8 mi). */
export const MILES_PER_DEGREE = (3958.8 * Math.PI) / 180

function normalizeRadius(v: unknown): number | null {
  const n = num(v)
  // Capped at 1,500 miles: past that a "radius" is a hemisphere, not an area.
  return n !== null && n > 0 && n <= 1500 ? n : null
}

/**
 * The four points a circle of `miles` around `center` reaches (north, south,
 * east, west), so the frame can take in the whole circle, not just its pin.
 */
export function radiusPoints([lat, lon]: LatLon, miles: number): LatLon[] {
  const dLat = miles / MILES_PER_DEGREE
  const cos = Math.max(0.05, Math.cos((lat * Math.PI) / 180))
  const dLon = dLat / cos
  return [
    [Math.min(90, lat + dLat), lon],
    [Math.max(-90, lat - dLat), lon],
    [lat, Math.min(180, lon + dLon)],
    [lat, Math.max(-180, lon - dLon)],
  ]
}

/**
 * Finds the pin a route stop points at: a 1-based pin number, or a name
 * (matched case-insensitively against a pin's name or its label). Returns
 * the 0-based index, or null.
 */
export function stopIndex(ref: unknown, pins: MapPin[]): number | null {
  if (typeof ref === 'number' || (typeof ref === 'string' && /^\s*\d+\s*$/.test(ref))) {
    const n = Math.trunc(Number(ref))
    return n >= 1 && n <= pins.length ? n - 1 : null
  }
  const key = str(ref).toLowerCase()
  if (!key) return null
  const i = pins.findIndex(p => p.name.toLowerCase() === key || (p.label && p.label.toLowerCase() === key))
  return i === -1 ? null : i
}

function normalizeRoute(raw: unknown, pins: MapPin[]): MapRoute | null {
  let path: unknown[] = []
  let label = ''
  let dashed = false
  if (Array.isArray(raw)) {
    path = raw
  }
  else if (raw && typeof raw === 'object') {
    const r = raw as MapRouteInput
    path = Array.isArray(r.path) ? r.path : [r.from, r.to]
    label = str(r.label)
    dashed = str(r.style).toLowerCase() === 'dashed' || truthy(r.dashed)
  }
  const stops: number[] = []
  for (const ref of path) {
    const i = stopIndex(ref, pins)
    // An unknown stop is skipped; a stop repeating the one before adds nothing.
    if (i !== null && stops[stops.length - 1] !== i) stops.push(i)
  }
  return stops.length >= 2 ? { stops, label, dashed } : null
}

/**
 * Normalise the YAML. A pin with neither `name` nor `text` is dropped, and
 * pins are numbered in the order that survives. Routes keep only stops that
 * point at a pin; a route left with fewer than two is dropped.
 */
export function buildMap(pins: unknown, routes: unknown): MapModel {
  const out: MapPin[] = []
  for (const raw of Array.isArray(pins) ? pins : []) {
    const pin = normalizePin(raw, out.length + 1)
    if (pin) out.push(pin)
  }
  const outRoutes: MapRoute[] = []
  for (const raw of Array.isArray(routes) ? routes : []) {
    const route = normalizeRoute(raw, out)
    if (route) outRoutes.push(route)
  }
  const names = [...new Set(out.filter(p => p.resolvable).map(p => p.name))]
  return { pins: out, routes: outRoutes, names }
}

/**
 * Where each pin sits: its own `coordinates` first, else its page's (via
 * `lookup`), else null (listed in the legend but not drawn).
 */
export function placePins(pins: MapPin[], lookup: (name: string) => LatLon | undefined): (LatLon | null)[] {
  return pins.map(p => p.coordinates ?? (p.resolvable ? lookup(p.name) ?? null : null))
}

export function toLonLat([lat, lon]: LatLon): LonLat {
  return [lon, lat]
}

export interface MapFrame {
  kind: 'world' | 'region'
  /** The area to fit, `[west, south, east, north]`. */
  bounds: GeoBounds
  /** `[lon, lat]` the regional projection is centred on. */
  center: LonLat
}

/** The world frame: every longitude, from the Southern Ocean to the Arctic. */
export const WORLD_BOUNDS: GeoBounds = [-180, -58, 180, 84]

function pinBounds(points: LatLon[]): GeoBounds {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lat, lon] of points) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [west, south, east, north]
}

/**
 * Chooses what the map shows. `world` (or pins spread across more than a
 * continent) is the whole world. `us` is the contiguous United States,
 * widened to take in any pin outside it. `auto` fits the pins: their extent,
 * grown to at least `MIN_FRAME_SPAN` degrees of latitude (and the matching
 * distance in longitude), plus 20% on each side. Null with no points.
 */
export function mapFrame(points: LatLon[], region: MapRegion = 'auto'): MapFrame | null {
  if (region === 'world') return { kind: 'world', bounds: WORLD_BOUNDS, center: [0, 0] }
  if (!points.length) {
    return region === 'us'
      ? { kind: 'region', bounds: US_BOUNDS, center: [(US_BOUNDS[0] + US_BOUNDS[2]) / 2, (US_BOUNDS[1] + US_BOUNDS[3]) / 2] }
      : null
  }

  let [west, south, east, north] = pinBounds(points)
  if (east - west > WORLD_LON_SPAN || north - south > WORLD_LAT_SPAN) {
    return { kind: 'world', bounds: WORLD_BOUNDS, center: [0, 0] }
  }

  if (region === 'us') {
    const b: GeoBounds = [
      Math.min(west, US_BOUNDS[0]),
      Math.min(south, US_BOUNDS[1]),
      Math.max(east, US_BOUNDS[2]),
      Math.max(north, US_BOUNDS[3]),
    ]
    return { kind: 'region', bounds: b, center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] }
  }

  const midLat = (south + north) / 2
  const cos = Math.max(0.2, Math.cos((midLat * Math.PI) / 180))
  const minLon = MIN_FRAME_SPAN / cos
  const lonSpan = Math.max(east - west, minLon)
  const latSpan = Math.max(north - south, MIN_FRAME_SPAN)
  const midLon = (west + east) / 2
  west = midLon - lonSpan / 2 - lonSpan * FRAME_PAD
  east = midLon + lonSpan / 2 + lonSpan * FRAME_PAD
  south = Math.max(-89, midLat - latSpan / 2 - latSpan * FRAME_PAD)
  north = Math.min(89, midLat + latSpan / 2 + latSpan * FRAME_PAD)
  return { kind: 'region', bounds: [west, south, east, north], center: [midLon, midLat] }
}

/**
 * Points along the edge of a bounds box (`[lon, lat]`), for fitting a
 * projection: a curved projection bows the box's edges, so fitting only its
 * corners would crop the middle of each side.
 */
export function boundsOutline([west, south, east, north]: GeoBounds, steps = 8): LonLat[] {
  const out: LonLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lon = west + (east - west) * t
    const lat = south + (north - south) * t
    out.push([lon, south], [lon, north], [west, lat], [east, lat])
  }
  return out
}

export interface Point {
  x: number
  y: number
}

/**
 * Nudges projected pins apart until no two are closer than `minDist`
 * pixels, so a cluster (three bases in one valley) stays readable. Each
 * overlapping pair is pushed apart along the line between them, half each;
 * coincident pins split along a fixed angle per pair, so the result is
 * deterministic. Pins already clear of each other never move. Returns new
 * points; the input is not mutated.
 */
export function spreadPins(points: Point[], minDist: number, maxIter = 60): Point[] {
  const out = points.map(p => ({ x: p.x, y: p.y }))
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d = Math.hypot(dx, dy)
        if (d >= minDist - 1e-6) continue
        if (d < 1e-6) {
          const angle = ((i * 7 + j * 3) % 12) * (Math.PI / 6)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          d = 0
        }
        else {
          dx /= d
          dy /= d
        }
        const push = (minDist - d) / 2 + 0.01
        a.x -= dx * push
        a.y -= dy * push
        b.x += dx * push
        b.y += dy * push
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

/** The largest 1, 2 or 5 × 10ⁿ that is no more than `max` (for the scale bar). */
export function niceLength(max: number): number {
  if (!(max > 0) || !Number.isFinite(max)) return 0
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const m of [5, 2, 1]) {
    if (m * pow <= max) return m * pow
  }
  return pow
}

/** The outline files' format: see `scripts/build-map-outlines.mjs`. */
export interface EncodedOutline {
  v: number
  /** Grid units per degree. */
  scale: number
  /** `p`: polygons (lists of rings); `l`: lines. Each ring or line is delta-encoded. */
  features: { id: string, n: string, p?: number[][][], l?: number[][] }[]
}

function decodeFlat(flat: number[], scale: number): LonLat[] {
  const out: LonLat[] = []
  let x = 0
  let y = 0
  for (let i = 0; i + 1 < flat.length; i += 2) {
    x += flat[i]!
    y += flat[i + 1]!
    out.push([x / scale, y / scale])
  }
  return out
}

/**
 * Decodes an outline file into GeoJSON. Each ring or line is a flat list of
 * integers: the first position in grid units, then deltas. Polygon rings come
 * back closed (the first position repeated at the end), which d3-geo expects;
 * a feature with `l` becomes a MultiLineString (borders drawn as lines only).
 */
export function decodeOutline(data: EncodedOutline): FeatureCollection<MultiPolygon | MultiLineString> {
  const scale = data.scale || 1
  const features: Feature<MultiPolygon | MultiLineString>[] = []
  for (const f of data.features ?? []) {
    const properties = { name: f.n }
    if (f.l?.length) {
      features.push({
        type: 'Feature',
        id: f.id,
        properties,
        geometry: { type: 'MultiLineString', coordinates: f.l.map(line => decodeFlat(line, scale)) },
      })
      continue
    }
    const polygons = (f.p ?? []).map(poly => poly.map((flat) => {
      const ring = decodeFlat(flat, scale)
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]])
      return ring
    }))
    features.push({ type: 'Feature', id: f.id, properties, geometry: { type: 'MultiPolygon', coordinates: polygons } })
  }
  return { type: 'FeatureCollection', features }
}

/** Where a pin's label sits relative to the pin. */
export type LabelSide = 'right' | 'left' | 'top' | 'bottom'

const LABEL_SIDES: LabelSide[] = ['right', 'left', 'top', 'bottom']

export interface LabelRequest extends Point {
  /** Estimated label width in pixels; 0 for a pin with no label. */
  width: number
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The box a label of `width` × `height` occupies on `side` of a pin of radius `r`. */
export function labelBox(p: LabelRequest, side: LabelSide, r: number, height: number): Box {
  const gap = 5
  switch (side) {
    case 'right': return { x0: p.x + r + gap, y0: p.y - height / 2, x1: p.x + r + gap + p.width, y1: p.y + height / 2 }
    case 'left': return { x0: p.x - r - gap - p.width, y0: p.y - height / 2, x1: p.x - r - gap, y1: p.y + height / 2 }
    case 'top': return { x0: p.x - p.width / 2, y0: p.y - r - gap - height, x1: p.x + p.width / 2, y1: p.y - r - gap }
    case 'bottom': return { x0: p.x - p.width / 2, y0: p.y + r + gap, x1: p.x + p.width / 2, y1: p.y + r + gap + height }
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * Picks a side for each pin's label, greedily and in pin order: the first of
 * right, left, top, bottom whose box stays inside the map and clear of every
 * pin and every label already placed; failing that, the side with the least
 * overlap. Pins without a label (width 0) get null. Deterministic.
 */
export function placeLabels(
  pins: LabelRequest[],
  r: number,
  width: number,
  height: number,
  lineHeight = 14,
): (LabelSide | null)[] {
  const pinBoxes: Box[] = pins.map(p => ({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }))
  const placed: Box[] = []
  return pins.map((p, i) => {
    if (!(p.width > 0)) return null
    let best: LabelSide = 'right'
    let bestCost = Infinity
    for (const side of LABEL_SIDES) {
      const box = labelBox(p, side, r, lineHeight)
      let cost = 0
      if (box.x0 < 0 || box.y0 < 0 || box.x1 > width || box.y1 > height) cost += 1e6
      pinBoxes.forEach((b, j) => {
        if (j !== i) cost += overlap(box, b)
      })
      for (const b of placed) cost += overlap(box, b)
      if (cost < bestCost) {
        best = side
        bestCost = cost
      }
      if (cost === 0) break
    }
    placed.push(labelBox(p, best, r, lineHeight))
    return best
  })
}
