<script setup lang="ts">
import type { Category, GraphEdge, GraphNode, GraphPayload } from '#shared/types/wiki'
import { Key, RotateCcw, Wrench, X } from '@lucide/vue'
import { useLocalStorage } from '@vueuse/core'
import { buildAdjacency } from '~/utils/graph'
import { CATEGORY_COLOR_VAR, CATEGORY_LEGEND_ORDER, nodeRadius, pickNode, readCategoryColors, readGraphPalette, type GraphPalette } from '~/utils/graphLab'

/**
 * The site map (`/map`): a home-brew renderer on Pixi.js v8 + d3-force —
 * Obsidian's own combination (WebGL rendering + a live physics simulation),
 * built on the same WebGL engine Obsidian's graph view uses.
 *
 * Layout model: instead of one central gravity well (which collapsed the whole
 * graph into a dense core), every category gets an anchor point spread around
 * an ellipse shaped like the container, and its nodes are pulled gently toward
 * that anchor. Collision keeps nodes apart, so the graph settles into loose
 * per-type clusters that together fill the available space. The camera keeps
 * fitting the view to the live layout only during the initial settle (and
 * explicit restarts); once it cools — or the user pans or zooms — the camera
 * holds still, so physics-slider tweaks visibly reshape the layout in place.
 *
 * Stability: the springs are the reason earlier versions shook. d3's default
 * link strength is `1/min(deg)` — a hub–leaf link gets strength 1, so hundreds
 * of stiff springs yank leaves into a hub while charge throws them back out.
 * Links are damped by the *larger* endpoint degree instead, and velocity
 * decay is raised.
 *
 * Nodes are sprites sharing one circle texture (a single instanced batch on
 * the GPU) tinted per category; edges are one Graphics mesh (retained while
 * static, rebuilt per tick while the simulation is hot).
 *
 * Pixi and d3-force are imported dynamically: browser-only, and they must not
 * ride into the SSR bundle or any other route's chunk.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: rawPayload } = useGraph()

/**
 * MOC notes (and `Root`, the lone Home note sharing their color/cluster slot)
 * are pure navigation hubs, not content — hundreds of incident edges each,
 * which would otherwise dominate the layout. Stripped for this map only; the
 * shared `useGraph` payload is left untouched for other consumers.
 *
 * Reindexes nodes so `i` matches array position (edges/adjacency rely on
 * that), remaps/drops edges accordingly, recomputes each node's degree from
 * the surviving edges (stale degrees would missize radius/collision/springs),
 * and recomputes `bounds` from the surviving baked positions (a fit fallback
 * until the simulation exists).
 */
function excludeMocs(p: GraphPayload): GraphPayload {
  const oldToNew = new Map<number, number>()
  const nodes: GraphNode[] = []
  for (const n of p.nodes) {
    if (n.c === 'MOCs' || n.c === 'Root') continue
    oldToNew.set(n.i, nodes.length)
    nodes.push({ i: nodes.length, l: n.l, p: n.p, c: n.c, d: 0, x: n.x, y: n.y })
  }

  const edges: GraphEdge[] = []
  for (const [a, b] of p.edges) {
    const na = oldToNew.get(a)
    const nb = oldToNew.get(b)
    if (na == null || nb == null) continue
    edges.push([na, nb])
    nodes[na]!.d++
    nodes[nb]!.d++
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x > maxX) maxX = n.x
    if (n.y > maxY) maxY = n.y
  }
  const bounds = nodes.length ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  return { nodes, edges, bounds }
}

const payload = computed<GraphPayload | null>(() => {
  const p = rawPayload.value
  return p ? excludeMocs(p) : null
})

const containerRef = ref<HTMLElement | null>(null)
const hoverIndex = shallowRef<number | null>(null)
const ready = shallowRef(false)

/* ----------------------------------------------------------- lab controls -- */

// Persisted per browser: the panel settings survive refreshes and return
// visits. The component only ever runs client-side (ClientOnly), and
// useLocalStorage keeps the ref and the stored value in sync both ways.
const physicsOn = useLocalStorage('uapgdb-map:physics', true)
const clusterPull = useLocalStorage('uapgdb-map:cluster-pull', 0.4)
const spacing = useLocalStorage('uapgdb-map:node-spacing', 69)
const labelsOn = useLocalStorage('uapgdb-map:zoom-labels', true)

/** Hovered legend row — dims every node outside that category. */
const catFocus = shallowRef<Category | null>(null)

// The overlay cards collapse to icon buttons (key above wrench, top right).
// They start open where there's room and closed on phone-sized screens;
// initialized in onMounted — the overlays are v-if="ready", so no SSR concern.
const controlsOpen = shallowRef(true)
const legendOpen = shallowRef(true)

function closeLegend(): void {
  legendOpen.value = false
  catFocus.value = null
}

let dirty = true
let kDirty = true
let focusDirty = true
let geomDirty = false // node positions moved (sim tick, drag, mode switch)
let hoverPos: { x: number, y: number } | null = null

/* ---------------------------------------------------- pointer interaction -- */

// Dragging is maneuvering only: every pointer routes to the camera (pan,
// pinch, tap). Nodes can't be grabbed or repositioned — they respond to taps
// and hovers alone.

/**
 * Touch has no hover, so a tap stands in for it: the first tap on a node pins
 * the hover state open (fan + name plates) so it can be read; a tap on empty
 * map clears it; tapping the pinned node again — or one of its fanned
 * neighbours, only while pinned — follows the link like a mouse click would.
 * Mouse taps keep their one-click-navigates behavior.
 */
let pinnedFocus: number | null = null
let lastPointerType = 'mouse'

function setPin(i: number | null): void {
  if (pinnedFocus === i) return
  pinnedFocus = i
  focusDirty = true
  dirty = true
}

function nodeTapped(i: number | null): void {
  if (lastPointerType === 'mouse') {
    if (i != null && payload.value) emit('select', payload.value.nodes[i]!)
    return
  }
  if (i == null) {
    setPin(null)
    return
  }
  if (pinnedFocus != null && (i === pinnedFocus || activeNeighbours(pinnedFocus).includes(i))) {
    if (payload.value) emit('select', payload.value.nodes[i]!)
    return
  }
  setPin(i)
}

const camera = useMapCamera(containerRef, {
  onTap(x, y) {
    nodeTapped(hitTest(x, y))
  },
  onHover(pos) {
    hoverPos = pos
    focusDirty = true
    dirty = true
  },
})

function hitTest(sx: number, sy: number): number | null {
  const p = payload.value
  if (!p) return null
  const src: any = simNodes ?? p.nodes
  return pickDisplayed(src, sx, sy)
}

function onPointerDown(e: PointerEvent): void {
  lastPointerType = e.pointerType
  // A stale mouse hoverPos would immediately override the pin a touch tap is
  // about to set (hybrid devices).
  if (e.pointerType !== 'mouse') hoverPos = null
  camera.handlers.onPointerDown(e)
}

/** Pointer is over an overlay card — whatever node was hovered (or touch-pinned) no longer is. */
function clearNodeHover(): void {
  hoverPos = null
  pinnedFocus = null
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

/* ------------------------------------------------------------ hover spread -- */

// Display-only offsets that fan the hovered node's neighbours into evenly
// spaced rings so their labels stay legible. The d3 simulation never sees
// these: sprites, labels, focus edges and picking add them on top of the true
// positions, and they lerp back to zero when the hover ends, so the physics
// layout returns exactly to where it was.
const SPREAD_ARC = 92 // px of ring arc reserved per neighbour label, minimum
const SPREAD_GAP = 78 // px between successive rings
let offX = new Float64Array(0)
let offY = new Float64Array(0)
let tgtX = new Float64Array(0)
let tgtY = new Float64Array(0)
/** Spread slot bearing per node — its label anchors radially outward along it. */
let spreadAng = new Float64Array(0)
/** Nodes with a non-zero offset or target — the only ones touched per frame. */
const spreadActive = new Set<number>()
let spreadSettled = true
let spreadRadiusPx = 0 // outermost ring in screen px — the hover grace zone

/** HTML title panel for the hovered node (replaces its Pixi label). */
const hoverPanelRef = ref<HTMLElement | null>(null)
const hoverTitle = computed(() => {
  const p = payload.value
  return p && hoverIndex.value != null ? p.nodes[hoverIndex.value]!.l : ''
})

/**
 * Matching name plates for the fanned neighbours (replace their Pixi labels
 * while a hover is active). The list is reactive (rebuilt per focus change);
 * positions are imperative — the render loop writes each plate's transform,
 * anchored radially outward along its spread bearing like the old BitmapText.
 */
const neighbourPlates = shallowRef<{ i: number, l: string }[]>([])
const plateEls = new Map<number, HTMLElement>()
function setPlateRef(i: number) {
  return (el: unknown) => {
    if (el) plateEls.set(i, el as HTMLElement)
    else plateEls.delete(i)
  }
}

/**
 * `pickNode`, but against the displayed (spread-offset) positions, skipping
 * nodes the staged build hasn't added yet.
 */
function pickDisplayed(src: any[], sx: number, sy: number): number | null {
  const staged = physicsOn.value && activeFlag.length === src.length
  if (!spreadActive.size && !staged) return pickNode(src, camera.pan.value, camera.k.value, sx, sy)
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  let best: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < src.length; i++) {
    if (staged && !activeFlag[i]) continue
    const n = src[i]!
    const dx = px + (n.x + offX[i]!) * k - sx
    const dy = py + (n.y + offY[i]!) * k - sy
    const r = nodeRadius(n.d) + 4
    const d2 = dx * dx + dy * dy
    if (d2 <= r * r && d2 < bestDist) {
      bestDist = d2
      best = i
    }
  }
  return best
}

// Hover grace: once a node is fanned open, the hover survives only close to
// the focus node itself, or along the corridor to each fanned neighbour (a
// capsule from the focus to just past the neighbour, covering its name
// plate). The old grace zone — a disc out to the outermost spread ring — kept
// the hover alive across the whole neighbourhood's empty space, long after
// the pointer had visibly left it.
const GRACE_CORE = 44 // px beyond the focus node's radius
const GRACE_HALF = 38 // capsule half-width around each corridor
const GRACE_PLATE = 92 // px the corridor extends past a neighbour, under its plate

/** The retained focus if the pointer is still within the grace shape, else null. */
function graceFocus(src: any[]): number | null {
  if (focus == null || hoverPos == null || spreadRadiusPx <= 0) return null
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  const nf = src[focus]!
  const fx = px + (nf.x + offX[focus]!) * k
  const fy = py + (nf.y + offY[focus]!) * k
  const dx0 = hoverPos.x - fx
  const dy0 = hoverPos.y - fy
  const core = nodeRadius(payload.value!.nodes[focus]!.d) + 3 + GRACE_CORE
  if (dx0 * dx0 + dy0 * dy0 <= core * core) return focus

  for (const j of activeNeighbours(focus)) {
    const nj = src[j]!
    const ex = px + (nj.x + offX[j]!) * k + Math.cos(spreadAng[j]!) * GRACE_PLATE - fx
    const ey = py + (nj.y + offY[j]!) * k + Math.sin(spreadAng[j]!) * GRACE_PLATE - fy
    const len2 = ex * ex + ey * ey
    const t = len2 > 0 ? Math.max(0, Math.min(1, (dx0 * ex + dy0 * ey) / len2)) : 0
    const ddx = dx0 - ex * t
    const ddy = dy0 - ey * t
    if (ddx * ddx + ddy * ddy <= GRACE_HALF * GRACE_HALF) return focus
  }
  return null
}

/**
 * Compute each neighbour's spread target around the hovered node. Slots are
 * built ring by ring (capacity grows with circumference, quotas spread
 * proportionally so the outer ring isn't left nearly empty), then sorted by
 * angle and matched to the neighbours sorted by their true bearing — the
 * cyclic order is preserved, so the fan-out neither crosses nor travels far.
 */
function setSpreadTargets(src: any[]): void {
  for (const i of spreadActive) {
    tgtX[i] = 0
    tgtY[i] = 0
  }
  spreadRadiusPx = 0
  spreadSettled = false
  if (focus == null) return
  const nbrs = activeNeighbours(focus)
  const n = nbrs.length
  if (!n) return
  const f = src[focus]!
  const k = camera.k.value

  const order = nbrs
    .map(j => ({ j, a: Math.atan2(src[j]!.y - f.y, src[j]!.x - f.x) }))
    .sort((u, v) => u.a - v.a)

  // Slot arc adapts to this neighbourhood's label widths (~5.6 px/char at
  // font 11). Adjacent slots in a ring are also staggered half a gap radially,
  // so only every *second* slot shares a radius — half the mean width plus
  // padding is enough arc.
  let chars = 0
  const pn = payload.value!.nodes
  for (const j of nbrs) chars += Math.min(pn[j]!.l.length, 40)
  const arc = Math.max(SPREAD_ARC, Math.min(170, ((chars / n) * 5.6) / 2 + 34))

  const r0 = Math.max(84, Math.min(130, (n * arc) / (2 * Math.PI)))
  const ringR: number[] = []
  let cap = 0
  for (let m = 0; cap < n; m++) {
    const r = r0 + m * SPREAD_GAP
    ringR.push(r)
    cap += Math.max(1, Math.floor((2 * Math.PI * r) / arc))
  }
  const totalR = ringR.reduce((s, r) => s + r, 0)
  const slots: { a: number, r: number }[] = []
  let assigned = 0
  ringR.forEach((r, m) => {
    const q = m === ringR.length - 1
      ? n - assigned
      : Math.min(n - assigned, Math.round((n * r) / totalR))
    assigned += q
    // Rings are offset half a slot from each other, and alternate slots
    // within a ring bump out half a gap, so no two nearby labels share both
    // a bearing and a radius.
    for (let s = 0; s < q; s++) {
      slots.push({ a: -Math.PI + ((s + (m % 2) * 0.5) / q) * 2 * Math.PI, r: r + (s % 2) * (SPREAD_GAP * 0.45) })
    }
  })
  slots.sort((u, v) => u.a - v.a)

  // Rotate the whole arrangement by the circular mean of (bearing − slot) so
  // the fan opens from where the neighbours already sit.
  let cx = 0
  let cy = 0
  for (let j = 0; j < n; j++) {
    const d = order[j]!.a - slots[j]!.a
    cx += Math.cos(d)
    cy += Math.sin(d)
  }
  const delta = Math.atan2(cy, cx)

  for (let j = 0; j < n; j++) {
    const i = order[j]!.j
    const slot = slots[j]!
    const a = slot.a + delta
    const rg = slot.r / k // ring radii are screen px; offsets live in graph units
    tgtX[i] = f.x + Math.cos(a) * rg - src[i]!.x
    tgtY[i] = f.y + Math.sin(a) * rg - src[i]!.y
    spreadAng[i] = a
    spreadActive.add(i)
    if (slot.r > spreadRadiusPx) spreadRadiusPx = slot.r
  }
}

/** The focus node's neighbours, minus any the staged build hasn't added yet. */
function activeNeighbours(i: number): number[] {
  const nbrs = adjacency.value[i] ?? []
  if (!physicsOn.value || activeFlag.length !== (payload.value?.nodes.length ?? 0)) return nbrs
  return nbrs.filter(j => activeFlag[j])
}

/** Rebuild the neighbour-plate list for the current focus. */
function syncPlates(): void {
  const p = payload.value
  if (!p || focus == null) {
    neighbourPlates.value = []
    return
  }
  neighbourPlates.value = activeNeighbours(focus).map(j => ({ i: j, l: p.nodes[j]!.l }))
}

/** Lerp offsets toward their targets; snap when within half a screen px. */
function stepSpread(dt: number): void {
  const ease = 1 - 0.85 ** dt
  const snap = 0.5 / camera.k.value
  let settled = true
  for (const i of spreadActive) {
    const dx = tgtX[i]! - offX[i]!
    const dy = tgtY[i]! - offY[i]!
    if (dx * dx + dy * dy <= snap * snap) {
      offX[i] = tgtX[i]!
      offY[i] = tgtY[i]!
    }
    else {
      offX[i] = offX[i]! + dx * ease
      offY[i] = offY[i]! + dy * ease
      settled = false
    }
  }
  spreadSettled = settled
}

/* --------------------------------------------------------------- physics -- */

const CHARGE_RANGE = 350 // base px reach of node-node repulsion (see REPEL_RANGE)
const VELOCITY_DECAY = 0.55 // > d3's 0.4 default; damps the spring oscillation
const ALPHA_DECAY = 0.02
const HUB_EXP = 0.75 // spring damping exponent by larger endpoint degree
// Hub damping alone leaves most springs too weak to beat collision (a link to
// a degree-30 node lands near 0.08), which made the link-distance slider a
// no-op. Intra-category links get a real floor; cross-category links keep only
// a fraction of it so the connective tissue can't drag clusters together.
const LINK_MIN = 0.18
// Fixed spring rest length. This had a slider, but between the collision
// shell and the anchor scatter its visible effect never justified the knob.
const LINK_DIST = 350
const CROSS_CAT_DAMP = 0.45 // extra spring damping when a link crosses categories
const PACKING = 0.55 // assumed disc packing efficiency when sizing clusters
const RING_SHARE = 0.62 // anchor ring radius as a share of the packed-graph radius
const FIT_PAD = 56 // px margin the auto-fit keeps around the layout
// Per-node anchor scatter. Pulling a whole category toward one shared point
// packs its weakly-linked nodes into concentric shells around that point —
// the "rings of unrelated nodes" artifact. Instead every node gets a personal
// gravity target on the cluster's disc (deterministic hash of its index), so
// the interior settles as an organic cloud. 0 = point anchor, 1 = targets
// spread across the full cluster radius.
const SCATTER = 0.85

let d3: any = null
let sim: any = null

/* ------------------------------------------------------------ staged build -- */

// The graph doesn't appear all at once: nodes join the live simulation in
// per-frame batches (fading in as they land) until the whole graph is in.
// Solving 1k nodes' constraints from a cold start is what made the first
// seconds a twitchy mess — grown incrementally from near-equilibrium seeds,
// the layout stays calm the whole way (this is also how Obsidian's graph
// reads on open). Membership is re-registered with d3 per batch: re-running
// the forces' initialize over the active slice is O(n+m) and trivially cheap.
const BUILD_MS = 3800 // wall-clock target for the full grow-in
const FADE_MS = 450 // per-node fade-in once added
let building = false
let addOrder: number[] = [] // deterministic shuffle — every cluster grows at once
let activeCursor = 0
let activeFlag = new Uint8Array(0)
let activeNodes: any[] = [] // the slice d3 currently simulates
let activeLinks: any[] = [] // links with both endpoints active
let incident: number[][] = [] // payload edge indices per node
let linkObjs: any[] = [] // one object per payload edge, registered as it completes
let fadeA = new Float32Array(0)
const fadingNodes = new Set<number>()

function beginBuild(): void {
  const p = payload.value
  if (!p || !simNodes || !sim) return
  const n = simNodes.length
  activeFlag = new Uint8Array(n)
  fadeA = new Float32Array(n)
  activeNodes = []
  activeLinks = []
  fadingNodes.clear()
  activeCursor = 0
  // mulberry32 shuffle, fixed seed: same grow-in order every load.
  addOrder = Array.from({ length: n }, (_, i) => i)
  let a = 0x2545F491
  const rand = (): number => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = addOrder[i]!
    addOrder[i] = addOrder[j]!
    addOrder[j] = tmp
  }
  for (let i = 0; i < n; i++) {
    sprites[i]!.visible = false
    rings[i]!.visible = false
    if (labels[i]) labels[i].visible = false
  }
  sim.nodes(activeNodes)
  sim.force('link').links(activeLinks)
  sim.alpha(0.5)
  building = true
  // A pinned hover can't survive a rebuild — its neighbourhood is regrowing.
  pinnedFocus = null
}

/** Move one per-frame batch of nodes (and their completed links) into the sim. */
function stepBuild(deltaMS: number): void {
  if (!building || !simNodes) return
  const n = simNodes.length
  const add = Math.max(1, Math.round((n * deltaMS) / BUILD_MS))
  for (let b = 0; b < add && activeCursor < n; b++) {
    const i = addOrder[activeCursor++]!
    activeFlag[i] = 1
    activeNodes.push(simNodes[i])
    sprites[i]!.visible = true
    sprites[i]!.alpha = 0
    rings[i]!.visible = true
    rings[i]!.alpha = 0
    fadingNodes.add(i)
    for (const e of incident[i] ?? []) {
      const l = linkObjs[e]!
      if (activeFlag[l.a === i ? l.b : l.a]) activeLinks.push(l)
    }
  }
  sim.nodes(activeNodes)
  sim.force('link').links(activeLinks)
  // Held warm for the whole grow-in; decays to a freeze once complete.
  sim.alpha(Math.max(sim.alpha(), 0.35))
  if (activeCursor >= n) building = false
}
/**
 * Auto-fit serves the *initial* settle (and explicit restarts — Reset layout,
 * physics toggle) only. Once the simulation cools, or the user takes the
 * camera, it latches off: slider reheats and resizes then play out under a
 * stationary camera, so the layout visibly expands/contracts in place instead
 * of being renormalized away by a per-frame re-fit (nodes render at a fixed
 * screen radius, so a re-fit cancels any near-uniform scale change).
 */
let autoFit = true
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

/** Unit-disc scatter coordinates per node — see SCATTER. */
let scatX = new Float64Array(0)
let scatY = new Float64Array(0)

function computeScatter(n: number): void {
  if (scatX.length === n) return
  scatX = new Float64Array(n)
  scatY = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    // mulberry32 keyed by index: stable across reloads, no Math.random.
    let a = (Math.imul(i + 1, 0x9E3779B9) ^ 0x6D2B79F5) >>> 0
    const next = (): number => {
      a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const angle = next() * Math.PI * 2
    const rad = Math.sqrt(next()) // uniform over the disc
    scatX[i] = Math.cos(angle) * rad
    scatY[i] = Math.sin(angle) * rad
  }
}

/**
 * Deterministic seed: every node starts at its own scattered gravity target,
 * so the layout begins near equilibrium and relaxes instead of untangling a
 * cross-graph swirl.
 */
function seedSimulation(): void {
  if (!simNodes) return
  for (const n of simNodes) {
    n.x = anchorX(n)
    n.y = anchorY(n)
    ;(n as any).vx = 0
    ;(n as any).vy = 0
  }
}

// Nodes render at a fixed *screen* radius while collision runs in graph units,
// so after fit-to-view a hub pair kept only r₁+r₂ apart still overlaps on
// screen. Scaling the keep-apart distance by the render radius (the baked
// layout's SEP_K trick, gentler here) buys hubs screen room proportional to
// their size.
//
// The spacing slider multiplies the *whole* keep-apart radius rather than
// adding a small pad — collision is the binding constraint at equilibrium, so
// a multiplier is what actually changes the packing density. Slider 12 maps
// to 1× the base radius; 0 lets nodes pile nearly on top of each other; the
// default (34) runs ~2.4×; 90 is a near-empty six-fold spread.
function collideRadius(n: { d: number }): number {
  return (nodeRadius(n.d) * 2.2 + 12) * (0.25 + 0.75 * (spacing.value / 12))
}

// Fixed charge. This had a slider too, but like link distance its settled
// result was near-identical across the whole range — collision and cluster
// pull own the equilibrium. The reach must extend well past the collide
// contact shell or charge can't loosen the packing at all.
const REPEL = 700
const REPEL_RANGE = CHARGE_RANGE * (0.5 + REPEL / 240) // ~1200 px

function anchorX(n: { i: number, c: Category }): number {
  const cl = clusters.get(aliasCat(n.c))
  return cl ? cl.x + scatX[n.i]! * cl.r * SCATTER : 0
}

function anchorY(n: { i: number, c: Category }): number {
  const cl = clusters.get(aliasCat(n.c))
  return cl ? cl.y + scatY[n.i]! * cl.r * SCATTER : 0
}

function buildSimulation(p: GraphPayload): void {
  computeScatter(p.nodes.length)
  simNodes = p.nodes.map(n => ({ i: n.i, x: n.x, y: n.y, d: n.d, c: n.c }))
  // Spring strength damped by the larger endpoint degree (precomputed — no
  // dependence on d3's link-resolution order), then floored (see LINK_MIN) so
  // every link keeps enough tension for the link-distance slider to matter.
  // Links that cross categories keep only a fraction of the floor so the
  // connective tissue between clusters doesn't drag them into a central pool.
  // `a`/`b` keep the payload indices: d3 rewrites source/target to node
  // objects on registration, and the staged build needs the raw endpoints.
  linkObjs = p.edges.map(([source, target]) => {
    const a = p.nodes[source]!
    const b = p.nodes[target]!
    const hub = Math.max(LINK_MIN, Math.min(1, 1 / Math.max(a.d, b.d, 1) ** HUB_EXP))
    return { source, target, a: source, b: target, s: hub * (aliasCat(a.c) === aliasCat(b.c) ? 1 : CROSS_CAT_DAMP) }
  })
  incident = Array.from({ length: p.nodes.length }, () => [])
  p.edges.forEach(([a, b], e) => {
    incident[a]!.push(e)
    incident[b]!.push(e)
  })
  // The sim starts EMPTY — the staged build grows its membership (see
  // stepBuild). The id accessor resolves links by payload index, so link
  // registration is independent of activation order.
  sim = d3.forceSimulation([])
    .force('charge', d3.forceManyBody().strength(-REPEL).theta(0.9).distanceMax(REPEL_RANGE))
    .force('link', d3.forceLink([]).id((nd: any) => nd.i).distance(LINK_DIST).strength((l: any) => l.s))
    .force('collide', d3.forceCollide().radius(collideRadius).strength(0.8).iterations(2))
    .force('cx', d3.forceX(anchorX).strength(clusterPull.value))
    .force('cy', d3.forceY(anchorY).strength(clusterPull.value))
    .velocityDecay(VELOCITY_DECAY)
    .alphaDecay(ALPHA_DECAY)
    .stop() // ticked manually from the render loop
  seedSimulation()
}

function reheat(alpha: number): void {
  if (!sim || !payload.value) return
  computeClusters(payload.value)
  sim.force('charge').strength(-REPEL).distanceMax(REPEL_RANGE)
  sim.force('link').distance(LINK_DIST)
  sim.force('collide').radius(collideRadius)
  sim.force('cx').x(anchorX).strength(clusterPull.value)
  sim.force('cy').y(anchorY).strength(clusterPull.value)
  sim.alpha(Math.max(sim.alpha(), alpha))
  dirty = true
}

watch([clusterPull, spacing], () => reheat(0.5))

/** Bounding box of whatever layout is currently on screen. */
function currentBounds(): GraphPayload['bounds'] {
  const p = payload.value!
  const src: { x: number, y: number }[] = simNodes ?? p.nodes
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
  beginBuild() // fresh layout grows back in, node by node
  autoFit = true // fresh layout: the camera frames the settle again
  camera.fitTo(currentBounds(), FIT_PAD)
  geomDirty = true
  focusDirty = true
  dirty = true
}

/**
 * The physics-off layout is the SAME clustered equilibrium as the live one —
 * the whole graph is registered at once and relaxed synchronously, then the
 * simulation is parked (the render loop only ticks while physics is on).
 * ~150 ticks from near-equilibrium seeds settle in well under a second.
 */
const STATIC_TICKS = 150
function settleStatic(): void {
  const p = payload.value
  if (!p || !sim || !simNodes) return
  building = false
  fadingNodes.clear()
  const n = simNodes.length
  activeFlag = new Uint8Array(n).fill(1)
  fadeA = new Float32Array(n).fill(1)
  activeNodes = simNodes.slice()
  activeLinks = linkObjs.slice()
  for (let i = 0; i < n; i++) {
    sprites[i]!.visible = true
    sprites[i]!.alpha = 1
    rings[i]!.visible = true
    rings[i]!.alpha = 1
  }
  sim.nodes(activeNodes)
  sim.force('link').links(activeLinks)
  sim.alpha(0.5)
  for (let t = 0; t < STATIC_TICKS && sim.alpha() > 0.025; t++) sim.tick()
  sim.alpha(0) // parked
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
  else if (building) {
    // Mid-build freeze: nodes not yet simulated are still piled on their
    // seeds, so finish the layout synchronously instead of showing the pile.
    settleStatic()
  }
  else {
    // Fully settled — freezing is free; hold the layout and camera as they are.
    sim?.alpha(0)
    fadingNodes.clear()
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
    reheat(0)
    seedSimulation()
    settleStatic()
    camera.fitTo(currentBounds(), FIT_PAD)
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
  offX = new Float64Array(p.nodes.length)
  offY = new Float64Array(p.nodes.length)
  tgtX = new Float64Array(p.nodes.length)
  tgtY = new Float64Array(p.nodes.length)
  spreadAng = new Float64Array(p.nodes.length)
  spreadActive.clear()
  spreadSettled = true
  spreadRadiusPx = 0
  focus = null
  neighbourPlates.value = []
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

  // Focus edges live in screen space on the stage, rebuilt per focus change —
  // slotted BELOW `world` so node/neighbour labels always paint above them.
  focusG?.destroy()
  focusG = new PIXI.Graphics()
  app.stage.addChildAt(focusG, 0)

  computeClusters(p)
  buildSimulation(p)
  applyPalette()
  // Physics on: the staged grow-in. Physics off (persisted): the same
  // clustered layout, settled synchronously and shown at once.
  if (physicsOn.value) beginBuild()
  else settleStatic()
  autoFit = true
  camera.fitTo(currentBounds(), FIT_PAD)
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
  const staged = physicsOn.value && activeFlag.length === src.length
  edgesG.clear()
  for (const [a, b] of p.edges) {
    if (staged && (!activeFlag[a] || !activeFlag[b])) continue
    const na = src[a]
    const nb = src[b]
    if (!na || !nb) continue
    edgesG.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
  }
  edgesG.stroke({ width: 1, color: 0xffffff, alpha: 1, pixelLine: true })
  edgesG.tint = palette.edge
}

/** One pass per frame while anything is dirty or the simulation is hot. */
function update(ticker?: any): void {
  const p = payload.value
  if (!p || !world) return

  if (building && physicsOn.value && sim) stepBuild(ticker?.deltaMS ?? 16.7)

  const hot = physicsOn.value && sim && sim.alpha() > 0.02
  if (hot) {
    sim.tick()
    geomDirty = true
    dirty = true
    // Keep the settling layout in frame until the settle completes or the
    // user takes the camera (see autoFit). The fit GLIDES toward its target
    // rather than snapping every frame — during the staged grow-in the bounds
    // expand in steps, and a hard per-frame fit read as zoom jumps.
    if (autoFit && !camera.userAdjusted.value) {
      camera.fitTo(currentBounds(), FIT_PAD, 1 - 0.92 ** (ticker?.deltaTime ?? 1))
    }
  }
  else {
    // The settle is over; later reheats (slider tweaks) keep the camera still.
    autoFit = false
  }
  // Spread offsets or fade-ins in flight: keep frames coming (alongside the
  // hot/dirty gates) without touching the simulation.
  const animating = (spreadActive.size > 0 && !spreadSettled) || fadingNodes.size > 0 || building
  if (animating) dirty = true
  if (!dirty) return
  dirty = false

  const src: any[] = (simNodes as any[]) ?? (p.nodes as any[])
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  world.position.set(px, py)
  world.scale.set(k)

  {
    let next: number | null
    if (hoverPos) {
      // A live mouse hover takes over from (and clears) any touch pin.
      pinnedFocus = null
      next = pickDisplayed(src, hoverPos.x, hoverPos.y)
      // The grace corridors keep the hover alive while the pointer travels
      // out to a fanned neighbour (see graceFocus).
      if (next == null) next = graceFocus(src)
    }
    else {
      next = pinnedFocus // a touch-pinned hover persists with no pointer down
    }
    if (next !== focus) {
      focus = next
      focusDirty = true
      setSpreadTargets(src)
      syncPlates()
    }
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

  // Spread offsets ride on top of the true positions (the dim edge mesh keeps
  // true positions — it's near-invisible while a hover is active). Applied
  // after the geomDirty pass so a hot sim doesn't stomp the offsets.
  if (spreadActive.size) {
    if (!spreadSettled) stepSpread(ticker?.deltaTime ?? 1)
    for (const i of spreadActive) {
      const x = src[i]!.x + offX[i]!
      const y = src[i]!.y + offY[i]!
      sprites[i]!.position.set(x, y)
      rings[i]!.position.set(x, y)
      // Snapped home with no target left: the node is back exactly.
      if (offX[i] === 0 && offY[i] === 0 && tgtX[i] === 0 && tgtY[i] === 0) spreadActive.delete(i)
    }
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

  // Fade-ins override the alpha the pass above assigned, so this runs after
  // it. Only nodes still mid-fade are touched.
  if (fadingNodes.size) {
    const dms = ticker?.deltaMS ?? 16.7
    for (const i of fadingNodes) {
      const f = Math.min(1, fadeA[i]! + dms / FADE_MS)
      fadeA[i] = f
      sprites[i]!.alpha = f
      rings[i]!.alpha = f
      if (f >= 1) fadingNodes.delete(i)
    }
  }

  // Focus edges, screen space, following the DISPLAYED (spread) positions.
  if (focusDirty || hot || animating) {
    focusDirty = false
    focusG.clear()
    if (focus != null) {
      const nf = src[focus]!
      const fx = px + nf.x * k
      const fy = py + nf.y * k
      for (const j of activeNeighbours(focus)) {
        const nj = src[j]!
        focusG.moveTo(fx, fy).lineTo(px + (nj.x + offX[j]!) * k, py + (nj.y + offY[j]!) * k)
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
  const staged = physicsOn.value && activeFlag.length === p.nodes.length
  for (let i = 0; i < p.nodes.length; i++) {
    const existing = labels[i]
    // The hovered node and its fanned neighbours use HTML name plates instead
    // of Pixi labels while the hover is active. Nodes the staged build hasn't
    // added yet have nothing to label.
    if (i === focus || (focus != null && neighbours!.has(i)) || (staged && !activeFlag[i])) {
      if (existing) existing.visible = false
      continue
    }
    let show = false
    const nx = src[i]!.x + offX[i]!
    const ny = src[i]!.y + offY[i]!
    if (zoomLabels) {
      const sx = px + nx * k
      const sy = py + ny * k
      show = sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin
    }
    if (!show) {
      if (existing) existing.visible = false
      continue
    }
    const t = labelFor(i)
    t.visible = true
    const r = nodeRadius(p.nodes[i]!.d)
    t.scale.set(1 / k)
    t.position.set(nx, ny + (r + 2) / k)
  }

  // The blurred HTML title panel tracks the hovered node's screen position;
  // v-show (via hoverIndex) owns its visibility.
  const panel = hoverPanelRef.value
  if (panel && focus != null) {
    const nf = src[focus]!
    const pr = nodeRadius(p.nodes[focus]!.d) + 3
    panel.style.transform = `translate(${px + nf.x * k}px, ${py + nf.y * k + pr + 7}px) translateX(-50%)`
  }

  // Neighbour plates track their fanned (displayed) positions, anchored to
  // extend radially outward along the spread bearing — the CSS %-translate is
  // the Pixi anchor trick, so side plates grow sideways and stacked rings at
  // the same bearing can't overlap.
  if (focus != null) {
    for (const { i } of neighbourPlates.value) {
      const el = plateEls.get(i)
      if (!el) continue
      const ca = Math.cos(spreadAng[i]!)
      const sa = Math.sin(spreadAng[i]!)
      const r = nodeRadius(p.nodes[i]!.d) + 5
      const sx = px + (src[i]!.x + offX[i]!) * k + ca * r
      const sy = py + (src[i]!.y + offY[i]!) * k + sa * r
      el.style.transform = `translate(${sx}px, ${sy}px) translate(${ca * 50 - 50}%, ${sa * 50 - 50}%)`
      el.style.opacity = '1'
    }
  }
}

/* -------------------------------------------------------------- lifecycle -- */

watch(payload, () => buildSceneIfReady())

// The camera's ResizeObserver reassigns size as a fresh object every callback,
// so compare dimensions before reacting. Once the settle completes or the user
// takes the camera, a resize changes nothing: re-anchoring the clusters and
// re-fitting then would drag the layout out from under the settled view.
// (Physics-off is a frozen snapshot — refitting it on resize is safe.)
let lastW = 0
let lastH = 0
watch(() => camera.size.value, ({ w, h }) => {
  if (w === lastW && h === lastH) return
  lastW = w
  lastH = h
  if (payload.value && w > 0 && h > 0 && !camera.userAdjusted.value && (autoFit || !physicsOn.value)) {
    if (physicsOn.value && sim) reheat(0.3) // anchors follow the new aspect
    camera.fitTo(currentBounds(), FIT_PAD)
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
  // Phone-sized screens start with both overlay cards collapsed to their
  // icon buttons — open panels would cover most of the map.
  const small = window.innerWidth <= 900
  controlsOpen.value = !small
  legendOpen.value = !small
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
    @pointermove="camera.handlers.onPointerMove"
    @pointerup="camera.handlers.onPointerUp"
    @pointercancel="camera.handlers.onPointerUp"
    @pointerleave="camera.handlers.onPointerLeave"
    @wheel.prevent="camera.handlers.onWheel"
  >
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>

    <!-- Name plates for the fanned neighbours — same panel treatment as the
         hovered node's title; positioned imperatively from the render loop.
         They start transparent so a freshly mounted plate never flashes at the
         origin before its first transform lands. -->
    <div
      v-for="plate in neighbourPlates"
      :key="plate.i"
      :ref="setPlateRef(plate.i)"
      class="pointer-events-none absolute left-0 top-0 z-10 select-none whitespace-nowrap rounded-md border border-border/50 bg-background/60 px-2 py-0.5 backdrop-blur-xl"
      style="will-change: transform; opacity: 0"
    >
      <span class="font-sans text-[11px] text-foreground">{{ plate.l }}</span>
    </div>

    <!-- Hovered node's title — HTML so it can sit on a blurred panel; positioned
         imperatively (style.transform) from the render loop every frame. -->
    <div
      v-show="hoverIndex != null"
      ref="hoverPanelRef"
      class="pointer-events-none absolute left-0 top-0 z-10 select-none whitespace-nowrap rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 backdrop-blur-xl"
      style="will-change: transform"
    >
      <span class="font-sans text-xs font-medium text-foreground">{{ hoverTitle }}</span>
    </div>

    <!-- Overlay stack, top right: the key (legend) above the map controls.
         Each card collapses to an icon button — key and wrench respectively. -->
    <div
      v-if="ready"
      class="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] select-none flex-col items-end gap-2 overflow-y-auto overscroll-contain"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointerenter="clearNodeHover"
      @wheel.stop
    >
      <!-- Key / category legend — hover a row to spotlight that type. -->
      <button
        v-if="!legendOpen"
        type="button"
        aria-label="Show the map key"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/60 text-muted-foreground backdrop-blur-xl transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
        @click="legendOpen = true"
      >
        <Key :size="15" />
      </button>
      <div
        v-else
        class="w-[216px] shrink-0 rounded-lg border border-border/50 bg-background/60 p-2.5 backdrop-blur-xl"
        @pointerleave="catFocus = null"
      >
        <div class="mb-1 flex items-center justify-between pl-1">
          <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Node types
          </span>
          <button
            type="button"
            aria-label="Close the map key"
            class="-mr-0.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="closeLegend"
          >
            <X :size="13" />
          </button>
        </div>
        <ul class="flex flex-col gap-px">
          <li
            v-for="entry in legend"
            :key="entry.c"
            class="flex cursor-default items-center gap-2 rounded-sm px-1 py-0.5 font-mono text-[11px] leading-4 transition-colors duration-fast ease-standard hover:bg-accent/60"
            @pointerenter="catFocus = entry.c"
          >
            <span
              class="size-2.5 shrink-0 rounded-full"
              :style="{ background: `hsl(var(${entry.cssVar}))` }"
            />
            <span class="uppercase tracking-[0.08em] text-muted-foreground">{{ entry.c }}</span>
            <span class="ml-auto pl-4 text-right font-semibold tabular-nums text-foreground">{{ entry.count }}</span>
          </li>
        </ul>
      </div>

      <!-- Simulation controls — Obsidian-style graph settings. -->
      <button
        v-if="!controlsOpen"
        type="button"
        aria-label="Show the map controls"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/60 text-muted-foreground backdrop-blur-xl transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
        @click="controlsOpen = true"
      >
        <Wrench :size="15" />
      </button>
      <div
        v-else
        class="w-[216px] shrink-0 rounded-lg border border-border/50 bg-background/60 p-3 backdrop-blur-xl"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Map controls
          </span>
          <button
            type="button"
            aria-label="Close the map controls"
            class="-mr-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="controlsOpen = false"
          >
            <X :size="13" />
          </button>
        </div>
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
          {{ physicsOn ? 'Live d3-force layout, clustered by type — tune it with the sliders.' : 'Layout frozen in place — turn physics on to stir it.' }}
        </p>

        <div class="mt-3 flex flex-col gap-2.5" :class="physicsOn ? '' : 'pointer-events-none opacity-40'">
          <label class="block">
            <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Cluster pull <span class="tabular-nums text-foreground">{{ clusterPull.toFixed(2) }}</span>
            </span>
            <input
              v-model.number="clusterPull"
              type="range"
              min="0"
              max="0.6"
              step="0.02"
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
              max="90"
              step="3"
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
  </div>
</template>
