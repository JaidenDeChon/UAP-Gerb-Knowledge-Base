<script setup lang="ts">
import type { WorldPlace } from '#shared/types/wiki'
import type { MapOutlines } from '@/composables/useMapOutlines'
import type { WorldMode } from '@/composables/useWorldView'
import { geoAzimuthalEqualArea, geoPath, type GeoProjection } from 'd3-geo'
import { boundsOutline } from '@/utils/map'
import { colorizeDensity, type Continent, CONTINENT_BY_ID, continentFrame, HEAT_KERNEL, heatLut, placeSlug } from '@/utils/world'

/**
 * One continent's places on a flat outline map, below the globe. Drawn like
 * `::wiki-map` (the same Natural Earth outlines and map inks) but with small
 * unnumbered dots: a continent can hold a hundred places, and the list
 * beside the globe names them all.
 *
 * Hovering finds the nearest place within reach of the pointer, so a dense
 * cluster (the American Southwest) stays pickable, and shows its name;
 * clicking selects it. In heat mode the dots give way to a density layer on
 * a canvas, coloured by the same one-hue ramp as the globe.
 */
const props = defineProps<{
  continent: Continent
  places: WorldPlace[]
  selected: string | null
  mode: WorldMode
  outlines: MapOutlines | null
}>()

const emit = defineEmits<{ select: [slug: string] }>()

const meta = computed(() => CONTINENT_BY_ID.get(props.continent)!)

/* -- size ------------------------------------------------------------------- */

const stage = ref<HTMLElement | null>(null)
const measured = ref(0)
let ro: ResizeObserver | null = null

onMounted(() => {
  const el = stage.value
  if (!el) return
  measured.value = el.clientWidth
  ro = new ResizeObserver(() => {
    measured.value = el.clientWidth
  })
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const W = computed(() => Math.max(260, Math.round(measured.value || 560)))
const PAD = 12
/** Height over width, the same for every continent's map. */
const ASPECT = 0.72

/* -- projection ------------------------------------------------------------- */

const geo = computed<{ projection: GeoProjection, H: number }>(() => {
  const w = W.value
  const bounds = continentFrame(props.continent, props.places.map(p => [p.lat, p.lon]))
  const sample = { type: 'MultiPoint' as const, coordinates: boundsOutline(bounds) }
  const projection = geoAzimuthalEqualArea()
    .rotate([-(bounds[0] + bounds[2]) / 2, -(bounds[1] + bounds[3]) / 2])
    // Keep the far side of the globe from wrapping round the rim of a wide frame.
    .clipAngle(100)
  // Every continent gets the same frame, so the grid of maps is even: the
  // continent is fitted inside it, and whatever surrounds it fills the rest.
  const H = Math.round(w * ASPECT)
  projection.fitExtent([[PAD, PAD], [w - PAD, H - PAD]], sample)
  projection.clipExtent([[0, 0], [w, H]])
  return { projection, H }
})

const H = computed(() => geo.value.H)

const land = computed(() => {
  const o = props.outlines
  if (!o) return null
  const path = geoPath(geo.value.projection)
  const draw = (lakes: boolean) => o.world.features
    .filter(f => (f.id === 'lake') === lakes)
    .map(f => path(f))
    .filter((d): d is string => Boolean(d))
  return {
    countries: draw(false),
    lakes: draw(true),
    // State lines only where they mean something.
    states: props.continent === 'north-america'
      ? o.states.features.map(f => path(f)).filter((d): d is string => Boolean(d))
      : [],
  }
})

interface Dot {
  slug: string
  place: WorldPlace
  x: number
  y: number
}

const dots = computed<Dot[]>(() => {
  const out: Dot[] = []
  for (const place of props.places) {
    const p = geo.value.projection([place.lon, place.lat])
    if (p) out.push({ slug: placeSlug(place.path), place, x: p[0], y: p[1] })
  }
  return out
})

const selectedDot = computed(() => dots.value.find(d => d.slug === props.selected) ?? null)

/* -- hover ------------------------------------------------------------------ */

/** How far (px) from a dot the pointer may be and still pick it. */
const REACH = 16

const hovered = ref<Dot | null>(null)

function onMove(e: PointerEvent): void {
  const svg = e.currentTarget as SVGSVGElement
  const r = svg.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * W.value
  const y = ((e.clientY - r.top) / r.height) * H.value
  let best: Dot | null = null
  let bestD = REACH
  for (const d of dots.value) {
    const dist = Math.hypot(d.x - x, d.y - y)
    if (dist < bestD) {
      best = d
      bestD = dist
    }
  }
  hovered.value = best
}

function onClick(): void {
  if (hovered.value) emit('select', hovered.value.slug)
}

/** The hover label, kept inside the map: flipped left of the dot near the right edge. */
const tip = computed(() => {
  const d = hovered.value
  if (!d) return null
  const flip = d.x > W.value * 0.62
  return { name: d.place.name, left: `${(d.x / W.value) * 100}%`, top: `${(d.y / H.value) * 100}%`, flip }
})

/* -- heat ------------------------------------------------------------------- */

const canvas = ref<HTMLCanvasElement | null>(null)
const { tokens, isDark } = useThemeTokens(['primary'] as const)

/**
 * A kernel density picture: each place is a soft radial blob of alpha,
 * accumulated on one canvas, and every pixel is then coloured through the
 * heat ramp by how much alpha it gathered (relative to the densest pixel).
 */
function drawHeat(): void {
  const c = canvas.value
  const primary = tokens.value.primary
  if (!c || props.mode !== 'heat' || !primary) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = W.value
  const h = H.value
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const radius = Math.max(26, Math.min(64, w / 10))
  for (const d of dots.value) {
    const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, radius)
    for (const [at, a] of HEAT_KERNEL) g.addColorStop(at, `rgba(0,0,0,${a})`)
    ctx.fillStyle = g
    ctx.fillRect(d.x - radius, d.y - radius, radius * 2, radius * 2)
  }

  const img = ctx.getImageData(0, 0, c.width, c.height)
  colorizeDensity(img.data, heatLut(primary, isDark.value))
  ctx.putImageData(img, 0, 0)
}

watch([() => props.mode, dots, tokens, isDark], () => nextTick(drawHeat), { flush: 'post' })
onMounted(() => nextTick(drawHeat))

const summary = computed(() =>
  `Map of ${meta.value.name} with ${props.places.length} ${props.places.length === 1 ? 'place' : 'places'}${props.mode === 'heat' ? ', shown as density' : ''}.`)
</script>

<template>
  <figure class="ufo-cmap">
    <figcaption class="flex items-baseline gap-1.5 px-3.5 pb-2.5 pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      <span class="text-primary opacity-70">//</span>
      <span class="flex-1 text-foreground">{{ meta.name }}</span>
      <span class="text-[10px] tracking-[0.06em]">{{ places.length }} {{ places.length === 1 ? 'place' : 'places' }}</span>
    </figcaption>

    <!-- Drawn on the client only, once the stage's width is known: an SVG
         rendered on the server at a guessed width can't hydrate cleanly. -->
    <div ref="stage" class="ufo-cmap-stage" :style="measured ? undefined : { aspectRatio: `1 / ${ASPECT}` }">
      <svg
        v-if="measured"
        class="ufo-cmap-svg"
        :class="{ 'is-loading': !land, 'is-hovering': hovered }"
        :viewBox="`0 0 ${W} ${H}`"
        :width="W"
        :height="H"
        role="img"
        :aria-label="summary"
        @pointermove="onMove"
        @pointerleave="hovered = null"
        @click="onClick"
      >
        <rect class="ufo-cmap-water" :width="W" :height="H" />
        <g v-if="land" class="ufo-cmap-land">
          <path v-for="(d, k) in land.countries" :key="`c${k}`" class="ufo-cmap-country" :d="d" />
          <path v-for="(d, k) in land.lakes" :key="`l${k}`" class="ufo-cmap-lake" :d="d" />
          <path v-for="(d, k) in land.states" :key="`s${k}`" class="ufo-cmap-state" :d="d" />
        </g>

        <g v-if="mode === 'pins'" class="ufo-cmap-dots">
          <circle
            v-for="d in dots"
            :key="d.slug"
            class="ufo-cmap-dot"
            :class="{ 'is-hover': hovered?.slug === d.slug }"
            :cx="d.x.toFixed(1)"
            :cy="d.y.toFixed(1)"
            r="4"
          />
        </g>
      </svg>

      <canvas v-if="measured" v-show="mode === 'heat'" ref="canvas" class="ufo-cmap-layer" aria-hidden="true" />

      <!-- Above the heat layer, so the selection shows in either mode. -->
      <svg v-if="measured && selectedDot" class="ufo-cmap-layer" :viewBox="`0 0 ${W} ${H}`" aria-hidden="true">
        <g :transform="`translate(${selectedDot.x.toFixed(1)} ${selectedDot.y.toFixed(1)})`">
          <circle class="ufo-cmap-halo" r="11" />
          <circle class="ufo-cmap-sel" r="6" />
        </g>
      </svg>

      <div
        v-if="tip"
        class="ufo-cmap-tip"
        :class="{ 'is-flipped': tip.flip }"
        :style="{ left: tip.left, top: tip.top }"
        aria-hidden="true"
      >
        {{ tip.name }}
      </div>
    </div>
  </figure>
</template>

<style scoped>
.ufo-cmap {
  margin: 0;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card));
  /* ::wiki-map's inks, so the two kinds of map read as one family. */
  --map-water: hsl(var(--card));
  --map-land: hsl(var(--muted-foreground) / 0.17);
  --map-border: hsl(var(--muted-foreground) / 0.55);
  --map-state: hsl(var(--muted-foreground) / 0.3);
  --map-ink: hsl(var(--foreground));
}
.ufo-cmap-stage {
  position: relative;
  border-top: 1px solid hsl(var(--border));
  line-height: 0;
}
.ufo-cmap-svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: manipulation;
}
.ufo-cmap-svg.is-hovering {
  cursor: pointer;
}
.ufo-cmap-water {
  fill: var(--map-water);
}
.ufo-cmap-country {
  fill: var(--map-land);
  stroke: var(--map-border);
  stroke-width: 0.6;
  stroke-linejoin: round;
}
.ufo-cmap-lake {
  fill: var(--map-water);
  stroke: var(--map-state);
  stroke-width: 0.5;
}
.ufo-cmap-state {
  fill: none;
  stroke: var(--map-state);
  stroke-width: 0.5;
}
.ufo-cmap-dot {
  fill: var(--map-ink);
  stroke: var(--map-water);
  stroke-width: 1.5;
  paint-order: stroke;
}
.ufo-cmap-dot.is-hover {
  fill: hsl(var(--primary));
}
.ufo-cmap-halo {
  fill: hsl(var(--primary) / 0.2);
  stroke: hsl(var(--primary));
  stroke-width: 1.5;
}
.ufo-cmap-sel {
  fill: hsl(var(--primary));
  stroke: var(--map-water);
  stroke-width: 2;
}
.ufo-cmap-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.ufo-cmap-tip {
  position: absolute;
  z-index: 2;
  transform: translate(10px, -50%);
  padding: 4px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--popover, var(--card)));
  box-shadow: var(--shadow-popover);
  color: hsl(var(--foreground));
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
}
.ufo-cmap-tip.is-flipped {
  transform: translate(calc(-100% - 10px), -50%);
}
@media (prefers-reduced-motion: no-preference) {
  .ufo-cmap-land {
    animation: ufo-cmap-fade 0.25s ease-out;
  }
}
@keyframes ufo-cmap-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
