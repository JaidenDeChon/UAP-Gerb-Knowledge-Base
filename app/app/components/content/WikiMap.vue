<script setup lang="ts">
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon } from 'geojson'
import type { NoteRef } from '#shared/types/wiki'
import {
  geoArea,
  geoAzimuthalEqualArea,
  geoBounds,
  geoCircle,
  geoContains,
  geoDistance,
  geoEqualEarth,
  geoPath,
  type GeoProjection,
} from 'd3-geo'
import {
  boundsOutline,
  type Box,
  buildMap,
  chooseLocator,
  decodeOutline,
  type EncodedOutline,
  frameRing,
  type GeoBounds,
  type LabelPlacement,
  type LatLon,
  layoutInset,
  layoutLabels,
  lineBoxes,
  LOCATOR_REGIONS,
  locatorEnabled,
  locatorMark,
  type LocatorRegion,
  type LonLat,
  type MapPinSpec,
  type MapRouteSpec,
  MILES_PER_DEGREE,
  mapFrame,
  niceLength,
  normalizeRegion,
  placePins,
  radiusPoints,
  ringBounds,
  spreadPins,
  toLonLat,
  unionBounds,
} from '@/utils/map'

/**
 * `::wiki-map` — where a story happens: numbered pins on a static outline map
 * (a crash site, the bases an object passed through, a test range), optional
 * route lines between them, and a numbered legend under the map that carries
 * everything the map shows as text, so the block reads fully without it.
 *
 * Pins name pages; each page's `coordinates: [lat, lon]` frontmatter comes
 * back from `/api/resolve` with its link. The outlines are Natural Earth
 * (public domain), bundled with the site in `public/geo/` and loaded once,
 * lazily: no tile server and no third-party request. Projection by d3-geo.
 *
 * The SVG is a picture (`role="img"`, with a text summary); the legend is the
 * accessible content, with the links and cue chips. Hovering a pin or a
 * legend row highlights its partner. The only motion (the outlines fading in,
 * hover transitions) is switched off under reduced motion.
 *
 * A regional map carries a locator inset above its scale bar: the whole
 * country (or continent) the view sits in, at thumbnail size, with the area
 * the map shows marked on it. `locator: false` turns it off.
 */
const props = withDefaults(
  defineProps<{
    /** Page titles, or `{ name | text, label?, note?, date?, cue?, coordinates? }`. */
    pins?: MapPinSpec[]
    /** `[1, 2, 3]`, or `{ path | from/to, label?, style: dashed? }`, stops by pin number or name. */
    routes?: MapRouteSpec[]
    /** `auto` (fit the pins, default), `us` or `world`. */
    region?: string
    /** Overrides the kicker ("Map"). */
    label?: string
    caption?: string
    /** The locator inset on a regional map; `false` turns it off. */
    locator?: boolean | string
    /** YouTube id; gates the cue chips, like `::wiki-timeline`'s `video`. */
    video?: string
    videoTitle?: string
  }>(),
  {
    pins: () => [],
    routes: () => [],
    region: 'auto',
    locator: true,
    label: '',
    caption: '',
    video: '',
    videoTitle: '',
  },
)

const model = computed(() => buildMap(props.pins, props.routes))
const { refs } = useWikiResolve(() => model.value.names)

function refOf(name: string): NoteRef | undefined {
  return refs.value.get(name.trim())
}

const places = computed<(LatLon | null)[]>(() =>
  placePins(model.value.pins, (name) => {
    const c = refOf(name)?.coordinates
    return c ? [c[0], c[1]] : undefined
  }),
)
const placed = computed(() => places.value.filter((p): p is LatLon => p !== null))
/** What the frame must take in: every placed pin, and the full extent of any circle. */
const framePoints = computed<LatLon[]>(() => {
  const out = [...placed.value]
  model.value.pins.forEach((pin, i) => {
    const at = places.value[i]
    if (at && pin.radius) out.push(...radiusPoints(at, pin.radius))
  })
  return out
})
const frame = computed(() => mapFrame(framePoints.value, normalizeRegion(props.region)))

/* -- outlines: fetched once per page load, shared by every map ------------- */

interface Outlines {
  world: FeatureCollection<MultiPolygon | MultiLineString>
  /** Only the borders between US states, as lines. */
  states: FeatureCollection<MultiPolygon | MultiLineString>
}

let outlinesPromise: Promise<Outlines> | null = null

function loadOutlines(): Promise<Outlines> {
  outlinesPromise ??= Promise.all([
    $fetch<EncodedOutline>('/geo/world.json'),
    $fetch<EncodedOutline>('/geo/us-states.json'),
  ])
    .then(([world, states]) => ({ world: decodeOutline(world), states: decodeOutline(states) }))
    .catch((err) => {
      outlinesPromise = null
      throw err
    })
  return outlinesPromise
}

const outlines = shallowRef<Outlines | null>(null)
const outlineFailed = ref(false)

// Load once there is something to draw on: a frame may only appear after the
// pins' coordinates come back from /api/resolve.
onMounted(() => {
  watch(
    () => Boolean(frame.value),
    (hasFrame) => {
      if (!hasFrame || outlines.value || outlineFailed.value) return
      loadOutlines()
        .then((o) => {
          outlines.value = markRaw(o)
        })
        .catch(() => {
          outlineFailed.value = true
        })
    },
    { immediate: true },
  )
})

/* -- geometry -------------------------------------------------------------- */

const wrap = ref<HTMLElement | null>(null)
const measured = ref(0)
let ro: ResizeObserver | null = null

// The stage only exists once there is a frame, so observe it whenever it
// (re)appears, and stop on unmount.
watch(wrap, (el) => {
  ro?.disconnect()
  ro = null
  if (!el || typeof ResizeObserver === 'undefined') return
  measured.value = el.clientWidth
  ro = new ResizeObserver(() => {
    measured.value = el.clientWidth
  })
  ro.observe(el)
}, { flush: 'post' })

onBeforeUnmount(() => ro?.disconnect())

/** Pixel width of the drawing; the SVG is drawn 1:1 so pins and type keep their size on a phone. */
const W = computed(() => Math.max(260, Math.round(measured.value || 640)))
const PAD = 14
const PIN_R = 10

const geo = computed<{ projection: GeoProjection, H: number } | null>(() => {
  const f = frame.value
  if (!f) return null
  const w = W.value
  const sample = { type: 'MultiPoint' as const, coordinates: boundsOutline(f.bounds) }
  const projection = f.kind === 'world'
    ? geoEqualEarth()
    : geoAzimuthalEqualArea().rotate([-f.center[0], -f.center[1]])
  projection.fitWidth(w - PAD * 2, sample)
  const [[, y0], [, y1]] = geoPath(projection).bounds(sample)
  const natural = y1 - y0 + PAD * 2
  // Keep the frame between letterbox and portrait: a narrow column may go a
  // little taller than wide so a north-south route still has room.
  const narrow = w < 480
  const H = Math.round(Math.min(Math.max(natural, w * (narrow ? 0.62 : 0.42)), w * (narrow ? 1.05 : 0.78)))
  projection.fitExtent([[PAD, PAD], [w - PAD, H - PAD]], sample)
  // Clipped well below the fitted height: the map may grow a band at the
  // bottom for the inset and scale bar (`insetLayout`), and the land carries
  // on into it. The SVG's own edge does the visible clipping.
  projection.clipExtent([[0, 0], [w, H * 2 + 240]])
  return { projection, H }
})

const H = computed(() => geo.value?.H ?? Math.round(W.value * 0.6))

const land = computed(() => {
  const g = geo.value
  const o = outlines.value
  if (!g || !o) return null
  const path = geoPath(g.projection)
  const draw = (fc: FeatureCollection<MultiPolygon | MultiLineString>) =>
    fc.features.map(f => path(f)).filter((d): d is string => Boolean(d))
  const countries = o.world.features.filter(f => f.id !== 'lake')
  const lakes = o.world.features.filter(f => f.id === 'lake')
  return {
    countries: draw({ type: 'FeatureCollection', features: countries }),
    lakes: draw({ type: 'FeatureCollection', features: lakes }),
    states: draw(o.states),
  }
})

/** Short forms for the few long Natural Earth names a regional map shows. */
const COUNTRY_SHORT: Record<string, string> = {
  'United States of America': 'United States',
  'Dominican Rep.': 'Dominican Republic',
}

/**
 * Country names on a regional map, so a border reads as "which side is
 * which". Each country in view is labelled at the middle of the part of it
 * the map shows (sampled on a coarse grid), kept clear of the pins; one that
 * shows only a sliver gets no label. World maps skip this.
 */
const countryLabels = computed(() => {
  const g = geo.value
  const o = outlines.value
  if (!g || !o || frame.value?.kind !== 'region' || !g.projection.invert) return []
  const cols = 14
  const rows = Math.max(6, Math.round((cols * H.value) / W.value))
  const pins = drawn.value
  const hits = new Map<string, { x: number, y: number }[]>()
  // Only features that actually draw inside the frame are tested.
  const path = geoPath(g.projection)
  const visible = o.world.features.filter(f => f.geometry.type === 'MultiPolygon' && path(f))
  const candidates = visible.filter(f => f.id !== 'lake')
  // Country polygons cover inland water, so a sample in a lake is skipped.
  const lakes = visible.filter(f => f.id === 'lake')
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + ((c + 0.5) * (W.value - PAD * 2)) / cols
      const y = PAD + ((r + 0.5) * (H.value - PAD * 2)) / rows
      const ll = g.projection.invert([x, y])
      if (!ll || lakes.some(f => geoContains(f, ll))) continue
      const hit = candidates.find(f => geoContains(f, ll))
      const name = hit?.properties?.name as string | undefined
      if (!name) continue
      if (!hits.has(name)) hits.set(name, [])
      hits.get(name)!.push({ x, y })
    }
  }
  const out: { name: string, x: number, y: number }[] = []
  for (const [name, pts] of hits) {
    if (pts.length < 4) continue
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
    const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
    // Start from the sample nearest the middle, then take the first one clear of every pin.
    const byCentre = [...pts].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
    const inset = insetBox.value
    const clear = byCentre.find(p =>
      pins.every(q => Math.abs(q.x - p.x) > 70 || Math.abs(q.y - p.y) > 22)
      && (!inset || p.x < inset.x0 - 60 || p.x > inset.x1 + 60 || p.y < inset.y0 - 10 || p.y > inset.y1 + 10),
    )
    if (clear) out.push({ name: (COUNTRY_SHORT[name] ?? name).toUpperCase(), x: clear.x, y: clear.y })
  }
  return out
})

interface DrawnPin {
  i: number
  n: number
  /** Where the pin is drawn, after nudging clusters apart. */
  x: number
  y: number
  /** Where the place really is. */
  x0: number
  y0: number
  moved: boolean
}

const drawn = computed<DrawnPin[]>(() => {
  const g = geo.value
  if (!g) return []
  const raw: { i: number, x: number, y: number }[] = []
  places.value.forEach((ll, i) => {
    if (!ll) return
    const p = g.projection(toLonLat(ll))
    if (p) raw.push({ i, x: p[0], y: p[1] })
  })
  const spread = spreadPins(raw, PIN_R * 2 + 3)
  return raw.map((r, k) => {
    const s = spread[k]!
    const x = Math.min(W.value - PIN_R - 1, Math.max(PIN_R + 1, s.x))
    const y = Math.min(H.value - PIN_R - 1, Math.max(PIN_R + 1, s.y))
    return { i: r.i, n: model.value.pins[r.i]!.n, x, y, x0: r.x, y0: r.y, moved: Math.hypot(x - r.x, y - r.y) > 1 }
  })
})

/** Dashed circles for pins with a `radius`, drawn at the true location. */
const circles = computed(() => {
  const g = geo.value
  if (!g) return []
  const path = geoPath(g.projection)
  const out: { i: number, d: string, box: Box }[] = []
  model.value.pins.forEach((pin, i) => {
    const at = places.value[i]
    if (!at || !pin.radius) return
    const circle = geoCircle().center(toLonLat(at)).radius(pin.radius / MILES_PER_DEGREE).precision(2)()
    const d = path(circle)
    if (!d) return
    const [[x0, y0], [x1, y1]] = path.bounds(circle)
    out.push({ i, d, box: { x0, y0, x1, y1 } })
  })
  return out
})

const byIndex = computed(() => new Map(drawn.value.map(d => [d.i, d])))

interface DrawnRoute {
  d: string
  dashed: boolean
  arrows: { x: number, y: number, angle: number }[]
  /** The drawn stops, in order. */
  points: { x: number, y: number }[]
}

const drawnRoutes = computed<DrawnRoute[]>(() => {
  const out: DrawnRoute[] = []
  for (const r of model.value.routes) {
    const pts = r.stops.map(i => byIndex.value.get(i)).filter((p): p is DrawnPin => Boolean(p))
    if (pts.length < 2) continue
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    const arrows: DrawnRoute['arrows'] = []
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!
      const b = pts[k]!
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      // Only legs with room between the two pins get a direction arrow.
      if (len < PIN_R * 2 + 16) continue
      arrows.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI })
    }
    out.push({ d, dashed: r.dashed, arrows, points: pts.map(p => ({ x: p.x, y: p.y })) })
  }
  return out
})

/** A scale bar (miles, with km) for regional maps; a world map's scale varies too much. */
const scaleBar = computed(() => {
  const g = geo.value
  if (!g || frame.value?.kind !== 'region') return null
  const y = H.value / 2
  const a = g.projection.invert?.([W.value / 2 - 50, y])
  const b = g.projection.invert?.([W.value / 2 + 50, y])
  if (!a || !b) return null
  const milesPer100 = geoDistance(a, b) * 3958.8
  if (!(milesPer100 > 0)) return null
  const miles = niceLength((W.value * 0.22 * milesPer100) / 100)
  if (!miles) return null
  const px = (miles / milesPer100) * 100
  const km = miles * 1.609344
  const kmText = km >= 10 ? Math.round(km).toLocaleString('en-US') : km.toFixed(1)
  return { px, label: `${miles.toLocaleString('en-US')} mi (${kmText} km)` }
})

/* -- locator inset ---------------------------------------------------------- */

/** Height the scale bar and its text take above the bottom padding. */
const SCALE_H = 22
/** Room for the inset's label (a country name) above its frame. */
const INSET_LABEL_H = 12
const INSET_PAD = 3

/** The places the main map shows: its frame's edge, inverted, as a `[lon, lat]` ring. */
const viewRing = computed<LonLat[]>(() => {
  const g = geo.value
  const invert = g?.projection.invert
  if (!g || !invert) return []
  const out: LonLat[] = []
  for (const p of frameRing(W.value, H.value)) {
    const ll = invert([p.x, p.y])
    if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) out.push([ll[0], ll[1]])
  }
  return out
})

type Outline = Feature<MultiPolygon | MultiLineString>

/** Bounds of each outline feature, worked out once per page load. */
const featureBounds = new WeakMap<Outline, GeoBounds>()
function boundsOf(f: Outline): GeoBounds {
  let b = featureBounds.get(f)
  if (!b) {
    const [[w, s], [e, n]] = geoBounds(f)
    b = [w, s, e, n]
    featureBounds.set(f, b)
  }
  return b
}

/**
 * A country's own extent: the bounds of its largest polygon, so France is
 * not stretched to French Guiana. Null for one that straddles the
 * antimeridian (Russia, Fiji), which the continent boxes cover instead.
 */
function countryExtent(f: Outline): GeoBounds | null {
  if (f.geometry.type !== 'MultiPolygon') return null
  let best: MultiPolygon['coordinates'][number] | null = null
  let bestArea = -1
  for (const poly of f.geometry.coordinates) {
    const a = geoArea({ type: 'Polygon', coordinates: poly })
    if (a > bestArea) {
      best = poly
      bestArea = a
    }
  }
  if (!best) return null
  const [[w, s], [e, n]] = geoBounds({ type: 'Polygon', coordinates: best })
  return w <= e ? [w, s, e, n] : null
}

/**
 * What the inset shows: the smallest of the country the view is centred in,
 * the fixed regions (the lower 48, Alaska, Hawaii, the continents) and the
 * world that holds the whole view, if the view is a small enough part of it
 * (`chooseLocator`). Only `region: auto` maps get one: `us` and `world`
 * already show the whole of their area.
 */
const locatorRegion = computed<LocatorRegion | null>(() => {
  const g = geo.value
  const o = outlines.value
  if (!g || !o || !locatorEnabled(props.locator)) return null
  if (frame.value?.kind !== 'region' || normalizeRegion(props.region) !== 'auto') return null
  const view = ringBounds(viewRing.value)
  if (!view) return null
  const candidates: LocatorRegion[] = [...LOCATOR_REGIONS]
  const centre = g.projection.invert?.([W.value / 2, H.value / 2])
  if (centre) {
    // The United States is in the fixed list, split into the lower 48, Alaska and Hawaii.
    const country = o.world.features.find(f =>
      f.id !== 'lake' && f.id !== '840' && f.geometry.type === 'MultiPolygon' && geoContains(f, centre))
    const extent = country ? countryExtent(country) : null
    const name = country?.properties?.name as string | undefined
    if (extent && name) {
      const short = COUNTRY_SHORT[name] ?? name
      candidates.push({ id: `c${country!.id}`, name: short, label: short, bounds: extent, kind: 'country' })
    }
  }
  return chooseLocator(view, candidates)
})

function intersects(a: GeoBounds, b: GeoBounds): boolean {
  // A feature across the antimeridian has west > east: always drawn, and clipped.
  if (a[0] > a[2]) return a[1] <= b[3] && a[3] >= b[1]
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

/** The inset's own drawing, in its local coordinates. */
const locator = computed(() => {
  const region = locatorRegion.value
  const o = outlines.value
  const view = ringBounds(viewRing.value)
  if (!region || !o || !view) return null
  // The region, widened to take in any part of the view that spills past it,
  // with a little air so the view's outline never sits on the inset's edge.
  let bounds = region.bounds
  if (region.kind !== 'world') {
    const [w0, s0, e0, n0] = unionBounds(region.bounds, view)
    const dx = (e0 - w0) * 0.04
    const dy = (n0 - s0) * 0.04
    bounds = [w0 - dx, Math.max(-89, s0 - dy), e0 + dx, Math.min(89, n0 + dy)]
  }
  const w = Math.round(Math.min(116, Math.max(76, W.value * 0.17)))
  const sample = { type: 'MultiPoint' as const, coordinates: boundsOutline(bounds) }
  const projection = region.kind === 'world'
    ? geoEqualEarth()
    : geoAzimuthalEqualArea().rotate([-(bounds[0] + bounds[2]) / 2, -(bounds[1] + bounds[3]) / 2])
  projection.fitWidth(w - INSET_PAD * 2, sample)
  const [[, y0], [, y1]] = geoPath(projection).bounds(sample)
  const h = Math.round(Math.min(Math.max(y1 - y0 + INSET_PAD * 2, w * 0.45), w * 1.15))
  projection.fitExtent([[INSET_PAD, INSET_PAD], [w - INSET_PAD, h - INSET_PAD]], sample)
  projection.clipExtent([[0, 0], [w, h]])
  const path = geoPath(projection)
  const draw = (lakes: boolean) => o.world.features
    .filter(f => (f.id === 'lake') === lakes && intersects(boundsOf(f), bounds))
    .map(f => path(f))
    .filter((d): d is string => Boolean(d))
    .join('')
  return { w, h, projection, land: draw(false), lakes: draw(true), label: region.label, name: region.name, world: region.kind === 'world' }
})

/**
 * The view marked on the inset: the whole SVG's edge (the fitted map plus
 * any band opened below it), inverted to places and projected into the
 * inset. An outline, or a ring when that would be a speck.
 */
const locatorView = computed(() => {
  const L = locator.value
  const invert = geo.value?.projection.invert
  if (!L || !invert) return null
  const points: { x: number, y: number }[] = []
  for (const p of frameRing(W.value, svgH.value)) {
    const ll = invert([p.x, p.y])
    const q = ll && L.projection(ll)
    if (q && Number.isFinite(q[0]) && Number.isFinite(q[1])) points.push({ x: q[0], y: q[1] })
  }
  return locatorMark(points)
})

/** Clearance kept between the inset (or the scale bar) and anything drawn on the map. */
const CLEARANCE = 4

/**
 * Everything the inset and the scale bar must never cover, in the map's
 * pixels: each pin with its ring, its label's box, the leader line and dot
 * of a nudged pin, every route leg with its halo and arrows, and the box
 * of every radius circle. Country names are not here: they step around
 * the inset instead.
 */
const obstacles = computed<Box[]>(() => {
  const out: Box[] = []
  const r = PIN_R + 2.5
  for (const p of drawn.value) {
    out.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r })
    if (p.moved) {
      out.push({ x0: p.x0 - 3.5, y0: p.y0 - 3.5, x1: p.x0 + 3.5, y1: p.y0 + 3.5 })
      out.push(...lineBoxes({ x: p.x0, y: p.y0 }, p, 1))
    }
    const label = labels.value.get(p.i)
    if (label) {
      out.push(label.box)
      if (label.leader) out.push(...lineBoxes({ x: label.leader.x1, y: label.leader.y1 }, { x: label.leader.x2, y: label.leader.y2 }, 1))
    }
  }
  for (const route of drawnRoutes.value) {
    for (let k = 1; k < route.points.length; k++) out.push(...lineBoxes(route.points[k - 1]!, route.points[k]!, 2.5))
    for (const a of route.arrows) out.push({ x0: a.x - 6, y0: a.y - 6, x1: a.x + 6, y1: a.y + 6 })
  }
  for (const c of circles.value) out.push(c.box)
  return out
})

/**
 * Where the inset and the scale bar go (`layoutInset`): the inset right
 * above the scale bar if that's clear of everything, else another clear
 * corner, else the map grows a band at the bottom for both. Neither ever
 * covers a pin, a label or a line. Computed with no inset too, so the
 * scale bar alone keeps the same guarantee.
 */
/** The inset's and the scale bar's boxes (width and height), or null for none. */
const insetSizes = computed(() => {
  const L = locator.value
  const s = scaleBar.value
  return {
    // 8.5px spaced capitals run about 6.3px a character.
    inset: L ? { w: Math.max(L.w, Math.ceil(L.label.length * 6.3)), h: L.h + (L.label ? INSET_LABEL_H : 0) } : null,
    // The scale text (10.5px mono) runs about 6.5px a character.
    scale: s ? { w: Math.max(s.px, s.label.length * 6.5), h: SCALE_H + 3 } : null,
  }
})

const insetLayout = computed(() => {
  const { inset, scale } = insetSizes.value
  return layoutInset({
    width: W.value,
    height: H.value,
    pad: PAD,
    inset,
    scale,
    scaleBottom: PAD - 3,
    gap: 4,
    obstacles: obstacles.value,
    margin: CLEARANCE,
  })
})

const insetBox = computed(() => (locator.value ? insetLayout.value.inset : null))

/** The SVG's full height: the fitted map, plus any band opened for the inset and scale bar. */
const svgH = computed(() => H.value + insetLayout.value.extra)

/* -- text ------------------------------------------------------------------ */

const kicker = computed(() => props.label.trim() || 'Map')

const unplaced = computed(() => model.value.pins.filter((_, i) => !places.value[i]))

const summary = computed(() => {
  const shown = model.value.pins.filter((_, i) => places.value[i])
  const list = shown.map(p => `${p.n}, ${p.name}`).join('; ')
  const where = frame.value?.kind === 'world' ? 'World map' : 'Map'
  const routes = model.value.routes.length
  const L = locator.value
  const within = insetBox.value && L
    ? ` An inset marks the area shown ${L.world ? 'on a map of the world' : `within ${L.name}`}.`
    : ''
  return `${where} with ${shown.length} numbered ${shown.length === 1 ? 'place' : 'places'}${routes ? ` and ${routes} ${routes === 1 ? 'route' : 'routes'}` : ''}: ${list}.${within} The same places are listed below.`
})

function routeText(stops: number[]): string {
  return stops.map(i => model.value.pins[i]!.n).join(' → ')
}

function routeSpoken(stops: number[]): string {
  return `Route: ${stops.map(i => model.value.pins[i]!.name).join(', then ')}`
}

function cueTitle(i: number): string {
  return model.value.pins[i]!.name
}

/* -- linked highlight ------------------------------------------------------ */

const active = ref<number | null>(null)

/**
 * Width of a 12px semibold label, erring wide (capitals run wider than
 * lower case), so the box a label is placed by always covers its text.
 */
function labelWidth(text: string): number {
  if (!text) return 0
  let w = 0
  for (const ch of text) w += ch === ' ' ? 3.6 : /[A-Z0-9MW]/.test(ch) ? 8.4 : /[il.,'()-]/.test(ch) ? 4.2 : 7.2
  return Math.ceil(w) + 2
}

/**
 * Each pin's label (`layoutLabels`), placed so it never sits on another pin,
 * another label, a nudged pin's leader line or dot: beside the pin, else
 * moved out on a leader line, else left to the legend. It keeps off route
 * lines and the inset's and scale bar's usual corner where it can; the
 * inset and scale bar are then placed around the labels (`insetLayout`),
 * so neither ever covers one.
 */
const labels = computed(() => {
  const hard: Box[] = []
  for (const p of drawn.value) {
    if (!p.moved) continue
    hard.push({ x0: p.x0 - 3.5, y0: p.y0 - 3.5, x1: p.x0 + 3.5, y1: p.y0 + 3.5 })
    hard.push(...lineBoxes({ x: p.x0, y: p.y0 }, p, 1))
  }
  const soft: Box[] = []
  for (const route of drawnRoutes.value) {
    for (let k = 1; k < route.points.length; k++) soft.push(...lineBoxes(route.points[k - 1]!, route.points[k]!, 2.5))
    for (const a of route.arrows) soft.push({ x0: a.x - 6, y0: a.y - 6, x1: a.x + 6, y1: a.y + 6 })
  }
  // Where the scale bar, with the inset above it, goes when nothing is in the way.
  const { inset, scale } = insetSizes.value
  const bottom = H.value - (PAD - 3)
  const top = bottom - (scale ? scale.h + 4 : 0) - (inset ? inset.h : 0)
  const colW = Math.max(inset?.w ?? 0, scale?.w ?? 0)
  if (colW) soft.push({ x0: PAD, y0: top, x1: PAD + colW, y1: bottom })

  const placements = layoutLabels(
    drawn.value.map(p => ({ x: p.x, y: p.y, width: labelWidth(model.value.pins[p.i]!.label) })),
    { r: PIN_R + 2, pinR: PIN_R + 2.5, width: W.value, height: H.value, obstacles: hard, soft, margin: 2 },
  )
  const out = new Map<number, LabelPlacement>()
  drawn.value.forEach((p, k) => {
    const l = placements[k]
    if (l) out.set(p.i, l)
  })
  return out
})

/** A label's text position and anchor, relative to its pin. */
function labelAttrs(p: DrawnPin) {
  const l = labels.value.get(p.i)!
  const x = l.anchor === 'start' ? l.box.x0 : l.anchor === 'end' ? l.box.x1 : (l.box.x0 + l.box.x1) / 2
  return { x: x - p.x, y: (l.box.y0 + l.box.y1) / 2 - p.y + 0.5, anchor: l.anchor }
}

function openPin(i: number) {
  const pin = model.value.pins[i]
  const ref = pin?.resolvable ? refOf(pin.name) : undefined
  if (ref) navigateTo(ref.path)
}
</script>

<template>
  <figure v-if="model.pins.length" class="ufo-map">
    <p class="ufo-map-kicker" aria-hidden="true">
      {{ kicker }}
    </p>

    <div v-if="frame" ref="wrap" class="ufo-map-stage">
      <svg
        class="ufo-map-svg"
        :class="{ 'is-loading': !land && !outlineFailed }"
        :width="W"
        :height="svgH"
        :viewBox="`0 0 ${W} ${svgH}`"
        role="img"
        :aria-label="summary"
      >
        <rect class="ufo-map-water" x="0" y="0" :width="W" :height="svgH" />
        <g v-if="land" class="ufo-map-land">
          <path v-for="(d, k) in land.countries" :key="`c${k}`" class="ufo-map-country" :d="d" />
          <path v-for="(d, k) in land.lakes" :key="`w${k}`" class="ufo-map-lake" :d="d" />
          <path v-for="(d, k) in land.states" :key="`s${k}`" class="ufo-map-state" :d="d" />
        </g>

        <g v-if="countryLabels.length" class="ufo-map-countries" aria-hidden="true">
          <text
            v-for="c in countryLabels"
            :key="c.name"
            class="ufo-map-country-label"
            :x="c.x"
            :y="c.y"
            text-anchor="middle"
            dominant-baseline="central"
          >{{ c.name }}</text>
        </g>

        <g class="ufo-map-circles">
          <path
            v-for="c in circles"
            :key="`r${c.i}`"
            class="ufo-map-circle"
            :class="{ 'is-active': active === c.i }"
            :d="c.d"
          />
        </g>

        <g class="ufo-map-routes">
          <g v-for="(r, k) in drawnRoutes" :key="k" :class="{ 'is-dashed': r.dashed }">
            <path class="ufo-map-route-halo" :d="r.d" />
            <path class="ufo-map-route" :d="r.d" />
            <path
              v-for="(a, ai) in r.arrows"
              :key="ai"
              class="ufo-map-arrow"
              d="M-5,-4.5 L5,0 L-5,4.5 Z"
              :transform="`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${a.angle.toFixed(1)})`"
            />
          </g>
        </g>

        <g
          v-if="locator && insetBox"
          class="ufo-map-locator"
          aria-hidden="true"
          :transform="`translate(${insetBox.x0.toFixed(1)} ${insetBox.y0.toFixed(1)})`"
        >
          <text v-if="locator.label" class="ufo-map-locator-label" x="1" :y="INSET_LABEL_H - 4">{{ locator.label.toUpperCase() }}</text>
          <g :transform="locator.label ? `translate(0 ${INSET_LABEL_H})` : undefined">
            <rect class="ufo-map-locator-halo" x="-2" y="-2" :width="locator.w + 4" :height="locator.h + 4" rx="5" />
            <rect class="ufo-map-locator-water" :width="locator.w" :height="locator.h" rx="3.5" />
            <path class="ufo-map-locator-land" :d="locator.land" />
            <path v-if="locator.lakes" class="ufo-map-locator-lake" :d="locator.lakes" />
            <path v-if="locatorView?.kind === 'area'" class="ufo-map-locator-view" :d="locatorView.d" />
            <g v-else-if="locatorView" :transform="`translate(${locatorView.x.toFixed(1)} ${locatorView.y.toFixed(1)})`">
              <circle class="ufo-map-locator-ring" r="5" />
              <circle class="ufo-map-locator-dot" r="1.75" />
            </g>
            <rect class="ufo-map-locator-frame" :width="locator.w" :height="locator.h" rx="3.5" />
          </g>
        </g>

        <g class="ufo-map-pins">
          <g v-for="p in drawn" :key="`l${p.i}`">
            <template v-if="p.moved">
              <line class="ufo-map-leader" :x1="p.x0" :y1="p.y0" :x2="p.x" :y2="p.y" />
              <circle class="ufo-map-spot" :cx="p.x0" :cy="p.y0" r="2.5" />
            </template>
          </g>
          <g
            v-for="p in drawn"
            :key="p.i"
            class="ufo-map-pin"
            :class="{
              'is-plain': !model.pins[p.i]!.resolvable || !refOf(model.pins[p.i]!.name),
              'is-active': active === p.i,
              'is-link': model.pins[p.i]!.resolvable && !!refOf(model.pins[p.i]!.name),
            }"
            :transform="`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`"
            @mouseenter="active = p.i"
            @mouseleave="active = null"
            @click="openPin(p.i)"
          >
            <title>{{ p.n }}. {{ model.pins[p.i]!.name }}</title>
            <circle class="ufo-map-pin-ring" :r="PIN_R + 2.5" />
            <circle class="ufo-map-pin-dot" :r="PIN_R" />
            <text class="ufo-map-pin-n" y="0.5" text-anchor="middle" dominant-baseline="central">{{ p.n }}</text>
            <template v-if="labels.get(p.i)">
              <line
                v-if="labels.get(p.i)!.leader"
                class="ufo-map-label-leader"
                :x1="labels.get(p.i)!.leader!.x1 - p.x"
                :y1="labels.get(p.i)!.leader!.y1 - p.y"
                :x2="labels.get(p.i)!.leader!.x2 - p.x"
                :y2="labels.get(p.i)!.leader!.y2 - p.y"
              />
              <text
                class="ufo-map-pin-label"
                :x="labelAttrs(p).x"
                :y="labelAttrs(p).y"
                :text-anchor="labelAttrs(p).anchor"
                dominant-baseline="central"
              >{{ model.pins[p.i]!.label }}</text>
            </template>
          </g>
        </g>

        <g v-if="scaleBar && insetLayout.scale" class="ufo-map-scale" :transform="`translate(${PAD} ${(insetLayout.scale.y1 - 3).toFixed(1)})`">
          <path class="ufo-map-scale-halo" :d="`M0,-5 V0 H${scaleBar.px.toFixed(1)} V-5`" />
          <path class="ufo-map-scale-bar" :d="`M0,-5 V0 H${scaleBar.px.toFixed(1)} V-5`" />
          <text class="ufo-map-scale-text" x="0" y="-9">{{ scaleBar.label }}</text>
        </g>
      </svg>
    </div>

    <ol class="ufo-map-legend" :aria-label="caption ? `${kicker}: ${caption}` : `${kicker}: places`">
      <li
        v-for="(pin, i) in model.pins"
        :key="i"
        class="ufo-map-item"
        :class="{ 'is-active': active === i, 'is-unplaced': !places[i] }"
        @mouseenter="active = i"
        @mouseleave="active = null"
        @focusin="active = i"
        @focusout="active = null"
      >
        <span
          class="ufo-map-badge"
          :class="{ 'is-plain': !pin.resolvable || !refOf(pin.name) }"
          aria-hidden="true"
        >{{ pin.n }}</span>
        <div class="ufo-map-item-body">
          <div class="ufo-map-item-head">
            <span class="ufo-map-item-name">
              <WikiEntityLink v-if="pin.resolvable" :name="pin.name" :ref-data="refOf(pin.name)" variant="inline" />
              <span v-else>{{ pin.name }}</span>
            </span>
            <span v-if="pin.date" class="ufo-map-item-date">{{ pin.date }}</span>
            <span v-if="pin.radius" class="ufo-map-item-date">radius {{ pin.radius.toLocaleString('en-US') }} mi</span>
            <span v-if="pin.cue !== null && props.video" class="ufo-map-item-cue">
              <WikiCue
                :t="pin.cue"
                :approx="pin.cueApprox"
                :video="props.video"
                :video-title="props.videoTitle"
                :entry-title="cueTitle(i)"
              />
            </span>
          </div>
          <p v-if="pin.note" class="ufo-map-item-note">{{ pin.note }}</p>
          <p v-if="!places[i] && frame" class="ufo-map-item-note is-missing">Not on the map: no coordinates recorded.</p>
        </div>
      </li>
    </ol>

    <ul v-if="model.routes.length" class="ufo-map-routes-list" aria-label="Routes">
      <li v-for="(r, k) in model.routes" :key="k" class="ufo-map-route-item">
        <svg class="ufo-map-swatch" width="28" height="10" viewBox="0 0 28 10" aria-hidden="true">
          <path :class="['ufo-map-swatch-line', { 'is-dashed': r.dashed }]" d="M1,5 H27" />
        </svg>
        <span class="ufo-map-sr">{{ routeSpoken(r.stops) }}{{ r.dashed ? ' (dashed)' : '' }}{{ r.label ? ': ' : '' }}</span>
        <span class="ufo-map-route-stops" aria-hidden="true">{{ routeText(r.stops) }}</span>
        <span v-if="r.label" class="ufo-map-route-label">{{ r.label }}</span>
      </li>
    </ul>

    <figcaption v-if="props.caption || frame" class="ufo-map-caption">
      <span v-if="props.caption">{{ props.caption }}</span>
      <span v-if="frame" class="ufo-map-credit">Outlines: Natural Earth.</span>
      <span v-if="unplaced.length && !frame" class="ufo-map-credit">No coordinates recorded for these places yet.</span>
    </figcaption>
  </figure>
</template>

<style scoped>
/*
 * Every HTML element carries a class, so the page's classless prose rules
 * never reach it (gotcha 4b). The SVG is drawn at its real pixel width
 * (measured), never scaled, so pins and type stay the same size on a phone.
 */
.ufo-map {
  container: map / inline-size;
  margin: 1.75rem 0;
  /* Map inks. Water is the card, land sits one step off it; borders are a
     softened foreground so they read on land in every theme. */
  --map-water: hsl(var(--card));
  --map-land: hsl(var(--muted-foreground) / 0.17);
  --map-border: hsl(var(--muted-foreground) / 0.55);
  --map-state: hsl(var(--muted-foreground) / 0.3);
  --map-route: hsl(var(--primary));
  --map-ink: hsl(var(--foreground));
  --map-paper: hsl(var(--background));
}
.ufo-map-kicker {
  margin: 0 0 8px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-map-stage {
  width: 100%;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: var(--map-water);
  line-height: 0;
}
.ufo-map-svg {
  display: block;
  max-width: 100%;
  height: auto;
}
.ufo-map-water {
  fill: var(--map-water);
}
.ufo-map-country {
  fill: var(--map-land);
  stroke: var(--map-border);
  stroke-width: 0.75;
  stroke-linejoin: round;
}
.ufo-map-lake {
  fill: var(--map-water);
  stroke: var(--map-state);
  stroke-width: 0.6;
}
.ufo-map-state {
  fill: none;
  stroke: var(--map-state);
  stroke-width: 0.6;
  stroke-linejoin: round;
}

/* Country names: quiet, spaced capitals, under everything else. */
.ufo-map-country-label {
  fill: hsl(var(--muted-foreground));
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  pointer-events: none;
}

/* -- routes ---------------------------------------------------------------- */

.ufo-map-route,
.ufo-map-route-halo {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ufo-map-route {
  stroke: var(--map-route);
  stroke-width: 2.25;
}
.ufo-map-route-halo {
  stroke: var(--map-water);
  stroke-width: 5;
  opacity: 0.85;
}
.is-dashed > .ufo-map-route {
  stroke-dasharray: 6 5;
}
.ufo-map-arrow {
  fill: var(--map-route);
  stroke: var(--map-water);
  stroke-width: 1;
  paint-order: stroke;
}

/* -- circles ---------------------------------------------------------------- */

.ufo-map-circle {
  fill: hsl(var(--primary) / 0.08);
  stroke: var(--map-route);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
}
.ufo-map-circle.is-active {
  fill: hsl(var(--primary) / 0.16);
}

/* -- pins ------------------------------------------------------------------ */

.ufo-map-leader {
  stroke: var(--map-ink);
  stroke-width: 1;
  opacity: 0.7;
}
.ufo-map-spot {
  fill: var(--map-ink);
  stroke: var(--map-water);
  stroke-width: 1;
}
.ufo-map-pin-ring {
  fill: var(--map-water);
  opacity: 0.9;
}
.ufo-map-pin-dot {
  fill: var(--map-ink);
  stroke: var(--map-ink);
  stroke-width: 1.5;
}
.ufo-map-pin-n {
  fill: var(--map-paper);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  pointer-events: none;
}
/* A place with no page: a hollow, dashed pin (as ::wiki-chain dashes a
   stage with no page), numbered in ink. */
.ufo-map-pin.is-plain .ufo-map-pin-dot {
  fill: var(--map-water);
  stroke-dasharray: 3 2;
}
.ufo-map-pin.is-plain .ufo-map-pin-n {
  fill: var(--map-ink);
}
.ufo-map-pin.is-link {
  cursor: pointer;
}
.ufo-map-pin.is-active .ufo-map-pin-ring {
  fill: var(--map-route);
  opacity: 1;
}
.ufo-map-label-leader {
  stroke: var(--map-ink);
  stroke-width: 1;
  opacity: 0.55;
}
.ufo-map-pin-label {
  fill: var(--map-ink);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  stroke: var(--map-water);
  stroke-width: 3.5px;
  stroke-linejoin: round;
  paint-order: stroke;
  pointer-events: none;
}

/* -- scale ----------------------------------------------------------------- */

.ufo-map-scale-bar,
.ufo-map-scale-halo {
  fill: none;
}
.ufo-map-scale-bar {
  stroke: var(--map-ink);
  stroke-width: 1.5;
}
.ufo-map-scale-halo {
  stroke: var(--map-water);
  stroke-width: 4;
}
.ufo-map-scale-text {
  fill: var(--map-ink);
  font-family: var(--font-mono);
  font-size: 10.5px;
  stroke: var(--map-water);
  stroke-width: 3px;
  stroke-linejoin: round;
  paint-order: stroke;
}

/* -- locator inset --------------------------------------------------------- */

/* A thumbnail of the whole country or continent, framed off the map by a
   halo in the water colour and a hairline border, with the view marked in
   the route colour. Quieter than anything on the map itself. */
.ufo-map-locator {
  pointer-events: none;
}
.ufo-map-locator-halo {
  fill: var(--map-water);
  opacity: 0.9;
}
.ufo-map-locator-water {
  fill: var(--map-water);
}
.ufo-map-locator-land {
  fill: hsl(var(--muted-foreground) / 0.28);
  stroke: hsl(var(--muted-foreground) / 0.5);
  stroke-width: 0.4;
  stroke-linejoin: round;
}
.ufo-map-locator-lake {
  fill: var(--map-water);
}
.ufo-map-locator-frame {
  fill: none;
  stroke: hsl(var(--muted-foreground) / 0.6);
  stroke-width: 1;
}
.ufo-map-locator-view {
  fill: hsl(var(--primary) / 0.22);
  stroke: var(--map-route);
  stroke-width: 1.25;
  stroke-linejoin: round;
}
.ufo-map-locator-ring {
  fill: hsl(var(--primary) / 0.22);
  stroke: var(--map-route);
  stroke-width: 1.5;
}
.ufo-map-locator-dot {
  fill: var(--map-route);
}
.ufo-map-locator-label {
  fill: hsl(var(--muted-foreground));
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 600;
  letter-spacing: 0.12em;
  stroke: var(--map-water);
  stroke-width: 3px;
  stroke-linejoin: round;
  paint-order: stroke;
}

/* Outlines load after the pins: the water alone stands in until they do. */
@media (prefers-reduced-motion: no-preference) {
  .ufo-map-land {
    animation: ufo-map-fade 0.25s ease-out;
  }
  .ufo-map-pin-ring {
    transition: fill 0.12s ease;
  }
  .ufo-map-item {
    transition: background-color 0.12s ease, border-color 0.12s ease;
  }
}
@keyframes ufo-map-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* -- legend ---------------------------------------------------------------- */

.ufo-map-legend {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}
@container map (min-width: 36rem) {
  .ufo-map-legend {
    grid-template-columns: 1fr 1fr;
    column-gap: 10px;
  }
}
.ufo-map-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 7px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
}
.ufo-map-item.is-active {
  border-color: var(--map-route);
  background-color: hsl(var(--muted) / 0.6);
}
.ufo-map-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 999px;
  border: 1.5px solid var(--map-ink);
  background: var(--map-ink);
  color: var(--map-paper);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.ufo-map-badge.is-plain {
  background: hsl(var(--card));
  color: var(--map-ink);
  border-style: dashed;
}
.ufo-map-item.is-unplaced .ufo-map-badge {
  opacity: 0.6;
}
.ufo-map-item-body {
  min-width: 0;
  flex: 1;
}
.ufo-map-item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}
.ufo-map-item-name {
  font-family: var(--font-sans);
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: hsl(var(--foreground));
}
.ufo-map-item-name :deep(.ufo-entity-link) {
  align-items: flex-start;
}
.ufo-map-item-name :deep(.ufo-entity-dot) {
  margin-top: 0.38em;
}
.ufo-map-item-date {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}
.ufo-map-item-cue {
  margin-left: auto;
  display: inline-flex;
}
.ufo-map-item-note {
  margin: 3px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--foreground) / 0.85);
}
.ufo-map-item-note.is-missing {
  font-style: italic;
  color: hsl(var(--muted-foreground));
}

/* -- routes list ----------------------------------------------------------- */

.ufo-map-routes-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ufo-map-route-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: hsl(var(--foreground));
}
.ufo-map-swatch {
  flex: none;
}
.ufo-map-swatch-line {
  stroke: var(--map-route);
  stroke-width: 2.25;
  stroke-linecap: round;
}
.ufo-map-swatch-line.is-dashed {
  stroke-dasharray: 6 5;
}
.ufo-map-route-stops {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
.ufo-map-route-label {
  color: hsl(var(--foreground) / 0.85);
}
.ufo-map-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.ufo-map-caption {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
}
.ufo-map-credit {
  font-size: 11.5px;
}
.ufo-map-caption > span + span {
  margin-left: 0.4em;
}
</style>
