/**
 * Pure logic behind `::wiki-map` (WikiMap.vue): normalising the loosely typed
 * YAML an author writes into numbered pins and routes, choosing the map's
 * frame, nudging overlapping pins apart, picking a round scale-bar length,
 * decoding the bundled outline files, and choosing and placing the locator
 * inset (the small overview map). No Nuxt runtime and no d3, so it is
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
export type LabelSide = 'right' | 'left' | 'top' | 'bottom' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

/** The positions tried beside a pin, in order of preference. */
export const LABEL_SIDES: readonly LabelSide[] = ['right', 'left', 'top', 'bottom', 'top-right', 'bottom-right', 'top-left', 'bottom-left']

export interface LabelRequest extends Point {
  /** Estimated label width in pixels; 0 for a pin with no label. */
  width: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * The box a label of `width` × `height` occupies on `side` of a pin of
 * radius `r`: level with it on the right or left, centred above or below,
 * or off a corner, the box's own corner just clear of the ring at 45°.
 */
export function labelBox(p: LabelRequest, side: LabelSide, r: number, height: number): Box {
  const gap = 5
  // A diagonal box's near corner sits on the 45° line, just outside the ring.
  const d = r * Math.SQRT1_2 + 3
  switch (side) {
    case 'right': return { x0: p.x + r + gap, y0: p.y - height / 2, x1: p.x + r + gap + p.width, y1: p.y + height / 2 }
    case 'left': return { x0: p.x - r - gap - p.width, y0: p.y - height / 2, x1: p.x - r - gap, y1: p.y + height / 2 }
    case 'top': return { x0: p.x - p.width / 2, y0: p.y - r - gap - height, x1: p.x + p.width / 2, y1: p.y - r - gap }
    case 'bottom': return { x0: p.x - p.width / 2, y0: p.y + r + gap, x1: p.x + p.width / 2, y1: p.y + r + gap + height }
    case 'top-right': return { x0: p.x + d, y0: p.y - d - height, x1: p.x + d + p.width, y1: p.y - d }
    case 'top-left': return { x0: p.x - d - p.width, y0: p.y - d - height, x1: p.x - d, y1: p.y - d }
    case 'bottom-right': return { x0: p.x + d, y0: p.y + d, x1: p.x + d + p.width, y1: p.y + d + height }
    case 'bottom-left': return { x0: p.x - d - p.width, y0: p.y + d, x1: p.x - d, y1: p.y + d + height }
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

/** Small boxes along a line from `a` to `b`, `half` pixels either side of it, every 4px. */
export function lineBoxes(a: Point, b: Point, half: number): Box[] {
  const out: Box[] = []
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4))
  for (let s = 0; s <= n; s++) {
    const x = a.x + ((b.x - a.x) * s) / n
    const y = a.y + ((b.y - a.y) * s) / n
    out.push({ x0: x - half, y0: y - half, x1: x + half, y1: y + half })
  }
  return out
}

/** Where a pin's label went. */
export interface LabelPlacement {
  /** Beside the pin, or `leader`: moved to an open spot, with a line back to the pin. */
  side: LabelSide | 'leader'
  box: Box
  /** How the text hangs in its box: from the edge nearest the pin, or centred above or below it. */
  anchor: 'start' | 'middle' | 'end'
  /** From the pin's ring to the label, for `leader`; null otherwise. */
  leader: { x1: number, y1: number, x2: number, y2: number } | null
}

export interface LabelLayoutOptions {
  /** Radius a label keeps clear of its own pin's centre (the ring, plus a little). */
  r: number
  /** Half-size of every pin's box, as an obstacle to other pins' labels (the ring). */
  pinR?: number
  width: number
  height: number
  lineHeight?: number
  /**
   * Hard obstacles besides the pins and the labels already placed: leader
   * lines and dots of nudged pins, the locator inset, the scale bar. A
   * label never touches one.
   */
  obstacles?: Box[]
  /** Soft obstacles (route lines, the inset's usual spot): avoided when there's a choice. */
  soft?: Box[]
  /** Clearance kept from every hard obstacle. */
  margin?: number
}

/** Distances (from the pin's centre, past the ring) tried for a leader-line label. */
const LEADER_STEPS = [26, 40, 56, 74]
/** Directions tried for a leader-line label: 16 compass points, starting east. */
const LEADER_ANGLES = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8)

/**
 * Places every pin's label, greedily in pin order, so that no label ever
 * touches another pin (its ring), another label, a leader line or any
 * other hard obstacle, and stays inside the map:
 *
 * 1. beside the pin: right, left, above, below, then the four diagonals.
 *    Of the positions that are clear, the first crossing no soft obstacle
 *    wins, else the one crossing least;
 * 2. else moved to an open spot nearby (four distances, sixteen
 *    directions), with a leader line from the ring that itself crosses no
 *    pin, label or obstacle;
 * 3. else no label on the map (null): the numbered legend names every pin.
 *
 * Pins without a label (width 0) get null. Deterministic.
 */
export function layoutLabels(pins: LabelRequest[], opts: LabelLayoutOptions): (LabelPlacement | null)[] {
  const { r, width, height } = opts
  const pinR = opts.pinR ?? r
  const lh = opts.lineHeight ?? 14
  const margin = opts.margin ?? 2
  const soft = opts.soft ?? []
  const pinBoxes: Box[] = pins.map(p => ({ x0: p.x - pinR, y0: p.y - pinR, x1: p.x + pinR, y1: p.y + pinR }))
  const placed: Box[] = []
  const hard = (i: number): Box[] => [...pinBoxes.filter((_, j) => j !== i), ...placed, ...(opts.obstacles ?? [])]
  const inside = (b: Box) => b.x0 >= 1 && b.y0 >= 1 && b.x1 <= width - 1 && b.y1 <= height - 1
  const softCost = (b: Box) => soft.reduce((sum, o) => sum + overlap(b, o), 0)

  return pins.map((p, i) => {
    if (!(p.width > 0)) return null
    const blockers = hard(i)
    const ok = (b: Box) => inside(b) && !boxHits(b, blockers, margin)

    let best: LabelPlacement | null = null
    let bestCost = Infinity
    for (const side of LABEL_SIDES) {
      const box = labelBox(p, side, r, lh)
      if (!ok(box)) continue
      const cost = softCost(box)
      if (cost < bestCost) {
        best = { side, box, anchor: side.endsWith('left') ? 'end' : side === 'top' || side === 'bottom' ? 'middle' : 'start', leader: null }
        bestCost = cost
      }
      if (cost === 0) break
    }

    if (!best) {
      search: for (const dist of LEADER_STEPS) {
        for (const angle of LEADER_ANGLES) {
          const dx = Math.cos(angle)
          const dy = Math.sin(angle)
          const ax = p.x + dx * (r + dist)
          const ay = p.y + dy * (r + dist)
          // The label hangs off the anchor on the side away from the pin.
          const box: Box = Math.abs(dx) > 0.38
            ? (dx > 0
                ? { x0: ax, y0: ay - lh / 2, x1: ax + p.width, y1: ay + lh / 2 }
                : { x0: ax - p.width, y0: ay - lh / 2, x1: ax, y1: ay + lh / 2 })
            : (dy > 0
                ? { x0: ax - p.width / 2, y0: ay, x1: ax + p.width / 2, y1: ay + lh }
                : { x0: ax - p.width / 2, y0: ay - lh, x1: ax + p.width / 2, y1: ay })
          if (!ok(box)) continue
          const from = { x: p.x + dx * (pinR + 1), y: p.y + dy * (pinR + 1) }
          const to = { x: ax - dx * 2, y: ay - dy * 2 }
          // The line may not cross another pin, a label or an obstacle either.
          if (lineBoxes(from, to, 1).some(b => boxHits(b, blockers, 1))) continue
          const anchor = Math.abs(dx) > 0.38 ? (dx > 0 ? 'start' : 'end') : 'middle'
          best = { side: 'leader', box, anchor, leader: { x1: from.x, y1: from.y, x2: to.x, y2: to.y } }
          break search
        }
      }
    }

    if (!best) return null
    placed.push(best.box)
    if (best.leader) {
      const { x1, y1, x2, y2 } = best.leader
      placed.push(...lineBoxes({ x: x1, y: y1 }, { x: x2, y: y2 }, 1))
    }
    return best
  })
}

/* -- locator inset ---------------------------------------------------------- */

/**
 * An area the locator inset can show: the whole of a country, a continent or
 * the world, with the main map's view marked inside it.
 */
export interface LocatorRegion {
  id: string
  /** For the text summary ("… within South America"). */
  name: string
  /** Drawn on the inset; empty for continents and the world, whose shape says enough. */
  label: string
  bounds: GeoBounds
  kind: 'country' | 'continent' | 'world'
}

/**
 * The fixed candidates, beside the country the view sits in (found at run
 * time from the outlines). The United States is split, so a view in
 * California shows the lower 48 and not a map stretched to the Aleutians.
 * Continent boxes are generous rather than exact: they only decide what the
 * inset frames.
 */
export const LOCATOR_REGIONS: readonly LocatorRegion[] = [
  { id: 'us', name: 'the contiguous United States', label: 'United States', bounds: US_BOUNDS, kind: 'country' },
  { id: 'us-ak', name: 'Alaska', label: 'Alaska', bounds: [-170, 51, -129.9, 71.5], kind: 'country' },
  { id: 'us-hi', name: 'Hawaii', label: 'Hawaii', bounds: [-160.6, 18.5, -154.4, 22.6], kind: 'country' },
  { id: 'north-america', name: 'North America', label: '', bounds: [-170, 5, -50, 75], kind: 'continent' },
  { id: 'south-america', name: 'South America', label: '', bounds: [-82, -56, -34, 13], kind: 'continent' },
  { id: 'europe', name: 'Europe', label: '', bounds: [-25, 34, 45, 72], kind: 'continent' },
  { id: 'africa', name: 'Africa', label: '', bounds: [-18, -35, 52, 38], kind: 'continent' },
  { id: 'asia', name: 'Asia', label: '', bounds: [25, -11, 150, 78], kind: 'continent' },
  { id: 'oceania', name: 'Oceania', label: '', bounds: [110, -48, 180, 0], kind: 'continent' },
  { id: 'world', name: 'the world', label: '', bounds: WORLD_BOUNDS, kind: 'world' },
]

/**
 * How far (as a share of the region's own span, on each side) a view may
 * spill past a region and still count as inside it: a Texas–Chihuahua map is
 * still "in the United States", with the inset widened to take in the rest.
 */
export const LOCATOR_MARGIN = 0.1

/**
 * The inset only earns its place when the view is a small part of the
 * region: past this share of the region's area the main map already shows
 * most of it, and the next larger region is tried instead.
 */
export const LOCATOR_MAX_SHARE = 0.5

/** Below this size in pixels (both ways) the view is marked with a ring, not its outline. */
export const LOCATOR_MIN_MARK = 7

const RAD = Math.PI / 180

/** Area of a lat/lon box on the unit sphere (steradians): exact for a box, no projection needed. */
export function boundsArea([west, south, east, north]: GeoBounds): number {
  const lon = Math.max(0, east - west) * RAD
  return lon * Math.max(0, Math.sin(north * RAD) - Math.sin(south * RAD))
}

/** True when `inner` lies inside `outer`, grown by `margin` of its span on every side. */
export function containsBounds(outer: GeoBounds, inner: GeoBounds, margin = LOCATOR_MARGIN): boolean {
  const dx = (outer[2] - outer[0]) * margin
  const dy = (outer[3] - outer[1]) * margin
  return inner[0] >= outer[0] - dx && inner[2] <= outer[2] + dx && inner[1] >= outer[1] - dy && inner[3] <= outer[3] + dy
}

export function unionBounds(a: GeoBounds, b: GeoBounds): GeoBounds {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

/**
 * The bounds of a ring of `[lon, lat]` points (the main map's visible edge).
 * A ring that seems to span more than half the globe has crossed the
 * antimeridian, and gets every longitude: only the world contains it.
 */
export function ringBounds(ring: LonLat[]): GeoBounds | null {
  if (!ring.length) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon)
    east = Math.max(east, lon)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  if (east - west > 180) return [-180, south, 180, north]
  return [west, south, east, north]
}

/**
 * Picks the inset's region: the smallest candidate that contains the view
 * (allowing `LOCATOR_MARGIN`) and of which the view covers no more than
 * `maxShare`. The world contains every view. Null when nothing qualifies (a
 * view of half the world). `candidates` is usually the country the view sits
 * in plus `LOCATOR_REGIONS`.
 */
export function chooseLocator(
  view: GeoBounds,
  candidates: readonly LocatorRegion[] = LOCATOR_REGIONS,
  maxShare = LOCATOR_MAX_SHARE,
): LocatorRegion | null {
  const viewArea = boundsArea(view)
  const sorted = [...candidates].sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds))
  for (const region of sorted) {
    if (region.kind !== 'world' && !containsBounds(region.bounds, view)) continue
    if (viewArea > boundsArea(region.bounds) * maxShare) continue
    return region
  }
  return null
}

/**
 * Pixel points along the edge of a `width` × `height` rectangle, clockwise
 * from the top-left corner, `steps` per side: the main map's frame, to be
 * inverted into the ring of places it shows.
 */
export function frameRing(width: number, height: number, steps = 6): Point[] {
  const out: Point[] = []
  for (let i = 0; i < steps; i++) out.push({ x: (width * i) / steps, y: 0 })
  for (let i = 0; i < steps; i++) out.push({ x: width, y: (height * i) / steps })
  for (let i = 0; i < steps; i++) out.push({ x: width - (width * i) / steps, y: height })
  for (let i = 0; i < steps; i++) out.push({ x: 0, y: height - (height * i) / steps })
  return out
}

/** How the view is marked on the inset: its outline, or a ring when the outline would be a speck. */
export type LocatorMark =
  | { kind: 'area', d: string }
  | { kind: 'dot', x: number, y: number }

/**
 * The view's outline as an SVG path, from its ring projected onto the inset;
 * a ring at its centre instead when the outline would be under `minSize`
 * pixels both ways. Null for an empty ring.
 */
export function locatorMark(points: Point[], minSize = LOCATOR_MIN_MARK): LocatorMark | null {
  if (!points.length) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  if (x1 - x0 < minSize && y1 - y0 < minSize) return { kind: 'dot', x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  const d = `${points.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`
  return { kind: 'area', d }
}

/** `locator:` as written: on unless it says `false`, `off`, `no` or `none`. */
export function locatorEnabled(v: unknown): boolean {
  if (v === false || v === 0) return false
  return !['false', 'off', 'no', 'none', '0'].includes(str(v).toLowerCase())
}

/** True when `box`, grown by `margin` on every side, touches any of `obstacles`. */
export function boxHits(box: Box, obstacles: Box[], margin = 0): boolean {
  const grown = { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin }
  return obstacles.some(o => overlap(grown, o) > 0)
}

export interface InsetLayoutInput {
  /** The map's drawn width and fitted height, before any extension. */
  width: number
  height: number
  /** The frame's inner padding: the gap between the inset (or scale bar) and the edge. */
  pad: number
  /** The inset's box (including its label), or null for none. */
  inset: { w: number, h: number } | null
  /** The scale bar's box (bar and text), or null for none. Always bottom-left. */
  scale: { w: number, h: number } | null
  /** Distance from the frame's bottom edge to the bottom of the scale bar's box. */
  scaleBottom: number
  /** Space between the inset and the scale bar above which it sits. */
  gap: number
  /**
   * Everything drawn that must stay uncovered, in the map's pixels: pins,
   * pin labels, leader lines, route lines, radius circles.
   */
  obstacles: Box[]
  /** Clearance kept between the inset or scale bar and any obstacle. */
  margin: number
}

export interface InsetLayout {
  inset: Box | null
  scale: Box | null
  /**
   * Pixels added below the fitted map to make room: 0 when the inset and the
   * scale bar fit clear of everything as it is. The map's projection doesn't
   * change; the extra band shows more of the country below, with nothing in
   * it.
   */
  extra: number
}

/**
 * Places the locator inset and the scale bar so that neither covers
 * anything on the map (`obstacles`, grown by `margin`). In order:
 *
 * 1. the inset directly above the scale bar, bottom left;
 * 2. with the scale bar clear where it is, the inset in the bottom-right,
 *    top-left or top-right corner;
 * 3. failing both, the map is extended downwards (`extra`) just far enough
 *    that the scale bar, with the inset above it, sits below every obstacle
 *    in its column. The pins all lie inside the fitted height, so this
 *    always succeeds: no overlap in any case.
 */
export function layoutInset(input: InsetLayoutInput): InsetLayout {
  const { width, height, pad, inset, scale, scaleBottom, gap, obstacles, margin } = input
  const column = (extra: number) => {
    const bottom = height + extra - scaleBottom
    const s: Box | null = scale ? { x0: pad, y0: bottom - scale.h, x1: pad + scale.w, y1: bottom } : null
    const top = s ? s.y0 - gap : height + extra - pad
    const i: Box | null = inset ? { x0: pad, y0: top - inset.h, x1: pad + inset.w, y1: top } : null
    return { inset: i, scale: s }
  }
  const clear = (b: Box | null) => !b || (b.y0 >= pad && !boxHits(b, obstacles, margin))

  const here = column(0)
  if (clear(here.scale) && clear(here.inset)) return { ...here, extra: 0 }

  if (inset && clear(here.scale)) {
    const corners: [number, number][] = [
      [width - pad - inset.w, height - pad - inset.h],
      [pad, pad],
      [width - pad - inset.w, pad],
    ]
    for (const [x, y] of corners) {
      const b: Box = { x0: x, y0: y, x1: x + inset.w, y1: y + inset.h }
      if (b.x0 >= 0 && clear(b)) return { inset: b, scale: here.scale, extra: 0 }
    }
  }

  // Extend: push the whole column below the lowest obstacle in its path.
  const boxes = [here.inset, here.scale].filter((b): b is Box => Boolean(b))
  if (!boxes.length) return { inset: null, scale: null, extra: 0 }
  const x0 = Math.min(...boxes.map(b => b.x0))
  const x1 = Math.max(...boxes.map(b => b.x1))
  const top = Math.min(...boxes.map(b => b.y0))
  let lowest = -Infinity
  for (const o of obstacles) {
    if (o.x1 > x0 - margin && o.x0 < x1 + margin) lowest = Math.max(lowest, o.y1)
  }
  // …and never above the frame's top padding, on a map too short to hold it.
  const extra = Math.max(0, Math.ceil(lowest + margin + 1 - top), Math.ceil(pad - top))
  return { ...column(extra), extra }
}
