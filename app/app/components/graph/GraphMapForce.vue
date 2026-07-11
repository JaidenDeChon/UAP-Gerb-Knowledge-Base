<script setup lang="ts">
import type { GraphNode, GraphPayload } from '#shared/types/wiki'
import { nodeRadius, readGraphPalette, withAlpha, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: `force-graph` (vasturiano) — a Canvas 2D renderer with a
 * live d3-force simulation, which is the closest of the candidates to
 * Obsidian's physics-based graph view: nodes are draggable and the layout
 * settles in front of you instead of being precomputed. Seeded from the baked
 * layout so the simulation starts near equilibrium rather than exploding out
 * of a random cloud on every visit.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLElement | null>(null)
const ready = shallowRef(false)

let fg: any = null
let disposed = false
let builtFor: GraphPayload | null = null
let palette: GraphPalette | null = null
let hovered: any = null
const hoverNeighbours = new Set<any>()

async function build(): Promise<void> {
  const el = containerRef.value
  const p = payload.value
  if (!el || !p || builtFor === p) return

  const { default: ForceGraph } = await import('force-graph')
  if (disposed || builtFor === p) return
  builtFor = p

  palette = readGraphPalette()

  // force-graph mutates these objects (adds vx/vy, resolves link endpoints).
  const nodes = p.nodes.map(n => ({
    id: n.i,
    name: n.l,
    degree: n.d,
    x: n.x,
    y: n.y,
    __src: n,
  }))
  const links = p.edges.map(([a, b]) => ({ source: a, target: b }))

  fg = new ForceGraph(el)
    .graphData({ nodes, links })
    .nodeId('id')
    .nodeVal((n: any) => Math.max(1, n.degree))
    .nodeLabel(() => '') // labels are drawn on-canvas below, not as a tooltip
    .nodeColor((n: any) => {
      if (!palette) return '#888'
      if (hovered) {
        if (n === hovered) return palette.primary
        if (!hoverNeighbours.has(n)) return withAlpha(palette.node, 0.28)
      }
      return palette.node
    })
    .linkColor((l: any) => {
      if (!palette) return '#888'
      if (hovered && (l.source === hovered || l.target === hovered)) return withAlpha(palette.primary, 0.9)
      return withAlpha(palette.edge, hovered ? 0.07 : 0.16)
    })
    .linkWidth((l: any) => (hovered && (l.source === hovered || l.target === hovered) ? 1.6 : 1))
    .nodeCanvasObjectMode(() => 'after')
    .nodeCanvasObject((n: any, ctx: CanvasRenderingContext2D, scale: number) => {
      // Labels once zoomed in (or for the hover neighbourhood), like the SVG map.
      if (!palette) return
      const isFocusish = hovered && (n === hovered || hoverNeighbours.has(n))
      if (scale < 1.4 && !isFocusish) return
      ctx.font = `${n === hovered ? 600 : 400} ${11 / scale}px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = hovered && !isFocusish ? withAlpha(palette.foreground, 0.28) : palette.foreground
      ctx.fillText(n.name, n.x, n.y + nodeRadius(n.degree) / scale + 2 / scale)
    })
    .onNodeHover((n: any) => {
      hovered = n ?? null
      hoverNeighbours.clear()
      if (n) {
        const g = fg.graphData()
        for (const l of g.links) {
          if (l.source === n) hoverNeighbours.add(l.target)
          else if (l.target === n) hoverNeighbours.add(l.source)
        }
      }
      el.style.cursor = n ? 'pointer' : 'grab'
    })
    .onNodeClick((n: any) => {
      if (n?.__src) emit('select', n.__src)
    })
    .d3AlphaDecay(0.03)
    .d3VelocityDecay(0.35)
    .warmupTicks(20)
    .cooldownTime(8000)

  // Match the container; force-graph sizes itself once at construction.
  const fit = (): void => fg.width(el.clientWidth).height(el.clientHeight)
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(el)

  // The seeded layout is already near equilibrium — frame it immediately, then
  // once more when the simulation first settles. Not on every engine stop:
  // drag reheats would otherwise yank the camera away from the user.
  let fitted = false
  requestAnimationFrame(() => fg.zoomToFit(0, 60))
  fg.onEngineStop(() => {
    if (!fitted) {
      fitted = true
      fg.zoomToFit(400, 60)
    }
  })

  ready.value = true
}

let ro: ResizeObserver | null = null

watch(payload, () => build())

const { theme } = useTheme()
watch(theme, async () => {
  await nextTick()
  palette = readGraphPalette()
  // Accessor-based colors re-evaluate on the next frame automatically.
})

onMounted(() => build())

onBeforeUnmount(() => {
  disposed = true
  ro?.disconnect()
  ro = null
  fg?._destructor()
  fg = null
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-background">
    <div
      ref="containerRef"
      class="absolute inset-0"
      :style="{ touchAction: 'none' }"
      role="application"
      aria-label="Knowledge graph rendered with force-graph physics"
    />
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>
  </div>
</template>
