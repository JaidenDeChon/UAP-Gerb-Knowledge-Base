<script setup lang="ts">
import type { GraphNode, GraphPayload } from '#shared/types/wiki'
import { buildAdjacency } from '~/utils/graph'
import { nodeRadius, pickNode, readGraphPalette, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: the precomputed layout rendered with WebGL through Pixi.js
 * — the same engine Obsidian's graph view is built on. Nodes are sprites
 * sharing one circle texture (a single instanced batch on the GPU), edges are
 * one retained Graphics mesh, and every visual is drawn white and tinted so a
 * theme change is a handful of tint writes instead of a scene rebuild.
 *
 * Pixi is imported dynamically: it's browser-only and ~450 KB, so it must not
 * ride into the SSR bundle or any other route's chunk.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLElement | null>(null)
const hoverIndex = shallowRef<number | null>(null)
const ready = shallowRef(false)

let dirty = true
let kDirty = true
let focusDirty = true
let hoverPos: { x: number, y: number } | null = null

const camera = useMapCamera(containerRef, {
  onTap(x, y) {
    const p = payload.value
    if (!p) return
    const i = pickNode(p.nodes, camera.pan.value, camera.k.value, x, y)
    if (i != null) emit('select', p.nodes[i]!)
  },
  onHover(pos) {
    hoverPos = pos
    focusDirty = true
    dirty = true
  },
})

watch([camera.pan, camera.k], ([, k], [, prevK]) => {
  if (k !== prevK) kDirty = true
  dirty = true
})

const adjacency = computed(() => {
  const p = payload.value
  return p ? buildAdjacency(p.edges, p.nodes.length) : []
})

/* ------------------------------------------------------------- pixi scene -- */

// Deliberately untyped as `any`: pixi.js types only exist client-side after the
// dynamic import, and vue-tsc must not need them to check this SFC.
let PIXI: any = null
let app: any = null
let world: any = null
let edgesG: any = null
let focusG: any = null
let sprites: any[] = []
let rings: any[] = []
let labels: (any | null)[] = []
let labelLayer: any = null
let palette: GraphPalette = {
  background: '#ffffff',
  node: '#16a34a',
  edge: '#64748b',
  primary: '#16a34a',
  foreground: '#0a0a0a',
}
let disposed = false
let builtFor: GraphPayload | null = null
let focus: number | null = null

const LABEL_STYLE = { fontFamily: 'MapLab', fontSize: 11 }

async function initPixi(): Promise<void> {
  const el = containerRef.value
  if (!el) return
  PIXI = await import('pixi.js')
  if (disposed) return

  app = new PIXI.Application()
  await app.init({
    resizeTo: el,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    backgroundAlpha: 0, // the container's bg-background class shows through
  })
  if (disposed) {
    app.destroy(true, { children: true })
    app = null
    return
  }
  el.appendChild(app.canvas)
  app.canvas.style.position = 'absolute'
  app.canvas.style.inset = '0'

  // Installed once per session and kept: uninstalling trips a canvas-pool bug
  // in Pixi (the dynamic font's resized atlas canvas can't be returned), and a
  // lone glyph atlas is cheap to leave cached for the next visit.
  if (!PIXI.Cache.has('MapLab-bitmap')) {
    PIXI.BitmapFont.install({
      name: 'MapLab',
      style: { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 32, fill: 0xffffff },
    })
  }

  app.ticker.add(update)
  buildSceneIfReady()
}

function buildSceneIfReady(): void {
  const p = payload.value
  if (!p || !app || !PIXI || builtFor === p) return
  builtFor = p

  world?.destroy({ children: true })
  world = new PIXI.Container()
  app.stage.addChild(world)

  // Edges: one Graphics holding every segment, drawn white and tinted.
  // pixelLine keeps the stroke 1 device px at every zoom (the SVG map's
  // vector-effect: non-scaling-stroke).
  edgesG = new PIXI.Graphics()
  for (const [a, b] of p.edges) {
    const na = p.nodes[a]
    const nb = p.nodes[b]
    if (!na || !nb) continue
    edgesG.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
  }
  edgesG.stroke({ width: 1, color: 0xffffff, alpha: 1, pixelLine: true })
  edgesG.alpha = 0.16
  world.addChild(edgesG)

  // One shared circle texture; every node is a tinted sprite of it, which
  // Pixi batches into a single draw call.
  const template = new PIXI.Graphics().circle(0, 0, 64).fill(0xffffff)
  const circleTex = app.renderer.generateTexture({ target: template, antialias: true })
  template.destroy()

  const ringLayer = new PIXI.Container()
  const nodeLayer = new PIXI.Container()
  labelLayer = new PIXI.Container()
  world.addChild(ringLayer, nodeLayer, labelLayer)

  sprites = new Array(p.nodes.length)
  rings = new Array(p.nodes.length)
  labels = new Array(p.nodes.length).fill(null)
  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i]!
    const ring = new PIXI.Sprite(circleTex)
    ring.anchor.set(0.5)
    ring.position.set(n.x, n.y)
    ringLayer.addChild(ring)
    rings[i] = ring

    const s = new PIXI.Sprite(circleTex)
    s.anchor.set(0.5)
    s.position.set(n.x, n.y)
    nodeLayer.addChild(s)
    sprites[i] = s
  }

  // Focus edges live in screen space on the stage, rebuilt per focus change.
  focusG = new PIXI.Graphics()
  app.stage.addChild(focusG)

  applyPalette()
  camera.fitTo(p.bounds)
  kDirty = true
  focusDirty = true
  dirty = true
  ready.value = true
}

function applyPalette(): void {
  if (!edgesG) return
  edgesG.tint = palette.edge
  for (const r of rings) r.tint = palette.background
  for (const s of sprites) s.tint = palette.node
  for (const t of labels) if (t) t.tint = palette.foreground
  focusDirty = true
  dirty = true
}

function labelFor(i: number): any {
  let t = labels[i]
  if (t) return t
  const p = payload.value!
  t = new PIXI.BitmapText({ text: p.nodes[i]!.l, style: LABEL_STYLE })
  t.anchor.set(0.5, 0)
  t.tint = palette.foreground
  labels[i] = t
  labelLayer.addChild(t)
  return t
}

/** One pass per dirty frame: camera transform, per-zoom scales, focus styling, labels. */
function update(): void {
  const p = payload.value
  if (!p || !world || !dirty) return
  dirty = false

  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  world.position.set(px, py)
  world.scale.set(k)

  if (hoverPos) {
    const next = pickNode(p.nodes, camera.pan.value, camera.k.value, hoverPos.x, hoverPos.y)
    if (next !== focus) {
      focus = next
      focusDirty = true
    }
  }
  else if (focus != null) {
    focus = null
    focusDirty = true
  }
  hoverIndex.value = focus

  const neighbours = focus != null ? new Set(adjacency.value[focus] ?? []) : null

  // Counter-scale so nodes hold their screen-px radius at any zoom, matching
  // the SVG map. Only the focus flip and the zoom change touch these loops.
  if (kDirty || focusDirty) {
    kDirty = false
    const dimmed = focus != null
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i]!
      const lit = dimmed && (i === focus || neighbours!.has(i))
      const r = nodeRadius(n.d) + (i === focus ? 3 : 0)
      const s = sprites[i]!
      s.scale.set((r * 2) / 128 / k)
      s.alpha = dimmed && !lit ? 0.28 : 1
      s.tint = i === focus ? palette.primary : palette.node
      const ring = rings[i]!
      ring.scale.set(((r + 2) * 2) / 128 / k)
      ring.alpha = dimmed && !lit ? 0.28 : 1
    }
  }

  // Focus edges, screen space.
  if (focusDirty) {
    focusDirty = false
    focusG.clear()
    if (focus != null) {
      const nf = p.nodes[focus]!
      const fx = px + nf.x * k
      const fy = py + nf.y * k
      for (const j of adjacency.value[focus] ?? []) {
        const nj = p.nodes[j]!
        focusG.moveTo(fx, fy).lineTo(px + nj.x * k, py + nj.y * k)
      }
      focusG.stroke({ width: 1.6, color: palette.primary, alpha: 0.9 })
    }
    edgesG.alpha = focus != null ? 0.16 * 0.45 : 0.16
  }

  // Labels: everything in view at k ≥ 0.9 plus the focus neighbourhood —
  // BitmapText objects created lazily, then just toggled and repositioned.
  const { w, h } = camera.size.value
  const margin = 80
  const zoomLabels = k >= 0.9
  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i]!
    const isFocusish = focus != null && (i === focus || neighbours!.has(i))
    let show = isFocusish
    if (!show && zoomLabels) {
      const sx = px + n.x * k
      const sy = py + n.y * k
      show = sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin
    }
    const existing = labels[i]
    if (!show) {
      if (existing) existing.visible = false
      continue
    }
    const t = labelFor(i)
    t.visible = true
    const r = nodeRadius(n.d) + (i === focus ? 3 : 0)
    t.scale.set(1 / k)
    t.position.set(n.x, n.y + (r + 2) / k)
  }
}

/* -------------------------------------------------------------- lifecycle -- */

watch(payload, () => buildSceneIfReady())

watch(() => camera.size.value, () => {
  if (payload.value && !camera.userAdjusted.value) camera.fitTo(payload.value.bounds)
  kDirty = true
  dirty = true
})

const { theme } = useTheme()
watch(theme, async () => {
  await nextTick()
  palette = readGraphPalette()
  applyPalette()
})

onMounted(() => {
  palette = readGraphPalette()
  initPixi()
})

onBeforeUnmount(() => {
  disposed = true
  if (app) {
    app.ticker?.remove(update)
    // Textures are NOT destroyed here: the glyph atlas belongs to the cached
    // bitmap font, which outlives this component (see install above).
    app.destroy(true, { children: true })
    app = null
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full w-full overflow-hidden bg-background"
    :style="{ cursor: camera.grabbing.value ? 'grabbing' : hoverIndex != null ? 'pointer' : 'grab', touchAction: 'none' }"
    role="application"
    aria-label="Knowledge graph rendered with Pixi.js WebGL"
    @pointerdown="camera.handlers.onPointerDown"
    @pointermove="camera.handlers.onPointerMove"
    @pointerup="camera.handlers.onPointerUp"
    @pointercancel="camera.handlers.onPointerUp"
    @pointerleave="camera.handlers.onPointerLeave"
    @wheel.prevent="camera.handlers.onWheel"
  >
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>
  </div>
</template>
