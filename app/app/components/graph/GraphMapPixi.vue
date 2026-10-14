<script setup lang="ts">
import type { Category, GraphEdge, GraphNode, GraphPayload } from '#shared/types/wiki'
import { ArrowLeft, ArrowUpRight, Key, Maximize2, Play, Search, SlidersHorizontal, X } from '@lucide/vue'
import { useLocalStorage } from '@vueuse/core'
import { type Bounds, buildAdjacency, fanLayout } from '~/utils/graph'
import { CATEGORY_COLOR_VAR, CATEGORY_LEGEND_ORDER, nodeRadius, readCategoryColors, readGraphPalette, type GraphPalette } from '~/utils/graphLab'
import { gridStep, LabelGrid, labelMinZoom, searchNodes } from '~/utils/siteMap'

/**
 * The site map (`/map`): a home-brew renderer on Pixi.js v8 + d3-force.
 *
 * Layout: every category gets an anchor on an ellipse shaped like the
 * container, and its nodes are pulled toward personal targets scattered over
 * that cluster's disc. Collision keeps nodes apart, so the graph settles into
 * loose per-type clusters. The physics is tuned once and fixed: the old
 * sliders (cluster pull, spacing, link distance, charge) barely changed the
 * settled result, so the controls now act on what you SEE instead: which
 * types are shown, how connected a page must be to appear, and labels.
 *
 * Opening: nodes join the live simulation in per-frame batches, hubs first,
 * popping in as they land, so the map assembles itself like constellations
 * filling in. Users who prefer reduced motion get the settled layout at once.
 *
 * Reading it: hubs are labelled from the first frame, and more names appear as
 * you zoom in (greedy collision culling keeps them from piling up). Category
 * titles sit over their clusters at overview zoom.
 *
 * Interaction:
 * - Hover a node to light up its links in place.
 * - Click (or search for) a node to PIN it: the camera glides over, its
 *   neighbourhood fans out into rings with name plates, the rest of the map
 *   blurs behind it, and a panel lists every connection by type. Click a
 *   fanned node (or the pinned one) to open that page; click a name in the
 *   panel to walk the graph to it (Back retraces your steps); click anywhere
 *   else or press Esc to close.
 *
 * Nodes are sprites sharing one circle texture (one instanced batch on the
 * GPU) tinted per category, each with a soft glow sprite behind it; edges are
 * one Graphics mesh, rebuilt only while the layout is moving.
 *
 * Pixi and d3-force are imported dynamically: browser-only, and they must not
 * ride into the SSR bundle or any other route's chunk.
 */

const emit = defineEmits<{
  select: [node: GraphNode]
  /** Laid out and drawn: the page can come off the loader. */
  ready: []
}>()

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
 * and recomputes `bounds` from the surviving baked positions.
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

/** `Root` is the lone Home note — it clusters (and colors) with the MOCs. */
function aliasCat(c: Category): Category {
  return c === 'Root' ? 'MOCs' : c
}

let dirty = true
let kDirty = true
let focusDirty = true
let geomDirty = false // node positions moved (sim tick, filter change)
/** The pinned fan must be re-solved (filters or the build changed its members). */
let fanDirty = false
let hoverPos: { x: number, y: number } | null = null
let reducedMotion = false

/* ---------------------------------------------------------------- filters -- */

// Persisted per browser. The component only ever runs client-side
// (ClientOnly), and useLocalStorage keeps the ref and the stored value in sync.
const hiddenCats = useLocalStorage<Category[]>('uapgdb-map:hidden-types', [])
const minLinks = useLocalStorage('uapgdb-map:min-links', 0)
const labelsOn = useLocalStorage('uapgdb-map:zoom-labels', true)

/** Hovered legend row — dims every node outside that category. */
const catFocus = shallowRef<Category | null>(null)

// The overlay cards collapse to icon buttons. They start open where there's
// room and closed on phone-sized screens (set in onMounted).
const controlsOpen = shallowRef(true)
const legendOpen = shallowRef(true)

function closeLegend(): void {
  legendOpen.value = false
  catFocus.value = null
}

/** Per node: passes the type and min-links filters. Non-reactive; see filterVersion. */
let shownFlag = new Uint8Array(0)
/** Bumped whenever shownFlag changes, so computeds that read it re-run. */
const filterVersion = shallowRef(0)

function recomputeShown(): void {
  const p = payload.value
  if (!p) return
  const hidden = new Set(hiddenCats.value)
  const min = minLinks.value
  shownFlag = new Uint8Array(p.nodes.length)
  for (const n of p.nodes) shownFlag[n.i] = !hidden.has(aliasCat(n.c)) && n.d >= min ? 1 : 0
  filterVersion.value++
}

/** Drawn, hit-testable and labelled: added by the build and not filtered out. */
function isLive(i: number): boolean {
  return activeFlag[i] === 1 && shownFlag[i] === 1
}

watch([hiddenCats, minLinks], () => {
  recomputeShown()
  if (pinned.value != null && !shownFlag[pinned.value]) setPin(null)
  fanDirty = true
  geomDirty = true
  kDirty = true
  focusDirty = true
  dirty = true
}, { deep: true })

function toggleCat(c: Category): void {
  const set = new Set(hiddenCats.value)
  if (set.has(c)) set.delete(c)
  else set.add(c)
  hiddenCats.value = [...set]
  if (set.has(c) && catFocus.value === c) catFocus.value = null
}

function showAll(): void {
  hiddenCats.value = []
  minLinks.value = 0
}

/** Upper end of the min-links slider: past ~30 only a few hubs survive. */
const minLinksMax = computed(() => {
  const p = payload.value
  if (!p) return 30
  let max = 0
  for (const n of p.nodes) if (n.d > max) max = n.d
  return Math.min(30, max)
})

const shownCount = computed(() => {
  void filterVersion.value
  let c = 0
  for (const f of shownFlag) c += f
  return c
})

const legend = computed(() => {
  const p = payload.value
  if (!p) return []
  const counts = new Map<Category, number>()
  for (const n of p.nodes) {
    const c = aliasCat(n.c)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  const hidden = new Set(hiddenCats.value)
  return CATEGORY_LEGEND_ORDER
    .filter(c => counts.has(c))
    .map(c => ({ c, cssVar: CATEGORY_COLOR_VAR[c], count: counts.get(c)!, hidden: hidden.has(c) }))
})

const filtersActive = computed(() => hiddenCats.value.length > 0 || minLinks.value > 0)

watch(catFocus, () => {
  focusDirty = true
  dirty = true
})

watch(labelsOn, () => {
  dirty = true
})

/* ---------------------------------------------------- pointer interaction -- */

// Dragging is maneuvering only: every pointer routes to the camera (pan,
// pinch, tap). Nodes can't be grabbed or repositioned.

/** The pinned node (see the header comment), or null. */
const pinned = shallowRef<number | null>(null)
/** Nodes pinned before the current one, for Back. */
const trail = shallowRef<number[]>([])
/** Pointer currently over a node — drives the cursor, even while pinned. */
const overNode = shallowRef(false)
/** Neighbour hovered in the panel's list — ringed on the map. */
const listHover = shallowRef<number | null>(null)

/** The camera should glide to the fan once the next pin is laid out. */
let flyPending = false
/** Pan the camera is gliding toward, or null. */
let fly: { x: number, y: number } | null = null

/**
 * Pin `i` (null closes). `walk` keeps the current pin on the Back trail —
 * used when moving from one pinned node to another through the panel or
 * search, as opposed to opening a fresh pin from the map.
 */
function setPin(i: number | null, walk = false): void {
  if (pinned.value === i) return
  if (i == null) trail.value = []
  else if (walk && pinned.value != null) trail.value = [...trail.value, pinned.value].slice(-40)
  else if (!walk) trail.value = []
  pinned.value = i
  listHover.value = null
  flyPending = i != null
  focusDirty = true
  dirty = true
}

function goBack(): void {
  const t = trail.value
  if (!t.length) return
  const prev = t[t.length - 1]!
  trail.value = t.slice(0, -1)
  pinned.value = prev
  listHover.value = null
  flyPending = true
  focusDirty = true
  dirty = true
}

function openNode(i: number): void {
  const p = payload.value
  if (p) emit('select', p.nodes[i]!)
}

function nodeTapped(i: number | null): void {
  if (pinned.value != null) {
    // While pinned, only the pinned node and its fanned neighbours are live
    // targets. Everything else — blank space or a blurred background node —
    // closes the pin; nothing can be hit through the backdrop.
    if (i != null && pinSet?.has(i)) openNode(i)
    else setPin(null)
    return
  }
  if (i != null) setPin(i)
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
  const src: any = simNodes ?? payload.value?.nodes
  return src ? pickDisplayed(src, sx, sy) : null
}

/** Pointer is over an overlay card — plain hover ends; a pin stays put. */
function clearNodeHover(): void {
  hoverPos = null
  focusDirty = true
  dirty = true
}

watch([camera.pan, camera.k], ([, k], [, prevK]) => {
  if (k !== prevK) {
    kDirty = true
    fly = null // a zoom mid-glide would aim the glide at the old scale
  }
  // The fan edges are drawn in screen space — repaint them with every pan
  // frame so they stay glued to their nodes mid-gesture, not just at the end.
  focusDirty = true
  dirty = true
})

watch(listHover, () => {
  kDirty = true
  dirty = true
})

const adjacency = computed(() => {
  const p = payload.value
  return p ? buildAdjacency(p.edges, p.nodes.length) : []
})

/* ----------------------------------------------------------------- search -- */

const query = shallowRef('')
const searchFocused = shallowRef(false)
const activeResult = shallowRef(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

const results = computed(() => {
  const p = payload.value
  return p ? searchNodes(p.nodes, query.value, 8) : []
})

watch(query, () => {
  activeResult.value = 0
})

/** Lift whichever filter is hiding `i`, so a search hit is always reachable. */
function reveal(i: number): void {
  const n = payload.value?.nodes[i]
  if (!n) return
  const c = aliasCat(n.c)
  if (hiddenCats.value.includes(c)) hiddenCats.value = hiddenCats.value.filter(h => h !== c)
  if (n.d < minLinks.value) minLinks.value = n.d
  recomputeShown() // now, not on the watcher's tick: the pin below needs it
}

function chooseResult(n: GraphNode): void {
  reveal(n.i)
  setPin(n.i, true)
  query.value = ''
  searchInputRef.value?.blur()
}

function onSearchKey(e: KeyboardEvent): void {
  const list = results.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (list.length) activeResult.value = (activeResult.value + 1) % list.length
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (list.length) activeResult.value = (activeResult.value - 1 + list.length) % list.length
  }
  else if (e.key === 'Enter') {
    const hit = list[activeResult.value]
    if (hit) chooseResult(hit)
  }
  else if (e.key === 'Escape') {
    e.stopPropagation()
    if (query.value) query.value = ''
    else searchInputRef.value?.blur()
  }
}

function onWindowKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === '/') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
  else if (e.key === 'Escape' && pinned.value != null) {
    setPin(null)
  }
  else if (e.key === 'Backspace' && trail.value.length) {
    goBack()
  }
}

/* ------------------------------------------------------------ pinned card -- */

const pinInfo = computed(() => {
  const p = payload.value
  const i = pinned.value
  void filterVersion.value
  if (!p || i == null) return null
  const node = p.nodes[i]!
  const groups = new Map<Category, GraphNode[]>()
  let total = 0
  for (const j of adjacency.value[i] ?? []) {
    if (!shownFlag[j]) continue
    const n = p.nodes[j]!
    const c = aliasCat(n.c)
    const list = groups.get(c)
    if (list) list.push(n)
    else groups.set(c, [n])
    total++
  }
  return {
    node,
    total,
    hiddenCount: (adjacency.value[i]?.length ?? 0) - total,
    groups: CATEGORY_LEGEND_ORDER
      .filter(c => groups.has(c))
      .map(c => ({
        c,
        cssVar: CATEGORY_COLOR_VAR[c],
        nodes: groups.get(c)!.sort((a, b) => (b.d - a.d) || a.l.localeCompare(b.l)),
      })),
  }
})

const backLabel = computed(() => {
  const t = trail.value
  const p = payload.value
  return p && t.length ? p.nodes[t[t.length - 1]!]!.l : ''
})

/* ------------------------------------------------------------- pixi scene -- */

// Deliberately untyped as `any`: pixi.js and d3-force types only exist
// client-side after the dynamic imports, and vue-tsc must not need them.
let PIXI: any = null
let app: any = null
let world: any = null
let glowLayer: any = null
let ringLayer: any = null
let nodeLayer: any = null
let titleLayer: any = null
/** Screen-space layer above the blurred world: holds the pinned fan, crisp. */
let pinLayer: any = null
let blurFilter: any = null
// The backdrop blur eases in on pin and out on unpin; the filter detaches
// once it fades to zero so the idle map pays no filter cost.
const BLUR_STRENGTH = 6
let blurCurrent = 0
let blurTarget = 0
let edgesG: any = null
let focusG: any = null
let sprites: any[] = []
let glows: any[] = []
let rings: any[] = []
let labels: (any | null)[] = []
let labelLayer: any = null
/** One title per category, floated over its cluster at overview zoom. */
let titles = new Map<Category, any>()
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
/** Dark theme: glows add light; on a light background they'd only muddy. */
let darkBg = false
let disposed = false
let builtFor: GraphPayload | null = null
let focus: number | null = null
/** Node indices by degree, highest first — the label priority. */
let labelOrder: number[] = []
const labelGrid = new LabelGrid(48)
/** Camera scale of the last whole-map fit; label thresholds are relative to it. */
let overviewK = 0

const GLOW_MUL = 3.4 // glow radius as a multiple of the node radius
const LABEL_MAX = 40 // resting labels truncate past this many characters
const PLATE_MAX = 44 // fan name plates truncate past this many characters

/** Clip a title to `max` characters with an ellipsis. */
function clip(l: string, max: number): string {
  return l.length > max ? `${l.slice(0, max - 1)}…` : l
}

/* ------------------------------------------------------------ hover spread -- */

// Display-only offsets that fan the pinned node's neighbours into evenly
// spaced rings so their labels stay legible. The d3 simulation never sees
// these: sprites, focus edges and picking add them on top of the true
// positions, and they lerp back to zero when the pin closes, so the physics
// layout returns exactly to where it was. The ring geometry itself lives in
// `fanLayout` (utils/graph), shared with the local map.
let offX = new Float64Array(0)
let offY = new Float64Array(0)
let tgtX = new Float64Array(0)
let tgtY = new Float64Array(0)
/** Spread slot bearing per node — its plate anchors radially outward along it. */
let spreadAng = new Float64Array(0)
/** Nodes with a non-zero offset or target — the only ones touched per frame. */
const spreadActive = new Set<number>()
let spreadSettled = true
/** True while the pinned fan-out is displayed (plates, spread offsets). */
let spreadMode = false
/** Camera scale the fan was last solved at (plates don't scale with zoom). */
let lastSpreadK = 1
/** Nodes lifted into the crisp pin layer (the pinned node + its fan). */
let pinMembers: number[] = []
/** Same members as a set — the only hover/click targets while pinned. */
let pinSet: Set<number> | null = null

/** HTML title panel for the focused node. */
const hoverPanelRef = ref<HTMLElement | null>(null)
const hoverMeta = computed(() => {
  const p = payload.value
  if (!p || hoverIndex.value == null) return null
  const n = p.nodes[hoverIndex.value]!
  return { l: n.l, c: aliasCat(n.c), cssVar: CATEGORY_COLOR_VAR[n.c], d: n.d }
})

/**
 * Name plates for the focus's neighbours. The list is reactive (rebuilt per
 * focus change); positions are imperative — the render loop writes each
 * plate's transform.
 */
const neighbourPlates = shallowRef<{ i: number, l: string, cssVar: string }[]>([])
const plateEls = new Map<number, HTMLElement>()
function setPlateRef(i: number) {
  return (el: unknown) => {
    if (el) plateEls.set(i, el as HTMLElement)
    else plateEls.delete(i)
  }
}

/** Nearest live node under a screen point, at its displayed (spread) position. */
function pickDisplayed(src: any[], sx: number, sy: number): number | null {
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  let best: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < src.length; i++) {
    if (!isLive(i)) continue
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

/** Send every active spread offset home; the lerp retracts the fan. */
function clearSpreadTargets(): void {
  for (const i of spreadActive) {
    tgtX[i] = 0
    tgtY[i] = 0
  }
  spreadSettled = false
}

/**
 * Compute each neighbour's spread target around the pinned node. Solved at
 * the live camera scale — plates don't scale with zoom, so the fan is
 * re-solved when k moves — and converted back into graph-unit offsets.
 * Returns the fan's footprint in `graph × k` units (screen = pan + that).
 */
function setSpreadTargets(src: any[]): Bounds | null {
  clearSpreadTargets()
  if (focus == null) return null
  const nbrs = activeNeighbours(focus)
  const k = camera.k.value
  const pn = payload.value!.nodes
  const f = src[focus]!

  const { members, bounds } = fanLayout(
    { x: f.x * k, y: f.y * k, r: nodeRadius(pn[focus]!.d), label: pn[focus]!.l },
    nbrs.map(i => ({ x: src[i]!.x * k, y: src[i]!.y * k, r: nodeRadius(pn[i]!.d), label: clip(pn[i]!.l, PLATE_MAX) })),
  )

  for (let j = 0; j < nbrs.length; j++) {
    const i = nbrs[j]!
    const m = members[j]!
    tgtX[i] = m.x / k - src[i]!.x
    tgtY[i] = m.y / k - src[i]!.y
    spreadAng[i] = m.ang
    spreadActive.add(i)
  }
  lastSpreadK = k
  return bounds
}

/** The node's live neighbours (built, and passing the filters). */
function activeNeighbours(i: number): number[] {
  return (adjacency.value[i] ?? []).filter(isLive)
}

/** Rebuild the neighbour-plate list for the current focus. */
function syncPlates(): void {
  const p = payload.value
  if (!p || focus == null) {
    neighbourPlates.value = []
    return
  }
  neighbourPlates.value = activeNeighbours(focus).map(j => ({ i: j, l: clip(p.nodes[j]!.l, PLATE_MAX), cssVar: CATEGORY_COLOR_VAR[p.nodes[j]!.c] }))
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

/**
 * Aim the camera glide so the fan sits in the open part of the screen: right
 * of the pinned panel on wide screens, above the bottom sheet on narrow ones.
 * A fan too big for that area is centred on the pinned node instead, so the
 * node itself never ends up off to one side. `fx`/`fy` and `b` are in
 * `graph × k` units.
 */
function aimFly(b: Bounds, fx: number, fy: number): void {
  const { w, h } = camera.size.value
  if (w <= 0 || h <= 0) return
  const wide = w >= 768
  const left = wide ? 352 : 0
  const top = 56
  const bottom = wide ? 0 : Math.min(h * 0.42, 340)
  const aw = w - left
  const ah = h - top - bottom
  const cx = left + aw / 2
  const cy = top + ah / 2
  const bx = b.maxX - b.minX > aw ? fx : (b.minX + b.maxX) / 2
  const by = b.maxY - b.minY > ah ? fy : (b.minY + b.maxY) / 2
  fly = { x: cx - bx, y: cy - by }
}

/* --------------------------------------------------------------- physics -- */

const CHARGE_RANGE = 350 // base px reach of node-node repulsion (see REPEL_RANGE)
const VELOCITY_DECAY = 0.55 // > d3's 0.4 default; damps the spring oscillation
const ALPHA_DECAY = 0.02
// The tail is a glide-out: through the cooling band the damping ramps from its
// running value toward a near-total stop, so the graph bleeds off its momentum
// and coasts to rest instead of freezing mid-drift.
const ALPHA_COOL = 0.07 // alpha at which the glide-out begins
const ALPHA_PARK = 0.005 // alpha at which the sim parks
const COOL_DECAY = 0.96 // velocity decay at the far end of the glide-out
const HUB_EXP = 0.75 // spring damping exponent by larger endpoint degree
// Intra-category links get a real strength floor; cross-category links keep
// only a fraction of it so the connective tissue can't drag clusters together.
const LINK_MIN = 0.18
const LINK_DIST = 350
const CROSS_CAT_DAMP = 0.45 // extra spring damping when a link crosses categories
const CLUSTER_PULL = 0.4 // strength of each node's pull toward its cluster target
// Keep-apart multiplier on the collision radius. Collision is the binding
// constraint at equilibrium, so this is what sets the packing density.
const SPACING = 4.5
const PACKING = 0.55 // assumed disc packing efficiency when sizing clusters
const RING_SHARE = 0.62 // anchor ring radius as a share of the packed-graph radius (floor)
const RING_SPREAD = 0.95 // ring circumference relative to the clusters' summed diameters
const FIT_PAD = 72 // px margin the auto-fit keeps around the layout (rim titles included)
// Per-node anchor scatter: every node gets a personal gravity target on its
// cluster's disc (deterministic hash of its index), so the interior settles as
// an organic cloud instead of concentric shells around one shared point.
const SCATTER = 0.85
const REPEL = 700
const REPEL_RANGE = CHARGE_RANGE * (0.5 + REPEL / 240) // ~1200 px

let d3: any = null
let sim: any = null

/* ------------------------------------------------------------ staged build -- */

// The graph doesn't appear all at once: nodes join the live simulation in
// per-frame batches, hubs first, popping in as they land. Grown incrementally
// from near-equilibrium seeds, the layout stays calm the whole way.
const BUILD_MS = 3200 // wall-clock target for the full grow-in
const FADE_MS = 520 // per-node pop-in once added
let building = false
let addOrder: number[] = []
let activeCursor = 0
let activeFlag = new Uint8Array(0)
let activeNodes: any[] = [] // the slice d3 currently simulates
let activeLinks: any[] = [] // links with both endpoints active
let incident: number[][] = [] // payload edge indices per node
let linkObjs: any[] = [] // one object per payload edge, registered as it completes
let fadeA = new Float32Array(0)
const fadingNodes = new Set<number>()

/** mulberry32: a small seeded PRNG, so every load grows in the same way. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function beginBuild(): void {
  if (!simNodes || !sim) return
  const n = simNodes.length
  activeFlag = new Uint8Array(n)
  fadeA = new Float32Array(n)
  activeNodes = []
  activeLinks = []
  fadingNodes.clear()
  activeCursor = 0
  // Hubs first, then everything else in a jittered order: the big stars light
  // up across every cluster, and their satellites fill in around them.
  const rand = seeded(0x2545F491)
  const key = simNodes.map(nd => Math.log1p(nd.d) + rand() * 0.9)
  addOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => key[b]! - key[a]!)
  sim.nodes(activeNodes)
  sim.force('link').links(activeLinks)
  sim.alpha(0.5)
  building = true
  // A pinned fan can't survive a rebuild — its neighbourhood is regrowing.
  setPin(null)
  kDirty = true
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
    fadeA[i] = 0
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
  kDirty = true
  if (activeCursor >= n) {
    building = false
    fanDirty = true
  }
}

/**
 * Auto-fit serves the initial settle (and Replay) only. Once the simulation
 * cools, or the user takes the camera, it latches off.
 */
let autoFit = true
// Same shape pickDisplayed expects (x, y, d) plus the category driving the
// cluster forces; d3-force adds vx/vy in place.
let simNodes: { i: number, x: number, y: number, d: number, c: Category }[] | null = null

interface Cluster {
  x: number
  y: number
  /** Radius the cluster's nodes need (for seeding). */
  r: number
}

let clusters = new Map<Category, Cluster>()

/**
 * Spread one anchor per category around an ellipse matching the container's
 * aspect ratio, sized from the area the nodes actually need, with angular room
 * proportional to √count so big categories aren't pinched by small ones.
 */
function computeClusters(p: GraphPayload): void {
  const areas = new Map<Category, number>()
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
  // Each cluster gets an arc of the ring proportional to its own radius, and
  // the ring is made long enough for those discs to sit side by side. Sized
  // from total area alone, the anchors sat so close that the clusters ran into
  // one undifferentiated blob.
  const radii = present.map(c => Math.sqrt(areas.get(c)! / PACKING))
  const sumR = radii.reduce((s, v) => s + v, 0)
  const ringR = Math.max(Math.sqrt(totalArea / PACKING) * RING_SHARE, (sumR / Math.PI) * RING_SPREAD)

  const { w, h } = camera.size.value
  const aspect = Math.min(1.9, Math.max(0.6, w > 0 && h > 0 ? w / h : 1.6))
  const sx = Math.sqrt(aspect)
  const sy = 1 / sx

  clusters = new Map()
  let acc = 0
  present.forEach((c, k) => {
    const mid = ((acc + radii[k]!) / (2 * sumR)) * Math.PI * 2 - Math.PI / 2
    acc += radii[k]! * 2
    clusters.set(c, {
      x: Math.cos(mid) * ringR * sx,
      y: Math.sin(mid) * ringR * sy,
      r: radii[k]!,
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
    const next = seeded(Math.imul(i + 1, 0x9E3779B9) ^ 0x6D2B79F5)
    const angle = next() * Math.PI * 2
    const rad = Math.sqrt(next()) // uniform over the disc
    scatX[i] = Math.cos(angle) * rad
    scatY[i] = Math.sin(angle) * rad
  }
}

/** Every node starts at its own scattered gravity target, near equilibrium. */
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
// so the keep-apart distance scales with the render radius to buy hubs screen
// room proportional to their size.
function collideRadius(n: { d: number }): number {
  return (nodeRadius(n.d) * 2.2 + 12) * SPACING
}

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
  // Spring strength damped by the larger endpoint degree, then floored (see
  // LINK_MIN). `a`/`b` keep the payload indices: d3 rewrites source/target to
  // node objects on registration, and the staged build needs the raw endpoints.
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
  // The sim starts EMPTY — the staged build grows its membership. The id
  // accessor resolves links by payload index, so registration is independent
  // of activation order.
  sim = d3.forceSimulation([])
    .force('charge', d3.forceManyBody().strength(-REPEL).theta(0.9).distanceMax(REPEL_RANGE))
    .force('link', d3.forceLink([]).id((nd: any) => nd.i).distance(LINK_DIST).strength((l: any) => l.s))
    .force('collide', d3.forceCollide().radius(collideRadius).strength(0.8).iterations(2))
    .force('cx', d3.forceX(anchorX).strength(CLUSTER_PULL))
    .force('cy', d3.forceY(anchorY).strength(CLUSTER_PULL))
    .velocityDecay(VELOCITY_DECAY)
    .alphaDecay(ALPHA_DECAY)
    .stop() // ticked manually from the render loop
  seedSimulation()
}

/** Re-anchor the clusters (container aspect changed) and push them into the forces. */
function reanchor(alpha: number): void {
  if (!sim || !payload.value) return
  computeClusters(payload.value)
  sim.force('cx').x(anchorX)
  sim.force('cy').y(anchorY)
  sim.alpha(Math.max(sim.alpha(), alpha))
  dirty = true
}

/**
 * Bounding box of the live nodes — or of every node, while none are live yet
 * (the first frame of the build), so the camera starts framed on the seeds.
 */
function currentBounds(): Bounds {
  const p = payload.value!
  const src: { x: number, y: number }[] = simNodes ?? p.nodes
  const box = (liveOnly: boolean): Bounds => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i < src.length; i++) {
      if (liveOnly && !isLive(i)) continue
      const n = src[i]!
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    return { minX, minY, maxX, maxY }
  }
  const live = box(true)
  if (Number.isFinite(live.minX)) return live
  const all = box(false)
  return Number.isFinite(all.minX) ? all : p.bounds
}

/** Fit the camera to everything currently shown. */
function fitAll(): void {
  if (!payload.value) return
  fly = null
  camera.fitTo(currentBounds(), FIT_PAD)
  overviewK = camera.k.value
}

/**
 * Settle synchronously and show the result at once (reduced motion). The
 * whole graph is registered and relaxed in ~150 ticks from near-equilibrium
 * seeds, then the simulation is parked.
 */
const STATIC_TICKS = 150
function settleStatic(): void {
  if (!sim || !simNodes) return
  building = false
  fadingNodes.clear()
  const n = simNodes.length
  activeFlag = new Uint8Array(n).fill(1)
  fadeA = new Float32Array(n).fill(1)
  activeNodes = simNodes.slice()
  activeLinks = linkObjs.slice()
  sim.nodes(activeNodes)
  sim.force('link').links(activeLinks)
  sim.velocityDecay(VELOCITY_DECAY)
  sim.alpha(0.5)
  for (let t = 0; t < STATIC_TICKS && sim.alpha() > 0.025; t++) sim.tick()
  sim.alpha(0) // parked
  geomDirty = true
  kDirty = true
  focusDirty = true
  dirty = true
}

/** Replay: re-seed and grow the map in again from nothing. */
function replay(): void {
  if (!payload.value || !sim) return
  setPin(null)
  reanchor(0)
  seedSimulation()
  if (reducedMotion) settleStatic()
  else beginBuild()
  autoFit = true
  fitAll()
  geomDirty = true
  focusDirty = true
  dirty = true
}

/* ------------------------------------------------------------------ init -- */

async function initPixi(): Promise<void> {
  const el = containerRef.value
  if (!el) return
  ;[PIXI, d3] = await Promise.all([import('pixi.js'), import('d3-force')])
  if (disposed) return

  // Local until init resolves: destroy() on a half-initialized Application
  // throws from its plugins, so onBeforeUnmount must never see one in `app`.
  const application = new PIXI.Application()
  await application.init({
    resizeTo: el,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    backgroundAlpha: 0, // the container's background (and grid) shows through
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
  // in Pixi, and a glyph atlas is cheap to leave cached for the next visit.
  if (!PIXI.Cache.has('MapLab-bitmap')) {
    PIXI.BitmapFont.install({
      name: 'MapLab',
      style: { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: 32, fill: 0xffffff },
    })
  }
  if (!PIXI.Cache.has('MapLabTitle-bitmap')) {
    PIXI.BitmapFont.install({
      name: 'MapLabTitle',
      style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 32, fontWeight: '700', fill: 0xffffff },
    })
  }

  app.ticker.add(update)
  buildSceneIfReady()
}

/** A soft radial falloff, white, for the per-node glow sprites. */
function makeGlowTexture(): any {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return PIXI.Texture.from(c)
}

function buildSceneIfReady(): void {
  const p = payload.value
  if (!p || !app || !PIXI || builtFor === p) return
  builtFor = p

  world?.destroy({ children: true })
  world = new PIXI.Container()
  app.stage.addChild(world)

  // Edges: one Graphics holding every segment, drawn white and tinted.
  // pixelLine keeps the stroke 1 device px at every zoom.
  edgesG = new PIXI.Graphics()
  world.addChild(edgesG)

  const template = new PIXI.Graphics().circle(0, 0, 64).fill(0xffffff)
  const circleTex = app.renderer.generateTexture({ target: template, antialias: true })
  template.destroy()
  const glowTex = makeGlowTexture()

  glowLayer = new PIXI.Container()
  ringLayer = new PIXI.Container()
  nodeLayer = new PIXI.Container()
  labelLayer = new PIXI.Container()
  titleLayer = new PIXI.Container()
  world.addChild(glowLayer, ringLayer, nodeLayer, labelLayer, titleLayer)

  const n = p.nodes.length
  sprites = new Array(n)
  glows = new Array(n)
  rings = new Array(n)
  labels = new Array(n).fill(null)
  offX = new Float64Array(n)
  offY = new Float64Array(n)
  tgtX = new Float64Array(n)
  tgtY = new Float64Array(n)
  spreadAng = new Float64Array(n)
  spreadActive.clear()
  spreadSettled = true
  focus = null
  neighbourPlates.value = []
  for (let i = 0; i < n; i++) {
    const nd = p.nodes[i]!
    const glow = new PIXI.Sprite(glowTex)
    glow.anchor.set(0.5)
    glow.position.set(nd.x, nd.y)
    glow.visible = false
    glowLayer.addChild(glow)
    glows[i] = glow

    // The ring exists only as the focus halo — hidden until focused.
    const ring = new PIXI.Sprite(circleTex)
    ring.anchor.set(0.5)
    ring.position.set(nd.x, nd.y)
    ring.visible = false
    ringLayer.addChild(ring)
    rings[i] = ring

    const s = new PIXI.Sprite(circleTex)
    s.anchor.set(0.5)
    s.position.set(nd.x, nd.y)
    s.visible = false
    nodeLayer.addChild(s)
    sprites[i] = s
  }
  labelOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => p.nodes[b]!.d - p.nodes[a]!.d)

  titles = new Map()
  for (const c of CATEGORY_LEGEND_ORDER) {
    const t = new PIXI.BitmapText({ text: c.toUpperCase(), style: { fontFamily: 'MapLabTitle', fontSize: 13, letterSpacing: 2.5 } })
    t.anchor.set(0.5, 1)
    t.visible = false
    titleLayer.addChild(t)
    titles.set(c, t)
  }

  // Focus edges live in screen space on the stage, rebuilt per focus change —
  // BELOW `world` while hovering so nodes paint above them; raised above the
  // blurred world while a pin is open (see the mode switch in update()).
  focusG?.destroy()
  focusG = new PIXI.Graphics()
  app.stage.addChildAt(focusG, 0)

  // The pin layer mirrors the world's transform and sits above it, outside
  // the blur, so the pinned fan stays crisp over the blurred field.
  pinLayer?.destroy()
  pinLayer = new PIXI.Container()
  app.stage.addChild(pinLayer)
  pinMembers = []
  pinSet = null
  blurFilter ??= new PIXI.BlurFilter({ strength: 0, quality: 4 })

  recomputeShown()
  computeClusters(p)
  buildSimulation(p)
  applyPalette()
  if (reducedMotion) settleStatic()
  else beginBuild()
  autoFit = true
  fitAll()
  kDirty = true
  focusDirty = true
  geomDirty = true
  dirty = true
  ready.value = true
  emit('ready')
}

function applyPalette(): void {
  if (!edgesG) return
  const p = payload.value
  if (p && catColors) nodeTint = p.nodes.map(n => catColors![n.c])
  edgesG.tint = palette.edge
  for (const t of labels) if (t) t.tint = palette.foreground
  if (catColors) for (const [c, t] of titles) t.tint = catColors[c]
  const bg = Number.parseInt(palette.background.slice(1, 7), 16)
  const lum = (0.299 * ((bg >> 16) & 255) + 0.587 * ((bg >> 8) & 255) + 0.114 * (bg & 255)) / 255
  darkBg = lum < 0.5
  for (const g of glows) g.blendMode = darkBg ? 'add' : 'normal'
  // Sprite, glow and ring tints are owned by the focus/zoom pass in update().
  kDirty = true
  focusDirty = true
  dirty = true
}

function labelFor(i: number): any {
  let t = labels[i]
  if (t) return t
  const l = payload.value!.nodes[i]!.l
  t = new PIXI.BitmapText({
    text: clip(l, LABEL_MAX),
    style: { fontFamily: 'MapLab', fontSize: 11 },
  })
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
    if (!isLive(a) || !isLive(b)) continue
    const na = src[a]
    const nb = src[b]
    if (!na || !nb) continue
    edgesG.moveTo(na.x, na.y).lineTo(nb.x, nb.y)
  }
  edgesG.stroke({ width: 1, color: 0xffffff, alpha: 1, pixelLine: true })
  edgesG.tint = palette.edge
}

/** Ease-out with a small overshoot: the pop as a node lands. */
function popEase(t: number): number {
  const c = 1.9
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

/** Move a node's glow, ring and disc into `layer` (glow under ring under disc). */
function lift(i: number, into: 'pin' | 'world'): void {
  if (into === 'pin') {
    pinLayer.addChildAt(glows[i]!, 0)
    pinLayer.addChild(rings[i]!)
    pinLayer.addChild(sprites[i]!)
  }
  else {
    glowLayer.addChild(glows[i]!)
    ringLayer.addChild(rings[i]!)
    nodeLayer.addChild(sprites[i]!)
  }
}

/** One pass per frame while anything is dirty, animating or the simulation is hot. */
function update(ticker?: any): void {
  const p = payload.value
  if (!p || !world) return
  const dt = ticker?.deltaTime ?? 1
  const dms = ticker?.deltaMS ?? 16.7
  const now = performance.now()

  if (building && sim) stepBuild(dms)

  const hot = sim && sim.alpha() > ALPHA_PARK
  if (hot) {
    // Damping is re-derived from alpha every tick, so a reheat lifts alpha
    // back out of the cooling band and gets the running decay again.
    const a = sim.alpha()
    const t = a >= ALPHA_COOL ? 0 : (ALPHA_COOL - a) / (ALPHA_COOL - ALPHA_PARK)
    sim.velocityDecay(VELOCITY_DECAY + (COOL_DECAY - VELOCITY_DECAY) * t * t)
    sim.tick()
    geomDirty = true
    dirty = true
    // Keep the settling layout in frame, gliding rather than snapping (the
    // staged build grows the bounds in steps).
    if (autoFit && !camera.userAdjusted.value) {
      camera.fitTo(currentBounds(), FIT_PAD, 1 - 0.92 ** dt)
      overviewK = camera.k.value
    }
  }
  else {
    autoFit = false
    if (sim && sim.alpha() > 0) {
      sim.alpha(0)
      sim.velocityDecay(VELOCITY_DECAY)
    }
  }

  // Camera glide toward a freshly pinned fan. Grabbing the map cancels it.
  if (fly) {
    if (camera.grabbing.value) {
      fly = null
    }
    else {
      const cur = camera.pan.value
      const e = 1 - 0.86 ** dt
      const nx = cur.x + (fly.x - cur.x) * e
      const ny = cur.y + (fly.y - cur.y) * e
      if (Math.abs(fly.x - nx) < 0.5 && Math.abs(fly.y - ny) < 0.5) {
        camera.pan.value = fly
        fly = null
      }
      else {
        camera.pan.value = { x: nx, y: ny }
      }
    }
  }

  const pulsing = spreadMode && !reducedMotion
  const animating = (spreadActive.size > 0 && !spreadSettled) || fadingNodes.size > 0 || building
    || blurCurrent !== blurTarget || fly != null || pulsing
  if (animating) dirty = true
  if (!dirty) return
  dirty = false

  const src: any[] = (simNodes as any[]) ?? (p.nodes as any[])
  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value
  world.position.set(px, py)
  world.scale.set(k)
  pinLayer.position.set(px, py)
  pinLayer.scale.set(k)

  // Parallax dot grid behind the canvas, glued to the camera.
  const el = containerRef.value
  if (el) {
    const step = gridStep(k)
    el.style.backgroundSize = `${step}px ${step}px`
    el.style.backgroundPosition = `${px}px ${py}px`
  }

  {
    // The pin owns the focus while set; plain hover otherwise. While pinned,
    // only the fan's members are hover/click targets.
    const hoverHit = hoverPos ? pickDisplayed(src, hoverPos.x, hoverPos.y) : null
    overNode.value = hoverHit != null && (pinSet == null || pinSet.has(hoverHit))
    const next = pinned.value ?? hoverHit
    const mode = pinned.value != null
    if (next !== focus || mode !== spreadMode || (fanDirty && mode)) {
      fanDirty = false
      focus = next
      spreadMode = mode
      focusDirty = true
      kDirty = true
      // Hand the previous fan's members back to the world, then lift the new
      // ones into the crisp layer and blur the world underneath them.
      for (const i of pinMembers) lift(i, 'world')
      let fanBounds: Bounds | null = null
      if (spreadMode && focus != null) {
        pinMembers = [focus, ...activeNeighbours(focus)]
        pinSet = new Set(pinMembers)
        for (const i of pinMembers) lift(i, 'pin')
        // No filterArea: Pixi sizes the pass from the world's bounds clipped
        // to the screen (filterArea is LOCAL-space in v8).
        if (!world.filters) world.filters = [blurFilter]
        blurTarget = BLUR_STRENGTH
        app.stage.setChildIndex(focusG, 1) // fan edges above the blurred field
        fanBounds = setSpreadTargets(src)
      }
      else {
        pinMembers = []
        pinSet = null
        blurTarget = 0
        app.stage.setChildIndex(focusG, 0) // hover edges back under the nodes
        clearSpreadTargets()
      }
      if (flyPending && fanBounds && focus != null) aimFly(fanBounds, src[focus]!.x * k, src[focus]!.y * k)
      flyPending = false
      syncPlates()
    }
    else if (spreadMode && focus != null && Math.abs(k / lastSpreadK - 1) > 0.15) {
      // Plates and radii are screen px — a significant zoom re-solves the fan.
      setSpreadTargets(src)
    }
  }
  hoverIndex.value = focus

  const neighbours = focus != null ? new Set(adjacency.value[focus] ?? []) : null
  const catDim = focus == null ? catFocus.value : null

  if (geomDirty) {
    geomDirty = false
    for (let i = 0; i < src.length; i++) {
      const x = src[i]!.x
      const y = src[i]!.y
      sprites[i]!.position.set(x, y)
      glows[i]!.position.set(x, y)
      rings[i]!.position.set(x, y)
    }
    rebuildEdges(src)
  }

  // Spread offsets ride on top of the true positions. Applied after the
  // geomDirty pass so a hot sim doesn't stomp them.
  if (spreadActive.size) {
    if (!spreadSettled) stepSpread(dt)
    for (const i of spreadActive) {
      const x = src[i]!.x + offX[i]!
      const y = src[i]!.y + offY[i]!
      sprites[i]!.position.set(x, y)
      glows[i]!.position.set(x, y)
      rings[i]!.position.set(x, y)
      if (offX[i] === 0 && offY[i] === 0 && tgtX[i] === 0 && tgtY[i] === 0) spreadActive.delete(i)
    }
  }

  // Counter-scale so nodes hold their screen-px radius at any zoom.
  const glowBase = darkBg ? 0.34 : 0.2
  if (kDirty || focusDirty) {
    kDirty = false
    const dimmed = focus != null || catDim != null
    for (let i = 0; i < p.nodes.length; i++) {
      const s = sprites[i]!
      const glow = glows[i]!
      const ring = rings[i]!
      const live = isLive(i)
      s.visible = live
      glow.visible = live
      if (!live) {
        ring.visible = false
        continue
      }
      const n = p.nodes[i]!
      const lit = focus != null
        ? (i === focus || neighbours!.has(i))
        : catDim != null && aliasCat(n.c) === catDim
      const r = nodeRadius(n.d) + (i === focus ? 3 : 0)
      const tint = nodeTint[i] ?? palette.node
      s.scale.set((r * 2) / 128 / k)
      s.alpha = dimmed && !lit ? 0.22 : 1
      s.tint = tint
      glow.scale.set((r * GLOW_MUL * 2) / 128 / k)
      glow.alpha = dimmed && !lit ? glowBase * 0.15 : glowBase * (i === focus ? 2 : 1)
      glow.tint = tint
      // Rings render only as halos: the focus, and a neighbour hovered in the panel.
      const halo = i === focus || i === listHover.value
      ring.visible = halo
      if (halo) {
        ring.scale.set(((r + 2) * 2) / 128 / k)
        ring.alpha = 1
        ring.tint = palette.primary
      }
    }
  }

  // Backdrop blur ease, detaching the filter once it lands back at zero.
  if (blurCurrent !== blurTarget) {
    const ease = 1 - 0.85 ** dt
    blurCurrent += (blurTarget - blurCurrent) * ease
    if (Math.abs(blurCurrent - blurTarget) < 0.05) blurCurrent = blurTarget
    blurFilter.strength = blurCurrent
    if (blurCurrent === 0 && blurTarget === 0 && world.filters) world.filters = null
  }

  // Pop-ins override the alpha and scale the pass above assigned.
  if (fadingNodes.size) {
    for (const i of fadingNodes) {
      const f = Math.min(1, fadeA[i]! + dms / FADE_MS)
      fadeA[i] = f
      if (f >= 1) {
        fadingNodes.delete(i)
        kDirty = true // restore the resting scale/alpha next frame
        dirty = true
        continue
      }
      const r = nodeRadius(p.nodes[i]!.d)
      const pop = Math.max(0.001, popEase(f))
      sprites[i]!.alpha = Math.min(1, f * 2)
      sprites[i]!.scale.set((r * 2 * pop) / 128 / k)
      // The glow flares as the node lands, then settles to its resting level.
      glows[i]!.alpha = glowBase * (1 + 2.2 * (1 - f)) * Math.min(1, f * 3)
      glows[i]!.scale.set((r * GLOW_MUL * 2 * (0.6 + 0.8 * f)) / 128 / k)
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
      const nbrs = activeNeighbours(focus)
      // Sonar: two rings expanding out of the pinned node.
      if (pulsing) {
        const r0 = nodeRadius(p.nodes[focus]!.d) + 5
        for (let s = 0; s < 2; s++) {
          const ph = ((now / 2200) + s * 0.5) % 1
          focusG.circle(fx, fy, r0 + ph * 70).stroke({ width: 1.5, color: palette.primary, alpha: 0.55 * (1 - ph) })
        }
      }
      for (const j of nbrs) {
        const nj = src[j]!
        focusG.moveTo(fx, fy).lineTo(px + (nj.x + offX[j]!) * k, py + (nj.y + offY[j]!) * k)
      }
      focusG.stroke({ width: 1.6, color: palette.primary, alpha: spreadMode ? 0.7 : 0.9 })
      // Pulses running out along each link, in the neighbour's colour.
      if (pulsing) {
        for (let q = 0; q < nbrs.length; q++) {
          const j = nbrs[q]!
          const nj = src[j]!
          const ph = ((now / 1600) + q * 0.618) % 1
          const tx = px + (nj.x + offX[j]!) * k
          const ty = py + (nj.y + offY[j]!) * k
          focusG.circle(fx + (tx - fx) * ph, fy + (ty - fy) * ph, 2.4)
            .fill({ color: nodeTint[j] ?? palette.primary, alpha: Math.sin(ph * Math.PI) })
        }
      }
    }
    edgesG.alpha = focus != null || catDim != null ? 0.07 : 0.16
  }

  // Resting labels: hubs first, culled by collision and by a per-degree zoom
  // threshold relative to the overview fit. The focus neighbourhood uses the
  // HTML plates instead.
  const { w, h } = camera.size.value
  const rel = overviewK > 0 ? k / overviewK : 1
  labelGrid.clear()
  labelLayer.alpha = focus != null || catDim != null ? 0.3 : 1

  // Category titles on the map's rim, out past each cluster, fading as you
  // zoom in. Inside the clusters they'd fight the node labels.
  const titleAlpha = Math.max(0, Math.min(1, (3 - rel) / 1.4))
  if (titleAlpha > 0 && labelsOn.value) {
    let gx = 0
    let gy = 0
    let total = 0
    const acc = new Map<Category, { x: number, y: number, ids: number[] }>()
    for (let i = 0; i < src.length; i++) {
      if (!isLive(i)) continue
      gx += src[i]!.x
      gy += src[i]!.y
      total++
      const c = aliasCat(p.nodes[i]!.c)
      const e = acc.get(c)
      if (e) {
        e.x += src[i]!.x
        e.y += src[i]!.y
        e.ids.push(i)
      }
      else {
        acc.set(c, { x: src[i]!.x, y: src[i]!.y, ids: [i] })
      }
    }
    gx /= total || 1
    gy /= total || 1
    for (const [c, t] of titles) {
      const e = acc.get(c)
      if (!e || e.ids.length < 3) {
        t.visible = false
        continue
      }
      // Direction from the map's centre through the cluster's centroid; the
      // title sits just beyond the cluster's 90th-percentile reach along it.
      let dx = e.x / e.ids.length - gx
      let dy = e.y / e.ids.length - gy
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      const reach = e.ids.map(i => (src[i]!.x - gx) * dx + (src[i]!.y - gy) * dy).sort((a, b) => a - b)
      const r = reach[Math.floor(reach.length * 0.9)]! + 36 / k
      const tx = gx + dx * r
      const ty = gy + dy * r
      t.visible = true
      t.alpha = titleAlpha * 0.9
      t.scale.set(1 / k)
      t.anchor.set(0.5 - dx * 0.5, 0.5 - dy * 0.5)
      t.position.set(tx, ty)
      const sx = px + tx * k
      const sy = py + ty * k
      const tw = c.length * 10.5
      if (titleAlpha > 0.3) labelGrid.tryPlace(sx - tw, sy - 12, sx + tw, sy + 12)
    }
  }
  else {
    for (const t of titles.values()) t.visible = false
  }

  const margin = 60
  for (const i of labelOrder) {
    const existing = labels[i]
    const n = p.nodes[i]!
    const focusish = focus != null && (i === focus || neighbours!.has(i))
    if (!labelsOn.value || focusish || !isLive(i) || rel < labelMinZoom(n.d)) {
      if (existing) existing.visible = false
      continue
    }
    const nx = src[i]!.x + offX[i]!
    const ny = src[i]!.y + offY[i]!
    const sx = px + nx * k
    const sy = py + ny * k
    if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
      if (existing) existing.visible = false
      continue
    }
    const r = nodeRadius(n.d)
    const half = (Math.min(n.l.length, LABEL_MAX) * 5.9 + 4) / 2
    const top = sy + r + 2
    if (!labelGrid.tryPlace(sx - half, top, sx + half, top + 14)) {
      if (existing) existing.visible = false
      continue
    }
    const t = labelFor(i)
    t.visible = true
    t.alpha = fadingNodes.has(i) ? fadeA[i]! : 1
    t.scale.set(1 / k)
    t.position.set(nx, ny + (r + 2) / k)
  }

  // The HTML title panel tracks the focused node's screen position.
  const panel = hoverPanelRef.value
  if (panel && focus != null) {
    const nf = src[focus]!
    const pr = nodeRadius(p.nodes[focus]!.d) + 3
    panel.style.transform = `translate(${px + nf.x * k}px, ${py + nf.y * k + pr + 7}px) translateX(-50%)`
  }

  // Neighbour plates: while pinned they track their fanned positions,
  // anchored to extend radially outward along the spread bearing (the CSS
  // %-translate is the Pixi anchor trick). On plain hover the same plates sit
  // centred under their nodes' true positions.
  if (focus != null) {
    for (const { i } of neighbourPlates.value) {
      const el = plateEls.get(i)
      if (!el) continue
      const r = nodeRadius(p.nodes[i]!.d)
      if (spreadMode) {
        const ca = Math.cos(spreadAng[i]!)
        const sa = Math.sin(spreadAng[i]!)
        const sx = px + (src[i]!.x + offX[i]!) * k + ca * (r + 5)
        const sy = py + (src[i]!.y + offY[i]!) * k + sa * (r + 5)
        el.style.transform = `translate(${sx}px, ${sy}px) translate(${ca * 50 - 50}%, ${sa * 50 - 50}%)`
      }
      else {
        const sx = px + (src[i]!.x + offX[i]!) * k
        const sy = py + (src[i]!.y + offY[i]!) * k + r + 4
        el.style.transform = `translate(${sx}px, ${sy}px) translateX(-50%)`
      }
      el.style.opacity = '1'
    }
  }
}

/* -------------------------------------------------------------- lifecycle -- */

watch(payload, () => buildSceneIfReady())

// The camera's ResizeObserver reassigns size as a fresh object every callback,
// so compare dimensions before reacting. Once the settle completes or the user
// takes the camera, a resize changes nothing: re-anchoring then would drag the
// layout out from under the settled view.
let lastW = 0
let lastH = 0
watch(() => camera.size.value, ({ w, h }) => {
  if (w === lastW && h === lastH) return
  lastW = w
  lastH = h
  if (payload.value && w > 0 && h > 0 && !camera.userAdjusted.value && autoFit) {
    if (sim) reanchor(0.3) // anchors follow the new aspect
    fitAll()
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
  reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  palette = readGraphPalette()
  catColors = readCategoryColors()
  window.addEventListener('keydown', onWindowKey)
  initPixi()
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('keydown', onWindowKey)
  sim?.stop()
  sim = null
  if (app) {
    app.ticker?.remove(update)
    // Textures are NOT destroyed here: the glyph atlases belong to the cached
    // bitmap fonts, which outlive this component (see install above).
    app.destroy(true, { children: true })
    app = null
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full w-full overflow-hidden bg-background"
    :style="{
      cursor: camera.grabbing.value ? 'grabbing' : overNode ? 'pointer' : 'grab',
      touchAction: 'none',
      backgroundImage: 'radial-gradient(circle, hsl(var(--foreground) / 0.11) 1px, transparent 1.4px)',
    }"
    role="application"
    aria-label="Site map: every page in the knowledge base and how they link"
    @pointerdown="camera.handlers.onPointerDown"
    @pointermove="camera.handlers.onPointerMove"
    @pointerup="camera.handlers.onPointerUp"
    @pointercancel="camera.handlers.onPointerUp"
    @pointerleave="camera.handlers.onPointerLeave"
    @wheel.prevent="camera.handlers.onWheel"
  >
    <!-- Vignette: the field fades into the page at the edges. -->
    <div
      class="pointer-events-none absolute inset-0 z-[1]"
      style="background: radial-gradient(ellipse at center, transparent 55%, hsl(var(--background) / 0.75) 100%)"
    />

    <!-- Name plates for the focus's neighbours, positioned imperatively from
         the render loop. They start transparent so a freshly mounted plate
         never flashes at the origin before its first transform lands. -->
    <div
      v-for="plate in neighbourPlates"
      :key="plate.i"
      :ref="setPlateRef(plate.i)"
      class="pointer-events-none absolute left-0 top-0 z-10 flex select-none items-center gap-1.5 whitespace-nowrap rounded-md border border-border/50 bg-background/60 px-2 py-0.5 backdrop-blur-xl"
      style="will-change: transform; opacity: 0"
    >
      <span class="size-1.5 shrink-0 rounded-full" :style="{ background: `hsl(var(${plate.cssVar}))` }" />
      <span class="font-sans text-[11px] text-foreground">{{ plate.l }}</span>
    </div>

    <!-- Focused node's title, positioned imperatively from the render loop. -->
    <div
      v-show="hoverIndex != null"
      ref="hoverPanelRef"
      class="pointer-events-none absolute left-0 top-0 z-10 select-none whitespace-nowrap rounded-lg border border-border/50 bg-background/70 px-2.5 py-1 text-center backdrop-blur-xl"
      style="will-change: transform"
    >
      <div class="font-sans text-xs font-medium text-foreground">
        {{ hoverMeta?.l }}
      </div>
      <!-- Hover only: the pinned fan is solved around a one-line panel, and
           the pinned card already says all this. -->
      <div v-if="hoverMeta && pinned == null" class="mt-px flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <span class="size-1.5 rounded-full" :style="{ background: `hsl(var(${hoverMeta.cssVar}))` }" />
        {{ hoverMeta.c }} · {{ hoverMeta.d }} {{ hoverMeta.d === 1 ? 'link' : 'links' }}
      </div>
    </div>

    <!-- Search, top left. -->
    <div
      v-if="ready"
      class="absolute left-4 top-4 z-20 w-[min(20rem,calc(100%-5.5rem))]"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointerenter="clearNodeHover"
      @wheel.stop
    >
      <div class="flex items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-2.5 backdrop-blur-xl focus-within:border-primary/60">
        <Search :size="14" class="shrink-0 text-muted-foreground" />
        <input
          ref="searchInputRef"
          v-model="query"
          type="search"
          placeholder="Find a page on the map"
          aria-label="Find a page on the map"
          class="h-9 min-w-0 flex-1 bg-transparent font-sans text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          @keydown="onSearchKey"
          @focus="searchFocused = true"
          @blur="searchFocused = false"
        >
        <kbd
          v-if="!query && !searchFocused"
          class="hidden rounded border border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground sm:inline"
        >/</kbd>
      </div>
      <ul
        v-if="query && searchFocused"
        class="mt-1.5 overflow-hidden rounded-lg border border-border/50 bg-background/85 py-1 backdrop-blur-xl"
      >
        <li
          v-for="(n, idx) in results"
          :key="n.i"
        >
          <button
            type="button"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-sans text-[13px]"
            :class="idx === activeResult ? 'bg-accent text-foreground' : 'text-foreground/90'"
            @mousedown.prevent="chooseResult(n)"
            @mouseenter="activeResult = idx"
          >
            <span class="size-2 shrink-0 rounded-full" :style="{ background: `hsl(var(${CATEGORY_COLOR_VAR[n.c]}))` }" />
            <span class="min-w-0 flex-1 truncate">{{ n.l }}</span>
            <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{{ n.d }}</span>
          </button>
        </li>
        <li v-if="!results.length" class="px-2.5 py-1.5 font-sans text-[13px] text-muted-foreground">
          No page by that name.
        </li>
      </ul>
    </div>

    <!-- Pinned node card: bottom-left on wide screens, a bottom sheet on phones. -->
    <div
      v-if="pinInfo"
      class="absolute inset-x-3 bottom-3 z-20 flex max-h-[42%] flex-col rounded-xl border border-border/50 bg-background/75 shadow-lg backdrop-blur-xl md:inset-x-auto md:bottom-4 md:left-4 md:top-[4.5rem] md:max-h-none md:w-80"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointerenter="clearNodeHover"
      @pointerleave="listHover = null"
      @wheel.stop
    >
      <div class="shrink-0 border-b border-border/50 p-3">
        <div class="flex items-center gap-1">
          <button
            v-if="trail.length"
            type="button"
            :title="`Back to ${backLabel}`"
            class="-ml-1 inline-flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="goBack"
          >
            <ArrowLeft :size="12" class="shrink-0" />
            <span class="truncate normal-case tracking-normal">{{ backLabel }}</span>
          </button>
          <span
            v-else
            class="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            <span class="size-2 rounded-full" :style="{ background: `hsl(var(${CATEGORY_COLOR_VAR[pinInfo.node.c]}))` }" />
            {{ aliasCat(pinInfo.node.c) }}
          </span>
          <button
            type="button"
            aria-label="Close"
            class="-mr-1 ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="setPin(null)"
          >
            <X :size="13" />
          </button>
        </div>
        <h2 class="mt-1.5 font-sans text-base font-semibold leading-snug text-foreground">
          {{ pinInfo.node.l }}
        </h2>
        <p class="mt-0.5 font-sans text-xs text-muted-foreground">
          Linked to {{ pinInfo.total }} {{ pinInfo.total === 1 ? 'page' : 'pages' }}<template v-if="pinInfo.hiddenCount">
            ({{ pinInfo.hiddenCount }} more hidden by filters)
          </template>
        </p>
        <button
          type="button"
          class="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 font-sans text-[13px] font-medium text-primary-foreground transition-opacity duration-fast ease-standard hover:opacity-90"
          @click="openNode(pinInfo.node.i)"
        >
          Open page
          <ArrowUpRight :size="14" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        <p v-if="!pinInfo.groups.length" class="px-1 py-2 font-sans text-xs text-muted-foreground">
          Nothing on the map links here.
        </p>
        <section v-for="g in pinInfo.groups" :key="g.c" class="mb-2 last:mb-0">
          <h3 class="flex items-center gap-1.5 px-1 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <span class="size-2 rounded-full" :style="{ background: `hsl(var(${g.cssVar}))` }" />
            {{ g.c }}
            <span class="ml-auto tabular-nums">{{ g.nodes.length }}</span>
          </h3>
          <ul>
            <li v-for="n in g.nodes" :key="n.i">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left font-sans text-[13px] text-foreground/90 transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
                :title="`Centre the map on ${n.l}`"
                @click="setPin(n.i, true)"
                @pointerenter="listHover = n.i"
              >
                <span class="min-w-0 flex-1 truncate">{{ n.l }}</span>
                <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{{ n.d }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- Overlay stack, top right: the key above the view controls. Each card
         collapses to an icon button. Hidden while a node is pinned, so the fan
         has the screen. -->
    <div
      v-if="ready && pinned == null"
      class="absolute right-4 top-4 z-20 flex max-h-[calc(100%-2rem)] select-none flex-col items-end gap-2 overflow-y-auto overscroll-contain"
      @pointerdown.stop
      @pointermove.stop
      @pointerup.stop
      @pointerenter="clearNodeHover"
      @wheel.stop
    >
      <!-- Key: click a type to hide or show it; hover to spotlight it. -->
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
            Page types
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
          <li v-for="entry in legend" :key="entry.c">
            <button
              type="button"
              role="switch"
              :aria-checked="!entry.hidden"
              :title="entry.hidden ? `Show ${entry.c}` : `Hide ${entry.c}`"
              class="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left font-mono text-[11px] leading-4 transition-colors duration-fast ease-standard hover:bg-accent/60"
              :class="entry.hidden ? 'opacity-45' : ''"
              @click="toggleCat(entry.c)"
              @pointerenter="catFocus = entry.hidden ? null : entry.c"
            >
              <span
                class="size-2.5 shrink-0 rounded-full border-2"
                :style="{
                  borderColor: `hsl(var(${entry.cssVar}))`,
                  background: entry.hidden ? 'transparent' : `hsl(var(${entry.cssVar}))`,
                }"
              />
              <span class="uppercase tracking-[0.08em] text-muted-foreground" :class="entry.hidden ? 'line-through' : ''">{{ entry.c }}</span>
              <span class="ml-auto pl-4 text-right font-semibold tabular-nums text-foreground">{{ entry.count }}</span>
            </button>
          </li>
        </ul>
        <div class="mt-1.5 flex items-center justify-between border-t border-border/50 px-1 pt-1.5 font-mono text-[10px] text-muted-foreground">
          <span class="tabular-nums">{{ shownCount }} of {{ payload?.nodes.length ?? 0 }} shown</span>
          <button
            v-if="filtersActive"
            type="button"
            class="rounded-sm px-1 uppercase tracking-[0.08em] text-primary hover:bg-accent"
            @click="showAll"
          >
            Show all
          </button>
        </div>
      </div>

      <!-- View controls. -->
      <button
        v-if="!controlsOpen"
        type="button"
        aria-label="Show the view controls"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/60 text-muted-foreground backdrop-blur-xl transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
        @click="controlsOpen = true"
      >
        <SlidersHorizontal :size="15" />
      </button>
      <div
        v-else
        class="w-[216px] shrink-0 rounded-lg border border-border/50 bg-background/60 p-3 backdrop-blur-xl"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            View
          </span>
          <button
            type="button"
            aria-label="Close the view controls"
            class="-mr-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            @click="controlsOpen = false"
          >
            <X :size="13" />
          </button>
        </div>

        <label class="block">
          <span class="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Min. links <span class="tabular-nums text-foreground">{{ minLinks }}</span>
          </span>
          <input
            v-model.number="minLinks"
            type="range"
            min="0"
            :max="minLinksMax"
            step="1"
            class="mt-1 w-full"
            :style="{ accentColor: 'hsl(var(--primary))' }"
          >
          <span class="block font-sans text-[11px] leading-4 text-muted-foreground">
            Hide pages with fewer links, to see the backbone.
          </span>
        </label>

        <button
          type="button"
          role="switch"
          :aria-checked="labelsOn"
          class="mt-3 flex w-full items-center justify-between gap-2 rounded-sm py-0.5 text-left"
          @click="labelsOn = !labelsOn"
        >
          <span class="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Labels</span>
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

        <div class="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/50 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
            @click="fitAll"
          >
            <Maximize2 :size="12" />
            Fit
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-1.5 rounded-md border border-border/50 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
            @click="replay"
          >
            <Play :size="12" />
            Replay
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
