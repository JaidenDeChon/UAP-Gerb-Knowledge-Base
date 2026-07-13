<script setup lang="ts">
import { LocateFixed } from '@lucide/vue'
import type { GraphEdge, GraphNode } from '#shared/types/wiki'
import type { Bounds } from '~/utils/graph'
import { buildAdjacency, clamp, fitView, localSubgraph, relax } from '~/utils/graph'

const props = withDefaults(defineProps<{
  activePath?: string | null
  minimized?: boolean
  height?: number | string
}>(), {
  activePath: null,
  minimized: false,
})

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

/* ------------------------------------------------------------------ scene -- */

interface Scene {
  nodes: GraphNode[]
  edges: GraphEdge[]
  bounds: Bounds
  local: boolean
}

const EMPTY_BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }

function boundsOf(nodes: { x: number, y: number }[]): Bounds {
  if (nodes.length === 0) return EMPTY_BOUNDS
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
  return { minX, minY, maxX, maxY }
}

// Docked + an active note → the relaxed local neighbourhood. Otherwise the whole
// precomputed graph. Recomputes only on payload / activePath / minimized changes
// (never on hover, pan or zoom), so the force pass runs at most once per nav.
const scene = computed<Scene>(() => {
  const p = payload.value
  if (!p) return { nodes: [], edges: [], bounds: EMPTY_BOUNDS, local: false }

  if (props.minimized && props.activePath) {
    const idx = p.nodes.findIndex(n => n.p === props.activePath)
    if (idx >= 0) {
      const sub = localSubgraph(p, idx, { maxNodes: 18 })
      sub.nodes.forEach((n, i) => {
        if (i === 0) {
          n.x = 0
          n.y = 0
        }
        else {
          const a = i * 2.399963 // golden angle — even, deterministic seed ring
          const rr = 40 + i * 5
          n.x = Math.cos(a) * rr
          n.y = Math.sin(a) * rr
        }
      })
      relax(sub.nodes, sub.edges, 120)
      return { nodes: sub.nodes, edges: sub.edges, bounds: boundsOf(sub.nodes), local: true }
    }
  }

  return { nodes: p.nodes, edges: p.edges, bounds: p.bounds, local: false }
})

// path → canonical payload node, so `select` always emits a real GraphNode
// (with its global index) even when a docked subgraph node was clicked.
const pathToNode = computed(() => {
  const m = new Map<string, GraphNode>()
  const p = payload.value
  if (p) for (const n of p.nodes) m.set(n.p, n)
  return m
})

const adjacency = computed(() => buildAdjacency(scene.value.edges, scene.value.nodes.length))

/* ------------------------------------------------------------- view state -- */

// Split so panning (`pan`) never invalidates the k-dependent screen coordinates.
const pan = shallowRef({ x: 0, y: 0 })
const k = shallowRef(1)
const hoverIndex = shallowRef<number | null>(null)
const size = shallowRef({ w: 0, h: 0 })
const grabbing = shallowRef(false)

let hasUserAdjusted = false

const activeSceneIndex = computed<number | null>(() => {
  if (!props.activePath) return null
  const s = scene.value
  if (s.local) return 0
  const i = s.nodes.findIndex(n => n.p === props.activePath)
  return i >= 0 ? i : null
})

const focusIndex = computed<number | null>(() => hoverIndex.value ?? activeSceneIndex.value)

const neighbourSet = computed<Set<number>>(() => {
  const f = focusIndex.value
  if (f == null) return new Set()
  return new Set(adjacency.value[f] ?? [])
})

// Node positions pre-multiplied by k; the group is then only translated by pan,
// so a pan is a single transform write and node/edge geometry never recomputes.
const pts = computed(() => {
  const z = k.value
  const ns = scene.value.nodes
  const out = new Array<{ x: number, y: number }>(ns.length)
  for (let i = 0; i < ns.length; i++) out[i] = { x: ns[i]!.x * z, y: ns[i]!.y * z }
  return out
})

const groupTransform = computed(() => `translate(${pan.value.x} ${pan.value.y})`)

const gridStyle = computed(() => ({
  backgroundColor: 'hsl(var(--background))',
}))

function radiusOf(degree: number, emphasized: boolean): number {
  return clamp(3 + Math.sqrt(degree) * 1.15, 3, 14) + (emphasized ? 3 : 0)
}

// Focus-independent node geometry. Only recomputes on zoom / scene change, so a
// hover never rebuilds this ~1.1k-element list. Emphasis (fill + radius bump) and
// dimming are applied per-node in the template so a hover touches only the DOM of
// the few nodes whose class actually flips — the rest dim via the CSS cascade.
const nodesGeom = computed(() => {
  const ns = scene.value.nodes
  const p = pts.value
  const out = new Array<{ i: number, cx: number, cy: number, r: number }>(ns.length)
  for (let i = 0; i < ns.length; i++) {
    out[i] = { i, cx: p[i]!.x, cy: p[i]!.y, r: radiusOf(ns[i]!.d, false) }
  }
  return out
})

const focused = computed(() => focusIndex.value != null)

// The full map draws all ~6.3k edges at once; across a spread-out field they
// stack into a solid wash at the design's 0.4, so fade them to a faint substrate
// and let the green focus edges carry connectivity on hover. The docked mini-map
// shows only a handful of edges, so it keeps them legible.
const baseEdgeOpacity = computed(() => {
  const base = scene.value.nodes.length > 120 ? 0.16 : 0.4
  return focused.value ? base * 0.45 : base
})

// The full edge set, drawn once and kept mounted. Its `d` is independent of the
// focus, so hovering never re-serialises the ~6.3k-segment path — only its
// stroke-opacity toggles (0.4 → 0.15) to dim the non-incident edges.
const baseEdgePath = computed(() => {
  const p = pts.value
  const segs: string[] = []
  for (const [a, b] of scene.value.edges) {
    const pa = p[a]
    const pb = p[b]
    if (!pa || !pb) continue
    segs.push(`M${Math.round(pa.x)} ${Math.round(pa.y)}L${Math.round(pb.x)} ${Math.round(pb.y)}`)
  }
  return segs.join('')
})

// Only the focus node's incident edges (a handful), overdrawn in the primary
// colour on top of the dimmed base. Cheap to rebuild per focus change.
const activeEdgePath = computed(() => {
  const f = focusIndex.value
  if (f == null) return ''
  const p = pts.value
  const pf = p[f]
  if (!pf) return ''
  const fx = Math.round(pf.x)
  const fy = Math.round(pf.y)
  const segs: string[] = []
  for (const j of adjacency.value[f] ?? []) {
    const pj = p[j]
    if (!pj) continue
    segs.push(`M${fx} ${fy}L${Math.round(pj.x)} ${Math.round(pj.y)}`)
  }
  return segs.join('')
})

const labelsRender = computed(() => {
  const s = scene.value
  const ns = s.nodes
  const p = pts.value
  const f = focusIndex.value
  const nb = neighbourSet.value
  const act = activeSceneIndex.value
  const hov = hoverIndex.value
  const { x: px, y: py } = pan.value
  const { w, h } = size.value
  const margin = 80

  const out: { i: number, x: number, y: number, text: string, focused: boolean }[] = []
  const added = new Set<number>()
  const add = (i: number): void => {
    if (added.has(i)) return
    added.add(i)
    const emphasized = i === act || i === hov
    const r = radiusOf(ns[i]!.d, emphasized)
    out.push({ i, x: p[i]!.x, y: p[i]!.y + r + 13, text: ns[i]!.l, focused: i === f })
  }

  if (s.local) {
    // 300x220 fits about a dozen names before they collide. Beyond that, name
    // only the note you're on and reveal the rest on hover, the way Obsidian's
    // local-graph pane does.
    if (act != null) add(act)
    if (ns.length <= 12) {
      for (let i = 0; i < ns.length; i++) add(i)
    }
    else if (hov != null) {
      add(hov)
      nb.forEach(add)
    }
    return out
  }

  if (f != null) {
    add(f)
    nb.forEach(add)
  }
  if (k.value >= 0.9) {
    for (let i = 0; i < ns.length; i++) {
      const sx = px + p[i]!.x
      const sy = py + p[i]!.y
      if (sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin) add(i)
    }
  }
  return out
})

const showGraph = computed(() => !!payload.value && size.value.w > 0 && scene.value.nodes.length > 0)

/* -------------------------------------------------------------------- fit -- */

function fitToScene(): void {
  const s = scene.value
  const { w, h } = size.value
  if (w <= 0 || h <= 0 || s.nodes.length === 0) return
  const v = fitView(s.bounds, w, h, props.minimized ? 24 : 40)
  pan.value = { x: v.x, y: v.y }
  k.value = v.k
  hasUserAdjusted = false
}

watch(() => scene.value, () => {
  if (hoverRaf) {
    cancelAnimationFrame(hoverRaf)
    hoverRaf = 0
  }
  hoverQueued = false
  pendingHover = null
  hoverIndex.value = null
  fitToScene()
})

watch(() => size.value, () => {
  if (!hasUserAdjusted) fitToScene()
})

/* ------------------------------------------------------------ interaction -- */

const containerRef = ref<HTMLElement | null>(null)

function nodeIndexFromEvent(e: Event): number | null {
  const t = e.target
  if (t instanceof SVGCircleElement) {
    const d = t.getAttribute('data-i')
    if (d != null) return Number(d)
  }
  return null
}

let dragging = false
let pointerId = -1
let lastX = 0
let lastY = 0
let travel = 0
let downNode: number | null = null
let pendingDx = 0
let pendingDy = 0
let panRaf = 0

function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return
  dragging = true
  pointerId = e.pointerId
  lastX = e.clientX
  lastY = e.clientY
  travel = 0
  downNode = nodeIndexFromEvent(e)
  grabbing.value = true
  ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging || e.pointerId !== pointerId) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  lastX = e.clientX
  lastY = e.clientY
  travel += Math.abs(dx) + Math.abs(dy)
  pendingDx += dx
  pendingDy += dy
  if (panRaf) return
  panRaf = requestAnimationFrame(() => {
    panRaf = 0
    pan.value = { x: pan.value.x + pendingDx, y: pan.value.y + pendingDy }
    pendingDx = 0
    pendingDy = 0
    hasUserAdjusted = true
  })
}

function onPointerUp(e: PointerEvent): void {
  if (e.pointerId !== pointerId) return
  dragging = false
  grabbing.value = false
  const el = e.currentTarget as SVGSVGElement
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  if (travel < 5 && downNode != null) {
    const node = scene.value.nodes[downNode]
    if (node) emit('select', pathToNode.value.get(node.p) ?? node)
  }
  downNode = null
}

let wheelRaf = 0
let pendingFactor = 1
let wheelX = 0
let wheelY = 0

function onWheel(e: WheelEvent): void {
  e.preventDefault()
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return
  wheelX = e.clientX - rect.left
  wheelY = e.clientY - rect.top
  pendingFactor *= e.deltaY < 0 ? 1.1 : 0.9
  if (wheelRaf) return
  wheelRaf = requestAnimationFrame(() => {
    wheelRaf = 0
    const cur = k.value
    const next = clamp(cur * pendingFactor, 0.15, 4)
    pendingFactor = 1
    if (next === cur) return
    const gx = (wheelX - pan.value.x) / cur
    const gy = (wheelY - pan.value.y) / cur
    pan.value = { x: wheelX - gx * next, y: wheelY - gy * next }
    k.value = next
    hasUserAdjusted = true
  })
}

// Hover flips `focusIndex`, which re-dims ~1.1k nodes and re-derives the incident
// edges. Coalesce it to one commit per frame — the same rAF discipline pan and
// zoom already use — so a fast sweep across the dense cluster can't fire that work
// once per node crossed.
let hoverRaf = 0
let pendingHover: number | null = null
let hoverQueued = false

function currentHover(): number | null {
  return hoverQueued ? pendingHover : hoverIndex.value
}

function queueHover(i: number | null): void {
  pendingHover = i
  hoverQueued = true
  if (hoverRaf) return
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0
    hoverQueued = false
    hoverIndex.value = pendingHover
  })
}

function onNodeOver(e: PointerEvent): void {
  const i = nodeIndexFromEvent(e)
  if (i != null) queueHover(i)
}

function onNodeOut(e: PointerEvent): void {
  const i = nodeIndexFromEvent(e)
  if (i != null && currentHover() === i) queueHover(null)
}

function resetView(): void {
  fitToScene()
}

// The docked mini-map re-fits when its container is resized (so the drag-to-resize
// handle reflows the graph) as long as the user hasn't panned it themselves.
defineExpose({ resetView })

/* ------------------------------------------------------------- lifecycle -- */

let ro: ResizeObserver | null = null

onMounted(() => {
  const el = containerRef.value
  if (!el) return
  const measure = (): void => {
    size.value = { w: el.clientWidth, h: el.clientHeight }
  }
  measure()
  ro = new ResizeObserver(measure)
  ro.observe(el)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  if (panRaf) cancelAnimationFrame(panRaf)
  if (wheelRaf) cancelAnimationFrame(wheelRaf)
  if (hoverRaf) cancelAnimationFrame(hoverRaf)
})

const rootStyle = computed(() => ({
  height: props.height == null ? '100%' : typeof props.height === 'number' ? `${props.height}px` : props.height,
  width: '100%',
}))

const ariaLabel = computed(() =>
  props.minimized ? 'Docked knowledge graph mini-map' : 'Knowledge graph of every entry',
)
</script>

<template>
  <div
    ref="containerRef"
    class="relative overflow-hidden"
    :style="rootStyle"
  >
    <!-- flat surface; the docked assembly owns the border and rounding -->
    <div class="pointer-events-none absolute inset-0" :style="gridStyle" />

    <svg
      v-if="showGraph"
      class="absolute inset-0 h-full w-full select-none"
      :style="{ cursor: grabbing ? 'grabbing' : 'grab', touchAction: 'none' }"
      role="application"
      :aria-label="ariaLabel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <g :transform="groupTransform" @pointerover="onNodeOver" @pointerout="onNodeOut">
        <path
          class="g-edge pointer-events-none stroke-graph-edge"
          fill="none"
          stroke-width="1"
          :stroke-opacity="baseEdgeOpacity"
          vector-effect="non-scaling-stroke"
          :d="baseEdgePath"
        />
        <path
          class="pointer-events-none stroke-primary"
          fill="none"
          stroke-width="1.6"
          :stroke-opacity="0.9"
          vector-effect="non-scaling-stroke"
          :d="activeEdgePath"
        />

        <g class="g-nodes" :class="{ 'has-focus': focused }">
          <circle
            v-for="n in nodesGeom"
            :key="n.i"
            class="g-node cursor-pointer"
            :class="[
              (n.i === hoverIndex || n.i === activeSceneIndex) ? 'fill-primary' : 'fill-graph-node',
              focusIndex != null && (n.i === focusIndex || neighbourSet.has(n.i)) ? 'is-lit' : '',
            ]"
            :data-i="n.i"
            :cx="n.cx"
            :cy="n.cy"
            :r="(n.i === hoverIndex || n.i === activeSceneIndex) ? n.r + 3 : n.r"
          />
        </g>

        <g class="pointer-events-none">
          <text
            v-for="l in labelsRender"
            :key="l.i"
            class="fill-foreground font-sans"
            text-anchor="middle"
            font-size="11"
            :font-weight="l.focused ? 600 : 400"
            :x="l.x"
            :y="l.y"
          >{{ l.text }}</text>
        </g>
      </g>
    </svg>

    <!-- SSR / pre-hydration skeleton -->
    <div v-else class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>

    <!-- HUD — the full map only; the docked mini-map's chrome lives in its frame. -->
    <div v-if="showGraph && !minimized" class="pointer-events-none absolute inset-0">
      <span
        class="absolute bottom-4 left-4 font-mono text-xs tracking-[0.06em] text-muted-foreground"
      >{{ payload!.nodes.length }} NODES · {{ payload!.edges.length }} LINKS</span>
      <button
        type="button"
        class="g-btn pointer-events-auto absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Reset the view"
        @click="resetView"
      >
        <LocateFixed :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.g-node {
  opacity: 1;
  transition: opacity var(--dur-fast) var(--ease-standard);
}
/* Focused: fade every node except the focus and its neighbours. The dim is a
   single cascade flip off the parent, so a hover only writes `is-lit` on the few
   lit nodes rather than restyling all ~1.1k circles. */
.g-nodes.has-focus .g-node {
  opacity: 0.28;
}
.g-nodes.has-focus .g-node.is-lit {
  opacity: 1;
}
.g-edge {
  transition: stroke-opacity var(--dur-fast) var(--ease-standard);
}
.g-btn {
  transition:
    background-color var(--dur-fast) var(--ease-standard),
    color var(--dur-fast) var(--ease-standard);
}
</style>
