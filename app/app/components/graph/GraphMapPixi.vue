<script setup lang="ts">
import type { Category, GraphNode, GraphPayload } from '#shared/types/wiki'
import { RotateCcw } from '@lucide/vue'
import { buildAdjacency } from '~/utils/graph'
import { CATEGORY_COLOR_VAR, CATEGORY_LEGEND_ORDER, nodeRadius, pickNode, readCategoryColors, readGraphPalette, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: WebGL rendering through Pixi.js — the same engine
 * Obsidian's graph view is built on — plus a live d3-force simulation.
 *
 * Layout model: instead of one central gravity well (which collapsed the whole
 * graph into a dense core), every category gets an anchor point spread around
 * an ellipse shaped like the container, and its nodes are pulled gently toward
 * that anchor. Collision keeps nodes apart, so the graph settles into loose
 * per-type clusters that together fill the available space. The camera keeps
 * fitting the view to the live layout while it settles, until the user pans,
 * zooms, or grabs a node.
 *
 * Stability: the springs are the reason earlier versions shook. d3's default
 * link strength is `1/min(deg)` — a hub–leaf link gets strength 1, so hundreds
 * of stiff springs yank leaves into a hub while charge throws them back out.
 * Links are damped by the *larger* endpoint degree instead, velocity decay is
 * raised, and dragging uses the alphaTarget pattern rather than re-spiking
 * alpha every pointermove.
 *
 * Nodes are sprites sharing one circle texture (a single instanced batch on
 * the GPU) tinted per category; edges are one Graphics mesh (retained while
 * static, rebuilt per tick while the simulation is hot).
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
const repel = shallowRef(120)
const linkDist = shallowRef(50)
const clusterPull = shallowRef(0.08)
const spacing = shallowRef(12)
const labelsOn = shallowRef(true)

/** Hovered legend row — dims every node outside that category. */
const catFocus = shallowRef<Category | null>(null)

let dirty = true
let kDirty = true
let focusDirty = true
let geomDirty = false // node positions moved (sim tick, drag, mode switch)
let hoverPos: { x: number, y: number } | null = null

/* ---------------------------------------------------- pointer interaction -- */

// Node dragging (physics only) is resolved before the camera sees the event;
// anything that misses a node falls through to pan/zoom/tap as usual. The drag
// owns exactly one pointer (dragPointerId) — every other pointer keeps routing
// to the camera, otherwise a second finger's up would be swallowed here and
// leak a phantom entry in the camera's pointer map.
let dragIndex: number | null = null
let dragPointerId: number | null = null
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
  if (dragIndex == null && physicsOn.value && sim && (e.pointerType !== 'mouse' || e.button === 0)) {
    const { x, y } = localPoint(e)
    const i = hitTest(x, y)
    if (i != null) {
      dragIndex = i
      dragPointerId = e.pointerId
      dragTravel = 0
      dragLastX = e.clientX
      dragLastY = e.clientY
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      // Grabbing a node ends the auto-fit phase: the camera must hold still
      // under the user's hand from here on.
      camera.userAdjusted.value = true
      sim.alphaTarget(0.15)
      sim.alpha(Math.max(sim.alpha(), 0.3))
      dirty = true
      return
    }
  }
  camera.handlers.onPointerDown(e)
}

function onPointerMove(e: PointerEvent): void {
  if (dragIndex != null && e.pointerId === dragPointerId && sim) {
    dragTravel += Math.abs(e.clientX - dragLastX) + Math.abs(e.clientY - dragLastY)
    dragLastX = e.clientX
    dragLastY = e.clientY
    const { x, y } = localPoint(e)
    const node = simNodes![dragIndex]!
    node.fx = (x - camera.pan.value.x) / camera.k.value
    node.fy = (y - camera.pan.value.y) / camera.k.value
    dirty = true
    return
  }
  camera.handlers.onPointerMove(e)
}

function onPointerUp(e: PointerEvent): void {
  if (dragIndex != null && e.pointerId === dragPointerId) {
    const i = dragIndex
    dragIndex = null
    dragPointerId = null
    const node = simNodes?.[i]
    if (node) {
      node.fx = null
      node.fy = null
    }
    sim?.alphaTarget(0)
    const el = e.currentTarget as Element
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    // A cancelled pointer (OS gesture stole it) must not read as a tap.
    if (dragTravel < 5 && e.type !== 'pointercancel' && payload.value) emit('select', payload.value.nodes[i]!)
    return
  }
  camera.handlers.onPointerUp(e)
}

/** Pointer is over an overlay card — whatever node was hovered no longer is. */
function clearNodeHover(): void {
  hoverPos = null
  focusDirty = true
  dirty = true
}

watch([camera.pan, camera.k], ([, k], [, prevK]) => {
  if (k !== prevK) kDirty = true
  dirty = true
})

const adjacency = computed(() => {
  const p = payload.value
  return p ? buildAdjacency(p.edges, p.nodes.length) : []
})

/* ------------------------------------------------------------------ legend -- */

const legend = computed(() => {
  const p = payload.value
  if (!p) return []
  const counts = new Map<Category, number>()
  for (const n of p.nodes) {
    const c = aliasCat(n.c)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return CATEGORY_LEGEND_ORDER
    .filter(c => counts.has(c))
    .map(c => ({ c, cssVar: CATEGORY_COLOR_VAR[c], count: counts.get(c)! }))
})

watch(catFocus, () => {
  focusDirty = true
  dirty = true
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
let catColors: Record<Category, string> | null = null
/** Per-node tint, indexed like `payload.nodes` — the category color. */
let nodeTint: string[] = []
let disposed = false
let builtFor: GraphPayload | null = null
let focus: number | null = null

/* --------------------------------------------------------------- physics -- */

const CHARGE_RANGE = 350 // px reach of node-node repulsion — local spacing, not global collapse
const VELOCITY_DECAY = 0.55 // > d3's 0.4 default; damps the spring oscillation
const ALPHA_DECAY = 0.02
const HUB_EXP = 0.75 // spring damping exponent by larger endpoint degree
const CROSS_CAT_DAMP = 0.45 // extra spring damping when a link crosses categories
const PACKING = 0.55 // assumed disc packing efficiency when sizing clusters
const RING_SHARE = 0.62 // anchor ring radius as a share of the packed-graph radius
const FIT_PAD = 56 // px margin the auto-fit keeps around the layout

let d3: any = null
let sim: any = null
// Same shape pickNode expects (x, y, d) plus the category driving the cluster
// forces; d3-force adds vx/vy/fx/fy in place.
let simNodes: { i: number, x: number, y: number, d: number, c: Category, fx?: number | null, fy?: number | null }[] | null = null

/** `Root` is the lone Home note — it clusters (and colors) with the MOCs. */
function aliasCat(c: Category): Category {
  return c === 'Root' ? 'MOCs' : c
}

interface Cluster {
  x: number
  y: number
  /** Radius the cluster's nodes need at the current spacing (for seeding). */
  r: number
  count: number
}

let clusters = new Map<Category, Cluster>()

/**
 * Spread one anchor per category around an ellipse matching the container's
 * aspect ratio, sized from the area the nodes actually need, with angular room
 * proportional to √count so big categories aren't pinched by small ones.
 */
function computeClusters(p: GraphPayload): void {
  const areas = new Map<Category, number>() // Σ r², π and packing applied later
  const counts = new Map<Category, number>()
  for (const n of p.nodes) {
    const c = aliasCat(n.c)
    const r = collideRadius(n)
    areas.set(c, (areas.get(c) ?? 0) + r * r)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }

  const present = CATEGORY_LEGEND_ORDER.filter(c => counts.has(c))
  let totalArea = 0
  for (const a of areas.values()) totalArea += a
  const packedR = Math.sqrt(totalArea / PACKING)
  const ringR = packedR * RING_SHARE

  const { w, h } = camera.size.value
  const aspect = Math.min(1.9, Math.max(0.6, w > 0 && h > 0 ? w / h : 1.6))
  const sx = Math.sqrt(aspect)
  const sy = 1 / sx

  const weights = present.map(c => Math.sqrt(counts.get(c)!))
  const totalW = weights.reduce((s, v) => s + v, 0)

  clusters = new Map()
  let acc = 0
  present.forEach((c, k) => {
    const mid = ((acc + weights[k]! / 2) / totalW) * Math.PI * 2 - Math.PI / 2
    acc += weights[k]!
    clusters.set(c, {
      x: Math.cos(mid) * ringR * sx,
      y: Math.sin(mid) * ringR * sy,
      r: Math.sqrt(areas.get(c)! / PACKING),
      count: counts.get(c)!,
    })
  })
}

/**
 * Deterministic seed: each cluster's nodes on a golden-angle spiral around its
 * anchor — already evenly spread, so the simulation relaxes instead of
 * untangling a cross-graph swirl.
 */
function seedSimulation(): void {
  if (!simNodes) return
  const placed = new Map<Category, number>()
  for (const n of simNodes) {
    const c = aliasCat(n.c)
    const cluster = clusters.get(c)
    if (!cluster) continue
    const j = placed.get(c) ?? 0
    placed.set(c, j + 1)
    const r = cluster.r * Math.sqrt((j + 0.5) / cluster.count)
    const angle = j * 2.39996323 // golden angle
    n.x = cluster.x + Math.cos(angle) * r
    n.y = cluster.y + Math.sin(angle) * r
    ;(n as any).vx = 0
    ;(n as any).vy = 0
  }
}

// Nodes render at a fixed *screen* radius while collision runs in graph units,
// so after fit-to-view a hub pair kept only r₁+r₂ apart still overlaps on
// screen. Scaling the keep-apart distance by the render radius (the baked
// layout's SEP_K trick, gentler here) buys hubs screen room proportional to
// their size.
function collideRadius(n: { d: number }): number {
  return nodeRadius(n.d) * 2.2 + spacing.value
}

function anchorX(n: { c: Category }): number {
  return clusters.get(aliasCat(n.c))?.x ?? 0
}

function anchorY(n: { c: Category }): number {
  return clusters.get(aliasCat(n.c))?.y ?? 0
}

function buildSimulation(p: GraphPayload): void {
  simNodes = p.nodes.map(n => ({ i: n.i, x: n.x, y: n.y, d: n.d, c: n.c }))
  // Spring strength damped by the larger endpoint degree (precomputed — no
  // dependence on d3's link-resolution order). A 200-link hub barely tugs its
  // leaves; a 1–1 link is a firm spring. Links that cross categories are
  // damped further so the connective tissue between clusters doesn't drag
  // everything into a mixed central pool.
  const links = p.edges.map(([source, target]) => {
    const a = p.nodes[source]!
    const b = p.nodes[target]!
    const hub = Math.min(1, 1 / Math.max(a.d, b.d, 1) ** HUB_EXP)
    return { source, target, s: hub * (aliasCat(a.c) === aliasCat(b.c) ? 1 : CROSS_CAT_DAMP) }
  })
  sim = d3.forceSimulation(simNodes)
    .force('charge', d3.forceManyBody().strength(-repel.value).theta(0.9).distanceMax(CHARGE_RANGE))
    .force('link', d3.forceLink(links).distance(linkDist.value).strength((l: any) => l.s))
    .force('collide', d3.forceCollide().radius(collideRadius).strength(0.8).iterations(2))
    .force('cx', d3.forceX(anchorX).strength(clusterPull.value))
    .force('cy', d3.forceY(anchorY).strength(clusterPull.value))
    .velocityDecay(VELOCITY_DECAY)
    .alphaDecay(ALPHA_DECAY)
    .alpha(0.9)
    .stop() // ticked manually from the render loop
  seedSimulation()
}

function reheat(alpha: number): void {
  if (!sim || !payload.value) return
  computeClusters(payload.value)
  sim.force('charge').strength(-repel.value)
  sim.force('link').distance(linkDist.value)
  sim.force('collide').radius(collideRadius)
  sim.force('cx').x(anchorX).strength(clusterPull.value)
  sim.force('cy').y(anchorY).strength(clusterPull.value)
  sim.alpha(Math.max(sim.alpha(), alpha))
  dirty = true
}

watch([repel, linkDist, clusterPull, spacing], () => reheat(0.5))

/** Bounding box of whatever layout is currently on screen. */
function currentBounds(): GraphPayload['bounds'] {
  const p = payload.value!
  const src: { x: number, y: number }[] = physicsOn.value && simNodes ? simNodes : p.nodes
  if (!src.length) return p.bounds
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of src) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  return { minX, minY, maxX, maxY }
}

function restartSimulation(): void {
  const p = payload.value
  if (!p || !sim) return
  reheat(0) // recompute anchors AND push them into the cached force accessors
  seedSimulation()
  sim.alphaTarget(0)
  sim.alpha(0.9)
  camera.fitTo(currentBounds(), FIT_PAD)
  geomDirty = true
  focusDirty = true
  dirty = true
}

watch(physicsOn, (on) => {
  const p = payload.value
  if (!p) return
  if (on) {
    restartSimulation()
  }
  else {
    camera.fitTo(p.bounds)
    geomDirty = true
    focusDirty = true
    dirty = true
  }
})

watch(labelsOn, () => {
  dirty = true
})

function resetLayout(): void {
  const p = payload.value
  if (!p) return
  if (physicsOn.value) {
    restartSimulation()
  }
  else {
    camera.fitTo(p.bounds)
    dirty = true
  }
}

/* ------------------------------------------------------------------ init -- */

async function initPixi(): Promise<void> {
  const el = containerRef.value
  if (!el) return
  ;[PIXI, d3] = await Promise.all([import('pixi.js'), import('d3-force')])
  if (disposed) return

  // Local until init resolves: destroy() on a half-initialized Application
  // throws from its plugins, so onBeforeUnmount must never see one in `app` —
  // the disposed guard below owns the unmounted-mid-await path instead.
  const application = new PIXI.Application()
  await application.init({
    resizeTo: el,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    backgroundAlpha: 0, // the container's bg-background class shows through
  })
  if (disposed) {
    application.destroy(true, { children: true })
    return
  }
  app = application
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

  computeClusters(p)
  buildSimulation(p)
  applyPalette()
  camera.fitTo(physicsOn.value ? currentBounds() : p.bounds, FIT_PAD)
  kDirty = true
  focusDirty = true
  geomDirty = true
  dirty = true
  ready.value = true
}

function applyPalette(): void {
  if (!edgesG) return
  const p = payload.value
  if (p && catColors) nodeTint = p.nodes.map(n => catColors![n.c])
  edgesG.tint = palette.edge
  for (const t of labels) if (t) t.tint = palette.foreground
  // Sprite and ring tints are owned by the focus/zoom pass in update().
  kDirty = true
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
    // Keep the settling layout in frame until the user takes the camera.
    if (!camera.userAdjusted.value && dragIndex == null) {
      camera.fitTo(currentBounds(), FIT_PAD)
    }
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
  const catDim = focus == null ? catFocus.value : null

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
    const dimmed = focus != null || catDim != null
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i]!
      const lit = focus != null
        ? (i === focus || neighbours!.has(i))
        : catDim != null && aliasCat(n.c) === catDim
      const r = nodeRadius(n.d) + (i === focus ? 3 : 0)
      const s = sprites[i]!
      s.scale.set((r * 2) / 128 / k)
      s.alpha = dimmed && !lit ? 0.28 : 1
      s.tint = nodeTint[i] ?? palette.node
      const ring = rings[i]!
      ring.scale.set(((r + 2) * 2) / 128 / k)
      ring.alpha = dimmed && !lit ? 0.28 : 1
      ring.tint = i === focus ? palette.primary : palette.background
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
    edgesG.alpha = focus != null || catDim != null ? 0.16 * 0.45 : 0.16
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

// The camera's ResizeObserver reassigns size as a fresh object every callback,
// so compare dimensions before reacting. Once the user has taken the camera,
// a resize changes nothing: re-anchoring the clusters then would drag the
// layout out from under their pinned view.
let lastW = 0
let lastH = 0
watch(() => camera.size.value, ({ w, h }) => {
  if (w === lastW && h === lastH) return
  lastW = w
  lastH = h
  if (payload.value && w > 0 && h > 0 && !camera.userAdjusted.value) {
    if (physicsOn.value && sim) reheat(0.3) // anchors follow the new aspect
    camera.fitTo(physicsOn.value ? currentBounds() : payload.value.bounds, FIT_PAD)
  }
  kDirty = true
  dirty = true
})

const { theme } = useTheme()
watch(theme, async () => {
  await nextTick()
  palette = readGraphPalette()
  catColors = readCategoryColors()
  applyPalette()
})

onMounted(() => {
  palette = readGraphPalette()
  catColors = readCategoryColors()
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
      @pointerenter="clearNodeHover"
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
        {{ physicsOn ? 'Live d3-force layout, clustered by type — drag nodes to stir it.' : 'Precomputed (baked) layout.' }}
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
            max="400"
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
            Cluster pull <span class="tabular-nums text-foreground">{{ clusterPull.toFixed(2) }}</span>
          </span>
          <input
            v-model.number="clusterPull"
            type="range"
            min="0"
            max="0.2"
            step="0.01"
            class="mt-1 w-full"
            :style="{ accentColor: 'hsl(var(--primary))' }"
          >
        </label>
        <label class="block">
          <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Node spacing <span class="tabular-nums text-foreground">{{ spacing }}</span>
          </span>
          <input
            v-model.number="spacing"
            type="range"
            min="0"
            max="30"
            step="1"
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

    <!-- Category legend — hover a row to spotlight that type on the map. -->
    <div
      v-if="ready"
      class="absolute bottom-4 left-4 z-20 select-none rounded-lg border border-border/50 bg-background/70 p-2.5 backdrop-blur-sm"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointerenter="clearNodeHover"
      @pointerleave="catFocus = null"
      @wheel.stop
    >
      <div class="mb-1 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Node types
      </div>
      <ul class="flex flex-col gap-px">
        <li
          v-for="entry in legend"
          :key="entry.c"
          class="flex cursor-default items-center gap-2 rounded-sm px-1 py-0.5 transition-colors duration-fast ease-standard hover:bg-accent/60"
          @pointerenter="catFocus = entry.c"
        >
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ background: `hsl(var(${entry.cssVar}))` }"
          />
          <span class="font-sans text-[11px] text-foreground">{{ entry.c }}</span>
          <span class="ml-auto pl-3 font-mono text-[10px] tabular-nums text-muted-foreground">{{ entry.count }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
