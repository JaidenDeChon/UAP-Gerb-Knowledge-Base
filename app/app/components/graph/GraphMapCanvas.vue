<script setup lang="ts">
import type { GraphNode } from '#shared/types/wiki'
import { buildAdjacency } from '~/utils/graph'
import { nodeRadius, pickNode, readGraphPalette, withAlpha, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: the precomputed layout drawn into a single 2D <canvas>.
 * Same data, same static positions and visual language as the SVG map — the
 * difference is that the browser retains no per-node DOM/render tree. Every
 * frame is one clear + three batched fills/strokes, so pan/zoom cost is a
 * redraw, not a style/layout/paint pass over ~7k SVG elements.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const hoverIndex = shallowRef<number | null>(null)

const camera = useMapCamera(containerRef, {
  onTap(x, y) {
    const p = payload.value
    if (!p) return
    const i = pickNode(p.nodes, camera.pan.value, camera.k.value, x, y)
    if (i != null) emit('select', p.nodes[i]!)
  },
  onHover(pos) {
    hoverPos = pos
    invalidate() // hover hit-test rides the draw loop's rAF
  },
})

const adjacency = computed(() => {
  const p = payload.value
  return p ? buildAdjacency(p.edges, p.nodes.length) : []
})

/* ---------------------------------------------------------------- drawing -- */

let palette: GraphPalette | null = null
let hoverPos: { x: number, y: number } | null = null
let dirty = true
let raf = 0

// Edge geometry lives in graph space in a retained Path2D — built once per
// payload, drawn each frame under the camera transform with a compensated
// line width so strokes stay 1 screen px at any zoom.
let edgePath: Path2D | null = null

function buildEdgePath(): void {
  const p = payload.value
  if (!p) {
    edgePath = null
    return
  }
  const path = new Path2D()
  for (const [a, b] of p.edges) {
    const na = p.nodes[a]
    const nb = p.nodes[b]
    if (!na || !nb) continue
    path.moveTo(na.x, na.y)
    path.lineTo(nb.x, nb.y)
  }
  edgePath = path
}

function invalidate(): void {
  dirty = true
}

function draw(): void {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  const p = payload.value
  if (!canvas || !ctx || !p || !palette) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { w, h } = camera.size.value
  if (w <= 0 || h <= 0) return

  // Hover is resolved here so a fast sweep costs one hit-test per frame.
  const focus = hoverPos
    ? pickNode(p.nodes, camera.pan.value, camera.k.value, hoverPos.x, hoverPos.y)
    : null
  hoverIndex.value = focus
  const neighbours = focus != null ? new Set(adjacency.value[focus] ?? []) : null

  const { x: px, y: py } = camera.pan.value
  const k = camera.k.value

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, w, h)

  // Edges — one retained path, stroked once. Alpha mirrors the SVG map.
  if (edgePath) {
    ctx.save()
    ctx.translate(px, py)
    ctx.scale(k, k)
    ctx.lineWidth = 1 / k
    ctx.strokeStyle = withAlpha(palette.edge, focus != null ? 0.16 * 0.45 : 0.16)
    ctx.stroke(edgePath)
    ctx.restore()
  }

  // Focus edges — the hovered node's incident links, overdrawn in primary.
  if (focus != null) {
    const nf = p.nodes[focus]!
    const fx = px + nf.x * k
    const fy = py + nf.y * k
    ctx.beginPath()
    for (const j of adjacency.value[focus] ?? []) {
      const nj = p.nodes[j]!
      ctx.moveTo(fx, fy)
      ctx.lineTo(px + nj.x * k, py + nj.y * k)
    }
    ctx.lineWidth = 1.6
    ctx.strokeStyle = withAlpha(palette.primary, 0.9)
    ctx.stroke()
  }

  // Nodes — screen-space arcs batched into at most two fill+stroke passes
  // (dimmed rest, then lit focus neighbourhood), radii constant in screen px.
  const dimmed = focus != null
  const base = new Path2D()
  const lit = new Path2D()
  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i]!
    const sx = px + n.x * k
    const sy = py + n.y * k
    const r = nodeRadius(n.d)
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue
    const target = dimmed && (i === focus || neighbours!.has(i)) ? lit : base
    target.moveTo(sx + r, sy)
    target.arc(sx, sy, r, 0, Math.PI * 2)
  }

  ctx.lineWidth = 2
  ctx.strokeStyle = palette.background
  ctx.globalAlpha = dimmed ? 0.28 : 1
  ctx.fillStyle = palette.node
  ctx.fill(base)
  ctx.stroke(base)
  ctx.globalAlpha = 1

  if (dimmed) {
    ctx.fillStyle = palette.node
    ctx.fill(lit)
    ctx.stroke(lit)
    // The focus node itself gets the primary fill and a size bump.
    const nf = p.nodes[focus!]!
    const r = nodeRadius(nf.d) + 3
    ctx.beginPath()
    ctx.arc(px + nf.x * k, py + nf.y * k, r, 0, Math.PI * 2)
    ctx.fillStyle = palette.primary
    ctx.fill()
    ctx.stroke()
  }

  // Labels — matching the SVG map: everything in view at k ≥ 0.9, plus the
  // focus neighbourhood at any zoom.
  ctx.font = '400 11px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = palette.foreground
  const margin = 80
  const drawLabel = (i: number, bold: boolean): void => {
    const n = p.nodes[i]!
    const sx = px + n.x * k
    const sy = py + n.y * k
    const r = nodeRadius(n.d) + (i === focus ? 3 : 0)
    if (bold) ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(n.l, sx, sy + r + 13)
    if (bold) ctx.font = '400 11px ui-sans-serif, system-ui, sans-serif'
  }
  const labelled = new Set<number>()
  if (focus != null) {
    drawLabel(focus, true)
    labelled.add(focus)
    for (const j of neighbours!) {
      if (!labelled.has(j)) {
        drawLabel(j, false)
        labelled.add(j)
      }
    }
  }
  if (k >= 0.9) {
    for (let i = 0; i < p.nodes.length; i++) {
      if (labelled.has(i)) continue
      const n = p.nodes[i]!
      const sx = px + n.x * k
      const sy = py + n.y * k
      if (sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin) drawLabel(i, false)
    }
  }
}

function tick(): void {
  raf = requestAnimationFrame(tick)
  if (!dirty) return
  dirty = false
  draw()
}

/* -------------------------------------------------------------- lifecycle -- */

function resizeCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { w, h } = camera.size.value
  canvas.width = Math.max(1, Math.round(w * dpr))
  canvas.height = Math.max(1, Math.round(h * dpr))
}

function refit(): void {
  const p = payload.value
  if (!p) return
  camera.fitTo(p.bounds)
}

watch([payload, () => camera.size.value], () => {
  resizeCanvas()
  if (payload.value && !camera.userAdjusted.value) refit()
  buildEdgePathIfNeeded()
  invalidate()
})

let builtFor: object | null = null
function buildEdgePathIfNeeded(): void {
  const p = payload.value
  if (!p || builtFor === p) return
  builtFor = p
  buildEdgePath()
}

watch([camera.pan, camera.k], invalidate)

const { theme } = useTheme()
watch(theme, async () => {
  await nextTick()
  palette = readGraphPalette()
  invalidate()
})

onMounted(() => {
  palette = readGraphPalette()
  resizeCanvas()
  buildEdgePathIfNeeded()
  if (payload.value) refit()
  invalidate()
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

const showSkeleton = computed(() => !payload.value)
</script>

<template>
  <div ref="containerRef" class="relative h-full w-full overflow-hidden bg-background">
    <canvas
      ref="canvasRef"
      class="absolute inset-0 h-full w-full select-none"
      :style="{ cursor: camera.grabbing.value ? 'grabbing' : hoverIndex != null ? 'pointer' : 'grab', touchAction: 'none' }"
      role="application"
      aria-label="Knowledge graph rendered with Canvas 2D"
      @pointerdown="camera.handlers.onPointerDown"
      @pointermove="camera.handlers.onPointerMove"
      @pointerup="camera.handlers.onPointerUp"
      @pointercancel="camera.handlers.onPointerUp"
      @pointerleave="camera.handlers.onPointerLeave"
      @wheel="camera.handlers.onWheel"
    />
    <div v-if="showSkeleton" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>
  </div>
</template>
