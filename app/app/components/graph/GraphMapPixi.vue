<script setup lang="ts">
import type { GraphNode, GraphPayload } from '#shared/types/wiki'
import { RotateCcw } from '@lucide/vue'
import { buildAdjacency } from '~/utils/graph'
import { nodeRadius, pickNode, readGraphPalette, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: WebGL rendering through Pixi.js — the same engine
 * Obsidian's graph view is built on — plus an optional live d3-force
 * simulation, which is Obsidian's exact combination (WebGL + physics).
 *
 * Nodes are sprites sharing one circle texture (a single instanced batch on
 * the GPU), edges are one Graphics mesh (retained while static, rebuilt per
 * tick while the simulation is hot), and every visual is drawn white and
 * tinted so a theme change is a handful of tint writes.
 *
 * The panel on the right exposes the simulation the way Obsidian's graph
 * settings do: physics on/off (off = the precomputed baked layout), repel
 * force, link distance, center pull, and a label toggle. With physics on,
 * nodes are draggable and the simulation reheats around the drag.
 *
 * Pixi and d3-force are imported dynamically: browser-only, and they must not
 * ride into the SSR bundle or any other route's chunk.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLElement | null>(null)
const hoverIndex = shallowRef<number | null>(null)
const ready = shallowRef(false)

/* ----------------------------------------------------------- lab controls -- */

const physicsOn = shallowRef(true)
const repel = shallowRef(300)
const linkDist = shallowRef(60)
const gravity = shallowRef(0.03)
const labelsOn = shallowRef(true)

let dirty = true
let kDirty = true
let focusDirty = true
let geomDirty = false // node positions moved (sim tick, drag, mode switch)
let hoverPos: { x: number, y: number } | null = null

/* ---------------------------------------------------- pointer interaction -- */

// Node dragging (physics only) is resolved before the camera sees the event;
// anything that misses a node falls through to pan/zoom/tap as usual.
let dragIndex: number | null = null
let dragTravel = 0
let dragLastX = 0
let dragLastY = 0

const camera = useMapCamera(containerRef, {
  onTap(x, y) {
    const i = hitTest(x, y)
    if (i != null && payload.value) emit('select', payload.value.nodes[i]!)
  },
  onHover(pos) {
    hoverPos = pos
    focusDirty = true
    dirty = true
  },
})

function localPoint(e: PointerEvent): { x: number, y: number } {
  const rect = containerRef.value?.getBoundingClientRect()
  return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: e.clientX, y: e.clientY }
}

function hitTest(sx: number, sy: number): number | null {
  const p = payload.value
  if (!p) return null
  const src: any = physicsOn.value && simNodes ? simNodes : p.nodes
  return pickNode(src, camera.pan.value, camera.k.value, sx, sy)
}

function onPointerDown(e: PointerEvent): void {
  if (physicsOn.value && sim && (e.pointerType !== 'mouse' || e.button === 0)) {
    const { x, y } = localPoint(e)
    const i = hitTest(x, y)
    if (i != null) {
      dragIndex = i
      dragTravel = 0
      dragLastX = e.clientX
      dragLastY = e.clientY
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      return
    }
  }
  camera.handlers.onPointerDown(e)
}

function onPointerMove(e: PointerEvent): void {
  if (dragIndex != null && sim) {
    dragTravel += Math.abs(e.clientX - dragLastX) + Math.abs(e.clientY - dragLastY)
    dragLastX = e.clientX
    dragLastY = e.clientY
    const { x, y } = localPoint(e)
    const node = simNodes![dragIndex]!
    node.fx = (x - camera.pan.value.x) / camera.k.value
    node.fy = (y - camera.pan.value.y) / camera.k.value
    sim.alpha(Math.max(sim.alpha(), 0.3))
    dirty = true
    return
  }
  camera.handlers.onPointerMove(e)
}

function onPointerUp(e: PointerEvent): void {
  if (dragIndex != null) {
    const i = dragIndex
    dragIndex = null
    const node = simNodes?.[i]
    if (node) {
      node.fx = null
      node.fy = null
    }
    const el = e.currentTarget as Element
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (dragTravel < 5 && payload.value) emit('select', payload.value.nodes[i]!)
    return
  }
  camera.handlers.onPointerUp(e)
}

watch([camera.pan, camera.k], ([, k], [, prevK]) => {
  if (k !== prevK) kDirty = true
  dirty = true
})

const adjacency = computed(() => {
  const p = payload.value
  return p ? buildAdjacency(p.edges, p.nodes.length) : []
})

/* ------------------------------------------------------------- pixi scene -- */

// Deliberately untyped as `any`: pixi.js and d3-force types only exist
// client-side after the dynamic imports, and vue-tsc must not need them.
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

/* --------------------------------------------------------------- physics -- */

let d3: any = null
let sim: any = null
// Same shape pickNode expects (x, y, d); d3-force adds vx/vy/fx/fy in place.
let simNodes: { i: number, x: number, y: number, d: number, fx?: number | null, fy?: number | null }[] | null = null

function buildSimulation(p: GraphPayload): void {
  simNodes = p.nodes.map(n => ({ i: n.i, x: n.x, y: n.y, d: n.d }))
  const links = p.edges.map(([source, target]) => ({ source, target }))
  sim = d3.forceSimulation(simNodes)
    .force('charge', d3.forceManyBody().strength(-repel.value).theta(0.9).distanceMax(800))
    .force('link', d3.forceLink(links).distance(linkDist.value))
    .force('x', d3.forceX(0).strength(gravity.value))
    .force('y', d3.forceY(0).strength(gravity.value))
    .alpha(0.8)
    .stop() // ticked manually from the render loop
}

function reheat(alpha: number): void {
  if (!sim) return
  sim.force('charge').strength(-repel.value)
  sim.force('link').distance(linkDist.value)
  sim.force('x').strength(gravity.value)
  sim.force('y').strength(gravity.value)
  sim.alpha(Math.max(sim.alpha(), alpha))
  dirty = true
}

watch([repel, linkDist, gravity], () => reheat(0.5))

watch(physicsOn, (on) => {
  const p = payload.value
  if (!p) return
  if (on) {
    // Restart from the baked layout so on/off is a clean A/B comparison.
    if (simNodes) {
      for (let i = 0; i < simNodes.length; i++) {
        const n = simNodes[i]!
        n.x = p.nodes[i]!.x
        n.y = p.nodes[i]!.y
        ;(n as any).vx = 0
        ;(n as any).vy = 0
      }
      sim?.alpha(0.8)
    }
  }
  geomDirty = true
  focusDirty = true
  dirty = true
})

watch(labelsOn, () => {
  dirty = true
})

function resetLayout(): void {
  const p = payload.value
  if (!p || !simNodes) return
  for (let i = 0; i < simNodes.length; i++) {
    const n = simNodes[i]!
    n.x = p.nodes[i]!.x
    n.y = p.nodes[i]!.y
    ;(n as any).vx = 0
    ;(n as any).vy = 0
  }
  sim?.alpha(0.8)
  camera.fitTo(p.bounds)
  geomDirty = true
  dirty = true
}

/* ------------------------------------------------------------------ init -- */

async function initPixi(): Promise<void> {
  const el = containerRef.value
  if (!el) return
  ;[PIXI, d3] = await Promise.all([import('pixi.js'), import('d3-force')])
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
  // vector-effect: non-scaling-stroke). Retained while the layout is still;
  // rebuilt per tick only while the simulation is hot.
  edgesG = new PIXI.Graphics()
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

  buildSimulation(p)
  applyPalette()
  camera.fitTo(p.bounds)
  kDirty = true
  focusDirty = true
  geomDirty = true
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
  t = new PIXI.BitmapText({ text: p.nodes[i]!.l, style: { fontFamily: 'MapLab', fontSize: 11 } })
  t.anchor.set(0.5, 0)
  t.tint = palette.foreground
  labels[i] = t
  labelLayer.addChild(t)
  return t
}

function rebuildEdges(src: { x: number, y: number }[]): void {
  const p = payload.value!
  edgesG.clear()
  for (const [a, b] of p.edges) {
    const na = src[a]
    const nb = src[b]
    if (!na || !nb) continue
    edgesG.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
  }
  edgesG.stroke({ width: 1, color: 0xffffff, alpha: 1, pixelLine: true })
  edgesG.tint = palette.edge
}

/** One pass per frame while anything is dirty or the simulation is hot. */
function update(): void {
  const p = payload.value
  if (!p || !world) return

  const hot = physicsOn.value && sim && sim.alpha() > 0.02
  if (hot) {
    sim.tick()
    geomDirty = true
    dirty = true
  }
  if (!dirty) return
  dirty = false

  const src: any[] = physicsOn.value && simNodes ? simNodes : (p.nodes as any[])
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  world.position.set(px, py)
  world.scale.set(k)

  if (hoverPos) {
    const next = pickNode(src, camera.pan.value, camera.k.value, hoverPos.x, hoverPos.y)
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

  // Node positions + the edge mesh only refresh when the layout itself moved.
  if (geomDirty) {
    geomDirty = false
    for (let i = 0; i < src.length; i++) {
      sprites[i]!.position.set(src[i]!.x, src[i]!.y)
      rings[i]!.position.set(src[i]!.x, src[i]!.y)
    }
    rebuildEdges(src)
  }

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
  if (focusDirty || hot) {
    focusDirty = false
    focusG.clear()
    if (focus != null) {
      const nf = src[focus]!
      const fx = px + nf.x * k
      const fy = py + nf.y * k
      for (const j of adjacency.value[focus] ?? []) {
        const nj = src[j]!
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
  const zoomLabels = labelsOn.value && k >= 0.9
  for (let i = 0; i < p.nodes.length; i++) {
    const isFocusish = focus != null && (i === focus || neighbours!.has(i))
    let show = isFocusish
    if (!show && zoomLabels) {
      const sx = px + src[i]!.x * k
      const sy = py + src[i]!.y * k
      show = sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin
    }
    const existing = labels[i]
    if (!show) {
      if (existing) existing.visible = false
      continue
    }
    const t = labelFor(i)
    t.visible = true
    const r = nodeRadius(p.nodes[i]!.d) + (i === focus ? 3 : 0)
    t.scale.set(1 / k)
    t.position.set(src[i]!.x, src[i]!.y + (r + 2) / k)
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
  sim?.stop()
  sim = null
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
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="camera.handlers.onPointerLeave"
    @wheel.prevent="camera.handlers.onWheel"
  >
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>

    <!-- Simulation controls — Obsidian-style graph settings for this variant. -->
    <div
      v-if="ready"
      class="absolute right-4 top-4 z-20 w-[216px] select-none rounded-lg border border-border/50 bg-background/70 p-3 backdrop-blur-sm"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @wheel.stop
    >
      <button
        type="button"
        role="switch"
        :aria-checked="physicsOn"
        class="flex w-full items-center justify-between gap-2 rounded-sm py-0.5 text-left"
        @click="physicsOn = !physicsOn"
      >
        <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Physics</span>
        <span
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-sm transition-colors duration-fast ease-standard"
          :class="physicsOn ? 'bg-primary' : 'bg-input'"
        >
          <span
            class="inline-block size-4 rounded-sm bg-background shadow-sm transition-transform duration-fast ease-standard"
            :class="physicsOn ? 'translate-x-[18px]' : 'translate-x-0.5'"
          />
        </span>
      </button>
      <p class="mt-1 font-sans text-[11px] leading-4 text-muted-foreground">
        {{ physicsOn ? 'Live d3-force layout — drag nodes to stir it.' : 'Precomputed (baked) layout.' }}
      </p>

      <div class="mt-3 flex flex-col gap-2.5" :class="physicsOn ? '' : 'pointer-events-none opacity-40'">
        <label class="block">
          <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Repel force <span class="tabular-nums text-foreground">{{ repel }}</span>
          </span>
          <input
            v-model.number="repel"
            type="range"
            min="0"
            max="500"
            step="10"
            class="mt-1 w-full"
            :style="{ accentColor: 'hsl(var(--primary))' }"
          >
        </label>
        <label class="block">
          <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Link distance <span class="tabular-nums text-foreground">{{ linkDist }}</span>
          </span>
          <input
            v-model.number="linkDist"
            type="range"
            min="10"
            max="150"
            step="5"
            class="mt-1 w-full"
            :style="{ accentColor: 'hsl(var(--primary))' }"
          >
        </label>
        <label class="block">
          <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Center pull <span class="tabular-nums text-foreground">{{ gravity.toFixed(2) }}</span>
          </span>
          <input
            v-model.number="gravity"
            type="range"
            min="0"
            max="0.3"
            step="0.01"
            class="mt-1 w-full"
            :style="{ accentColor: 'hsl(var(--primary))' }"
          >
        </label>
      </div>

      <button
        type="button"
        role="switch"
        :aria-checked="labelsOn"
        class="mt-3 flex w-full items-center justify-between gap-2 rounded-sm py-0.5 text-left"
        @click="labelsOn = !labelsOn"
      >
        <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Zoom labels</span>
        <span
          class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-sm transition-colors duration-fast ease-standard"
          :class="labelsOn ? 'bg-primary' : 'bg-input'"
        >
          <span
            class="inline-block size-4 rounded-sm bg-background shadow-sm transition-transform duration-fast ease-standard"
            :class="labelsOn ? 'translate-x-[18px]' : 'translate-x-0.5'"
          />
        </span>
      </button>

      <button
        type="button"
        class="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border/50 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
        @click="resetLayout"
      >
        <RotateCcw :size="12" />
        Reset layout
      </button>
    </div>
  </div>
</template>
