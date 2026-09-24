<script setup lang="ts">
import type { GlobeInstance } from 'globe.gl'
import type { WorldPlace } from '#shared/types/wiki'
import type { WorldMode } from '@/composables/useWorldView'
import { Minus, Plus, RotateCcw } from '@lucide/vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { colorizeDensity, globeOutlines, HEAT_KERNEL, heatLut, type Hsl, hslString, placeSlug, rgbaString } from '@/utils/world'

/**
 * The `/world` page's hero: a 3D globe (globe.gl, over three.js) with every
 * placed Location on it. Vector only, drawn like the continent maps and
 * `::wiki-map`: the sphere is the water, a step off the page's surface; the
 * countries are flat fills with their borders, lakes cut back to water, and
 * US state lines drawn over them, all in the maps' inks. The theme's primary
 * is the atmosphere's glow and a soft light raking across the sphere. Every
 * colour comes from the theme tokens and follows a theme change.
 *
 * `pins` draws each place as a small post; `heat` swaps them for a density
 * glow wrapped round the sphere (`drawHeat`: the same kernel and one-hue
 * ramp as the continent maps). The selected place
 * is drawn larger, in the primary, with a pulsing ring, and the camera flies
 * to it. Clicking a pin selects it.
 *
 * globe.gl and three.js are imported when the component mounts, so no other
 * page carries them. Rendering pauses while the globe is scrolled out of
 * view. Under reduced motion there is no auto-rotation, no ring pulse, and
 * the camera jumps instead of flying.
 */
const props = defineProps<{
  places: WorldPlace[]
  selected: string | null
  mode: WorldMode
  /**
   * Milliseconds to hold off building the globe: the page passes the UFO
   * loader's exit time when it arrived through the loader, so the build
   * (the heaviest work on the page) doesn't stall that animation.
   */
  defer?: number
}>()

const emit = defineEmits<{ select: [slug: string] }>()

const host = ref<HTMLElement | null>(null)
const ready = ref(false)
const failed = ref(false)

const { tokens, isDark } = useThemeTokens(['primary', 'card', 'muted', 'foreground', 'muted-foreground', 'background'] as const)
const reducedMotion = usePreferredReducedMotion()
const still = computed(() => reducedMotion.value === 'reduce')

let globe: GlobeInstance | null = null
let three: typeof import('three') | null = null
let rakeLight: import('three').DirectionalLight | null = null
/** Flat (unlit) fills for the land and the lakes, so they match the 2D maps' colours exactly. */
let landMaterial: import('three').MeshBasicMaterial | null = null
let lakeMaterial: import('three').MeshBasicMaterial | null = null
let heatShell: import('three').Mesh<import('three').SphereGeometry, import('three').MeshBasicMaterial> | null = null
let ro: ResizeObserver | null = null
let io: IntersectionObserver | null = null

const bySlug = computed(() => new Map(props.places.map(p => [placeSlug(p.path), p])))
const current = computed(() => (props.selected ? bySlug.value.get(props.selected) ?? null : null))

/** Most places are in North America: start there, far enough out to see the whole disc. */
const HOME = { lat: 28, lng: -62, altitude: 2.05 }
const FOCUS_ALTITUDE = 1.45

/* -- colours ---------------------------------------------------------------- */

/** A token, lightened or darkened by `dl` points, as `rgba()` (the one form every globe layer reads alpha from). */
function tone(c: Hsl | undefined, fallback: Hsl, dl = 0, alpha = 1): string {
  const base = c ?? fallback
  return rgbaString({ ...base, l: Math.min(100, Math.max(0, base.l + dl)) }, alpha)
}

const GREEN: Hsl = { h: 142, s: 70, l: 45 }
const INK: Hsl = { h: 0, s: 0, l: 10 }
const PAPER: Hsl = { h: 0, s: 0, l: 98 }

/** `ink` laid over `ground` at `alpha`, as one opaque colour (by lightness; the hue and saturation are the ink's). */
function over(ink: Hsl, ground: Hsl, alpha: number): Hsl {
  return { ...ink, l: ground.l + (ink.l - ground.l) * alpha }
}

/**
 * The map inks of the continent maps and `::wiki-map` (land 17%, borders 55%,
 * state lines 30% of the muted foreground over the water), pre-mixed into
 * opaque colours: WebGL layers blend by draw order, not like stacked CSS,
 * and a translucent land layer would sort behind the heat shell and vanish.
 */
const palette = computed(() => {
  const t = tokens.value
  const dark = isDark.value
  const primary = t.primary ?? GREEN
  // The water is the card, as on the flat maps. On a light theme it steps a
  // little darker so the sphere reads against the white panel; on a dark one
  // it stays the card's black, and the atmosphere's rim draws the edge.
  const card = t.card ?? (dark ? INK : PAPER)
  const water = dark ? card : { ...card, l: card.l - 4 }
  const ink = t['muted-foreground'] ?? (dark ? PAPER : INK)
  const land = over(ink, water, 0.17)
  return {
    primary: hslString(primary),
    water: hslString(water),
    land: hslString(land),
    border: rgbaString(over(ink, land, 0.55)),
    state: rgbaString(over(ink, land, 0.3)),
    pin: dark ? tone(t.foreground, PAPER, -2) : tone(t.foreground, INK, 6),
    ring: (a: number) => rgbaString(primary, a),
    primaryHsl: primary,
    dark,
  }
})

/* -- layers ----------------------------------------------------------------- */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch]!)
}

function applyColours(): void {
  if (!globe || !three) return
  const p = palette.value
  const material = globe.globeMaterial() as import('three').MeshPhongMaterial
  material.color = new three.Color(p.water)
  material.emissive = new three.Color(p.primary)
  // No primary tint on a dark sphere: it would turn the black ocean green.
  material.emissiveIntensity = p.dark ? 0 : 0.01
  material.shininess = p.dark ? 14 : 6
  material.needsUpdate = true
  rakeLight?.color.set(p.primary)
  if (rakeLight) rakeLight.intensity = p.dark ? 0 : 0.3
  globe
    .atmosphereColor(p.primary)
    .atmosphereAltitude(p.dark ? 0.2 : 0.16)
    .polygonStrokeColor(d => ((d as { id?: string }).id === 'lake' ? p.state : p.border))
    .pathColor(() => p.state)
  landMaterial?.color.set(p.land)
  lakeMaterial?.color.set(p.water)
  heatStale = true
  applyLayers()
}

/* -- heat ------------------------------------------------------------------- */

const HEAT_W = 2048
const HEAT_H = 1024
/** Kernel radius, in degrees of latitude: roughly the continent maps' reach at their scale. */
const HEAT_RADIUS = 7

/**
 * True when the heat texture no longer matches the places or the theme. It
 * is redrawn only when heat is showing (`applyLayers`): drawing it is a
 * couple of million pixels of work, which a visitor who never switches to
 * heat shouldn't pay for.
 */
let heatStale = true

/**
 * The density glow, drawn on an equirectangular canvas and wrapped on a
 * transparent shell just above the land. Each place is a soft blob, widened
 * east–west by 1/cos(latitude) so it is round on the sphere (and repeated
 * across the antimeridian when it overlaps it), then coloured through the
 * heat ramp like the continent maps.
 *
 * Drawn on the CPU rather than with globe.gl's heatmap layer: that one
 * computes its density with WebGPU where `navigator.gpu` exists, and draws
 * nothing where WebGPU is present but unusable.
 */
function drawHeat(): void {
  if (!heatShell || !three) return
  const canvas = (heatShell.material.map?.image as HTMLCanvasElement | undefined) ?? document.createElement('canvas')
  canvas.width = HEAT_W
  canvas.height = HEAT_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, HEAT_W, HEAT_H)
  const ry = (HEAT_RADIUS / 180) * HEAT_H
  for (const place of props.places) {
    const x = ((place.lon + 180) / 360) * HEAT_W
    const y = ((90 - place.lat) / 180) * HEAT_H
    const stretch = 1 / Math.max(0.12, Math.cos((place.lat * Math.PI) / 180))
    const rx = ry * stretch
    for (const dx of [0, -HEAT_W, HEAT_W]) {
      if (dx && (x + dx + rx < 0 || x + dx - rx > HEAT_W)) continue
      ctx.save()
      ctx.translate(x + dx, y)
      ctx.scale(stretch, 1)
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry)
      for (const [at, a] of HEAT_KERNEL) g.addColorStop(at, `rgba(0,0,0,${a})`)
      ctx.fillStyle = g
      ctx.fillRect(-ry, -ry, ry * 2, ry * 2)
      ctx.restore()
    }
  }
  const img = ctx.getImageData(0, 0, HEAT_W, HEAT_H)
  colorizeDensity(img.data, heatLut(palette.value.primaryHsl, palette.value.dark))
  ctx.putImageData(img, 0, 0)

  const material = heatShell.material
  if (!material.map) {
    material.map = new three.CanvasTexture(canvas)
    material.map.colorSpace = three.SRGBColorSpace
    material.map.anisotropy = 4
  }
  material.map.needsUpdate = true
  // On a dark sphere the glow adds light; on a light one it's laid on like ink.
  material.blending = palette.value.dark ? three.AdditiveBlending : three.NormalBlending
  material.needsUpdate = true
}

function applyLayers(): void {
  if (!globe) return
  const p = palette.value
  const sel = current.value
  const heat = props.mode === 'heat'
  // In heat mode only the selected place keeps a pin, so the selection still shows.
  const pins = heat ? (sel ? [sel] : []) : props.places
  if (heat && heatStale) {
    drawHeat()
    heatStale = false
  }
  if (heatShell) heatShell.visible = heat
  globe
    .pointsData(pins)
    .pointColor(d => ((d as WorldPlace) === sel ? p.primary : p.pin))
    .pointRadius(d => ((d as WorldPlace) === sel ? 0.62 : 0.3))
    .pointAltitude(d => ((d as WorldPlace) === sel ? 0.07 : 0.014))
    .ringsData(sel && !still.value ? [sel] : [])
    .ringColor(() => (t: number) => p.ring(Math.max(0, 1 - t) * 0.9))
}

/* -- camera ----------------------------------------------------------------- */

function stopSpin(): void {
  if (globe) globe.controls().autoRotate = false
}

function flyTo(place: WorldPlace | null): void {
  if (!globe || !place) return
  stopSpin()
  globe.pointOfView({ lat: place.lat, lng: place.lon, altitude: Math.min(globe.pointOfView().altitude, FOCUS_ALTITUDE) }, still.value ? 0 : 1100)
}

function zoom(factor: number): void {
  if (!globe) return
  stopSpin()
  const pov = globe.pointOfView()
  globe.pointOfView({ ...pov, altitude: Math.min(4, Math.max(0.35, pov.altitude * factor)) }, still.value ? 0 : 350)
}

function resetView(): void {
  if (!globe) return
  globe.pointOfView(HOME, still.value ? 0 : 900)
  if (!still.value) globe.controls().autoRotate = true
}

/* -- lifecycle -------------------------------------------------------------- */

onMounted(async () => {
  const el = host.value
  if (!el) return
  try {
    const [{ default: Globe }, THREE, outlines] = await Promise.all([
      import('globe.gl'),
      import('three'),
      loadMapOutlines(),
      props.defer ? new Promise(r => setTimeout(r, props.defer)) : null,
    ])
    if (!host.value) return
    three = THREE
    const g = new Globe(el, { animateIn: !still.value, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })
    globe = g

    const polygons = globeOutlines(outlines.world.features)
    // State borders: one path per line, as `[lon, lat]` points.
    const stateLines = outlines.states.features.flatMap(f =>
      f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [])
    landMaterial = new THREE.MeshBasicMaterial()
    lakeMaterial = new THREE.MeshBasicMaterial()

    g.width(el.clientWidth)
      .height(el.clientHeight)
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl(null as unknown as string)
      .showAtmosphere(true)
      .globeMaterial(new THREE.MeshPhongMaterial())
      .polygonsData(polygons)
      // Lakes sit a hair above the land they're cut from.
      .polygonAltitude(d => ((d as { id?: string }).id === 'lake' ? 0.0045 : 0.004))
      .polygonCapMaterial(d => ((d as { id?: string }).id === 'lake' ? lakeMaterial! : landMaterial!))
      .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
      // globe.gl's default: finer only multiplies triangles the eye can't tell apart.
      .polygonCapCurvatureResolution(5)
      .polygonsTransitionDuration(0)
      .pathsData(stateLines)
      .pathPoints(d => d as number[][])
      .pathPointLat(pt => (pt as number[])[1]!)
      .pathPointLng(pt => (pt as number[])[0]!)
      .pathPointAlt(0.0046)
      .pathTransitionDuration(0)
      .pointLat(d => (d as WorldPlace).lat)
      .pointLng(d => (d as WorldPlace).lon)
      .pointResolution(10)
      .pointsMerge(false)
      .pointsTransitionDuration(still.value ? 0 : 300)
      .pointLabel(d => `<span class="ufo-globe-tip">${escapeHtml((d as WorldPlace).name)}</span>`)
      .onPointClick((d) => {
        emit('select', placeSlug((d as WorldPlace).path))
      })
      .ringLat(d => (d as WorldPlace).lat)
      .ringLng(d => (d as WorldPlace).lon)
      .ringAltitude(0.004)
      .ringMaxRadius(3.2)
      .ringPropagationSpeed(2.2)
      .ringRepeatPeriod(1300)

    // Lighting like the flat maps: a full white ambient, so the water shows
    // its own colour everywhere (globe.gl's default lights shade the far
    // side grey, darker than the flat land). The only shading is a soft
    // light from the upper left, in the primary: the glow on the sphere.
    rakeLight = new THREE.DirectionalLight(0xffffff, 1)
    rakeLight.position.set(-1.2, 1.1, 1.4)
    // π: three.js divides diffuse light by π, so this is what shows the base colour at full value.
    g.lights([new THREE.AmbientLight(0xffffff, Math.PI), rakeLight])

    // The heat shell: just above the land dots, turned like globe.gl's own
    // sphere so the equirectangular texture's longitudes line up.
    heatShell = new THREE.Mesh(
      new THREE.SphereGeometry(g.getGlobeRadius() * 1.006, 160, 80),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    )
    heatShell.rotation.y = -Math.PI / 2
    heatShell.visible = false
    g.scene().add(heatShell)

    const controls = g.controls()
    controls.enableZoom = true
    // A wheel over the globe scrolls the page; zoom is on the buttons (and pinch).
    controls.zoomSpeed = 0.6
    controls.minDistance = 130
    controls.maxDistance = 520
    controls.autoRotate = !still.value
    controls.autoRotateSpeed = 0.35
    controls.addEventListener('start', stopSpin)
    g.renderer().domElement.addEventListener('wheel', e => e.stopImmediatePropagation(), { capture: true })

    g.pointOfView(current.value ? { lat: current.value.lat, lng: current.value.lon, altitude: FOCUS_ALTITUDE } : HOME, 0)
    if (current.value) stopSpin()

    applyColours()
    ready.value = true

    ro = new ResizeObserver(() => {
      if (globe && host.value) globe.width(host.value.clientWidth).height(host.value.clientHeight)
    })
    ro.observe(el)

    io = new IntersectionObserver(([entry]) => {
      if (!globe) return
      if (entry?.isIntersecting) globe.resumeAnimation()
      else globe.pauseAnimation()
    })
    io.observe(el)
  }
  catch (err) {
    console.error('[WorldGlobe] could not start', err)
    failed.value = true
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  io?.disconnect()
  heatShell?.geometry.dispose()
  heatShell?.material.map?.dispose()
  heatShell?.material.dispose()
  heatShell = null
  landMaterial?.dispose()
  lakeMaterial?.dispose()
  landMaterial = null
  lakeMaterial = null
  globe?._destructor()
  globe = null
  rakeLight = null
})

watch(palette, applyColours)
watch(() => [props.mode, still.value] as const, applyLayers)
watch(() => props.places, () => {
  heatStale = true
  applyLayers()
})
watch(current, (place) => {
  applyLayers()
  flyTo(place)
})

defineExpose({ zoom, resetView })
</script>

<template>
  <div class="ufo-globe">
    <div ref="host" class="ufo-globe-host" :class="{ 'is-ready': ready }" role="img" :aria-label="`Globe with ${places.length} places. The list of places beside it is the accessible version.`" />

    <div v-if="!ready && !failed" class="ufo-globe-status" aria-hidden="true">
      <span>Loading globe…</span>
    </div>
    <div v-if="failed" class="ufo-globe-status" role="status">
      <span>This browser can't draw the globe. The list and the maps below still work.</span>
    </div>

    <div v-if="ready" class="ufo-globe-controls">
      <button type="button" class="ufo-globe-btn" aria-label="Zoom in" @click="zoom(0.75)">
        <Plus class="size-4" />
      </button>
      <button type="button" class="ufo-globe-btn" aria-label="Zoom out" @click="zoom(1.33)">
        <Minus class="size-4" />
      </button>
      <button type="button" class="ufo-globe-btn" aria-label="Reset view" @click="resetView">
        <RotateCcw class="size-4" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ufo-globe {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.ufo-globe-host {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: grab;
}
.ufo-globe-host:active {
  cursor: grabbing;
}
.ufo-globe-host.is-ready {
  opacity: 1;
}
@media (prefers-reduced-motion: no-preference) {
  .ufo-globe-host {
    transition: opacity var(--duration-slow) var(--ease-out);
  }
}
.ufo-globe-status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}
.ufo-globe-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ufo-globe-btn {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--card) / 0.85);
  color: hsl(var(--foreground));
  backdrop-filter: blur(6px);
  transition: border-color var(--duration-fast) ease, color var(--duration-fast) ease;
}
.ufo-globe-btn:hover {
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}
.ufo-globe-btn:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}

/* globe.gl's hover tooltip lives in its own element, outside this scope. */
:global(.float-tooltip-kap:has(.ufo-globe-tip)) {
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
:global(.ufo-globe-tip) {
  display: inline-block;
  padding: 4px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-lg);
  background: hsl(var(--popover, var(--card)));
  color: hsl(var(--foreground));
  font-family: var(--font-sans);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: var(--shadow-popover);
}
</style>
