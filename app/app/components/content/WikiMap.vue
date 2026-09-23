<script setup lang="ts">
import type { FeatureCollection, MultiLineString, MultiPolygon } from 'geojson'
import type { NoteRef } from '#shared/types/wiki'
import { geoAzimuthalEqualArea, geoCircle, geoContains, geoDistance, geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo'
import {
  boundsOutline,
  buildMap,
  decodeOutline,
  type EncodedOutline,
  type LatLon,
  type MapPinSpec,
  type MapRouteSpec,
  MILES_PER_DEGREE,
  mapFrame,
  niceLength,
  normalizeRegion,
  type LabelSide,
  placeLabels,
  placePins,
  radiusPoints,
  spreadPins,
  toLonLat,
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
    /** YouTube id; gates the cue chips, like `::wiki-timeline`'s `video`. */
    video?: string
    videoTitle?: string
  }>(),
  {
    pins: () => [],
    routes: () => [],
    region: 'auto',
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
  projection.clipExtent([[0, 0], [w, H]])
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
    const clear = byCentre.find(p => pins.every(q => Math.abs(q.x - p.x) > 70 || Math.abs(q.y - p.y) > 22))
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
  const out: { i: number, d: string }[] = []
  model.value.pins.forEach((pin, i) => {
    const at = places.value[i]
    if (!at || !pin.radius) return
    const d = path(geoCircle().center(toLonLat(at)).radius(pin.radius / MILES_PER_DEGREE).precision(2)())
    if (d) out.push({ i, d })
  })
  return out
})

const byIndex = computed(() => new Map(drawn.value.map(d => [d.i, d])))

interface DrawnRoute {
  d: string
  dashed: boolean
  arrows: { x: number, y: number, angle: number }[]
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
    out.push({ d, dashed: r.dashed, arrows })
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

/* -- text ------------------------------------------------------------------ */

const kicker = computed(() => props.label.trim() || 'Map')

const unplaced = computed(() => model.value.pins.filter((_, i) => !places.value[i]))

const summary = computed(() => {
  const shown = model.value.pins.filter((_, i) => places.value[i])
  const list = shown.map(p => `${p.n}, ${p.name}`).join('; ')
  const where = frame.value?.kind === 'world' ? 'World map' : 'Map'
  const routes = model.value.routes.length
  return `${where} with ${shown.length} numbered ${shown.length === 1 ? 'place' : 'places'}${routes ? ` and ${routes} ${routes === 1 ? 'route' : 'routes'}` : ''}: ${list}. The same places are listed below.`
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

/** Rough width of a 12px semibold label; close enough to keep labels apart. */
function labelWidth(text: string): number {
  return text ? Math.ceil(text.length * 6.9) + 2 : 0
}

const labelSides = computed(() => {
  const sides = placeLabels(
    drawn.value.map(p => ({ x: p.x, y: p.y, width: labelWidth(model.value.pins[p.i]!.label) })),
    PIN_R + 2,
    W.value,
    H.value,
  )
  return new Map(drawn.value.map((p, k) => [p.i, sides[k] ?? null]))
})

const LABEL_ATTRS: Record<LabelSide, { x: number, y: number, anchor: string }> = {
  right: { x: PIN_R + 5, y: 0.5, anchor: 'start' },
  left: { x: -(PIN_R + 5), y: 0.5, anchor: 'end' },
  top: { x: 0, y: -(PIN_R + 12), anchor: 'middle' },
  bottom: { x: 0, y: PIN_R + 13, anchor: 'middle' },
}

function labelAttrs(i: number) {
  return LABEL_ATTRS[labelSides.value.get(i) ?? 'right']
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
        :height="H"
        :viewBox="`0 0 ${W} ${H}`"
        role="img"
        :aria-label="summary"
      >
        <rect class="ufo-map-water" x="0" y="0" :width="W" :height="H" />
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
            <text
              v-if="model.pins[p.i]!.label"
              class="ufo-map-pin-label"
              :x="labelAttrs(p.i).x"
              :y="labelAttrs(p.i).y"
              :text-anchor="labelAttrs(p.i).anchor"
              dominant-baseline="central"
            >{{ model.pins[p.i]!.label }}</text>
          </g>
        </g>

        <g v-if="scaleBar" class="ufo-map-scale" :transform="`translate(${PAD} ${H - PAD})`">
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
