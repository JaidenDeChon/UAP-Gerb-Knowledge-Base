<script setup lang="ts">
import type { GraphNode, GraphPayload } from '#shared/types/wiki'
import { nodeRadius, readGraphPalette, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: cosmos.gl (`@cosmos.gl/graph`, formerly @cosmograph/cosmos)
 * — both the force simulation *and* the rendering run on the GPU in shaders.
 * It's the heavy-artillery option, built for hundreds of thousands of points;
 * our ~1.1k nodes are a rounding error for it. The trade-offs: WebGL2
 * required, no built-in labels (the hovered node's name is shown as a DOM
 * overlay here), and a look that's harder to match to the site's design
 * language.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLDivElement | null>(null)
const ready = shallowRef(false)
const hoverLabel = shallowRef<{ text: string, x: number, y: number } | null>(null)

let graph: any = null
let disposed = false
let builtFor: GraphPayload | null = null
// cosmos's setConfig() resets unspecified keys to their defaults, so the full
// construction config is kept around and re-sent whole on theme changes.
let baseConfig: Record<string, unknown> | null = null

async function build(): Promise<void> {
  const el = containerRef.value
  const p = payload.value
  if (!el || !p || builtFor === p) return

  const { Graph } = await import('@cosmos.gl/graph')
  if (disposed || builtFor === p) return
  builtFor = p

  const palette: GraphPalette = readGraphPalette()

  // Map the baked layout into cosmos's [0, spaceSize] square as the
  // simulation's starting positions.
  const SPACE = 4096
  const { minX, minY, maxX, maxY } = p.bounds
  const span = Math.max(maxX - minX, maxY - minY, 1e-6)
  const scale = (SPACE * 0.6) / span
  const offX = (SPACE - (maxX - minX) * scale) / 2
  const offY = (SPACE - (maxY - minY) * scale) / 2

  const positions = new Float32Array(p.nodes.length * 2)
  const sizes = new Float32Array(p.nodes.length)
  for (let i = 0; i < p.nodes.length; i++) {
    const n = p.nodes[i]!
    positions[i * 2] = offX + (n.x - minX) * scale
    positions[i * 2 + 1] = offY + (n.y - minY) * scale
    sizes[i] = nodeRadius(n.d) * 2
  }
  const links = new Float32Array(p.edges.length * 2)
  for (let i = 0; i < p.edges.length; i++) {
    links[i * 2] = p.edges[i]![0]
    links[i * 2 + 1] = p.edges[i]![1]
  }

  baseConfig = {
    spaceSize: SPACE,
    backgroundColor: [0, 0, 0, 0], // container bg-background shows through
    pointDefaultColor: palette.node,
    hoveredPointCursor: 'pointer',
    renderHoveredPointRing: true,
    hoveredPointRingColor: palette.primary,
    linkDefaultColor: palette.edge,
    linkOpacity: 0.35,
    linkDefaultWidth: 1,
    enableSimulation: true,
    simulationGravity: 0.12,
    simulationRepulsion: 1.2,
    simulationLinkSpring: 0.6,
    simulationLinkDistance: 12,
    simulationFriction: 0.85,
    simulationDecay: 3000,
    fitViewOnInit: true,
    fitViewPadding: 0.12,
    attribution: '',
    onClick: (index: number | undefined) => {
      if (index != null && p.nodes[index]) emit('select', p.nodes[index]!)
    },
    onPointMouseOver: (index: number, _pos: [number, number], event: any) => {
      const n = p.nodes[index]
      if (!n) return
      const rect = el.getBoundingClientRect()
      const cx = typeof event?.clientX === 'number' ? event.clientX - rect.left : rect.width / 2
      const cy = typeof event?.clientY === 'number' ? event.clientY - rect.top : rect.height / 2
      hoverLabel.value = { text: n.l, x: cx, y: cy }
    },
    onPointMouseOut: () => {
      hoverLabel.value = null
    },
  }
  graph = new Graph(el, baseConfig)

  graph.setPointPositions(positions)
  graph.setPointSizes(sizes)
  graph.setLinks(links)
  graph.render(0.15) // gentle initial alpha: relax the seeded layout, don't detonate it

  ready.value = true
}

watch(payload, () => build())

const { theme } = useTheme()
watch(theme, async () => {
  if (!graph || !baseConfig) return
  await nextTick()
  const palette = readGraphPalette()
  baseConfig = {
    ...baseConfig,
    pointDefaultColor: palette.node,
    linkDefaultColor: palette.edge,
    hoveredPointRingColor: palette.primary,
  }
  graph.setConfig(baseConfig)
})

onMounted(() => build())

onBeforeUnmount(() => {
  disposed = true
  graph?.destroy()
  graph = null
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-background">
    <div
      ref="containerRef"
      class="absolute inset-0"
      :style="{ touchAction: 'none' }"
      role="application"
      aria-label="Knowledge graph rendered with cosmos.gl GPU simulation"
    />

    <!-- cosmos has no label engine; surface the hovered node's name in the DOM -->
    <div
      v-if="hoverLabel"
      class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border/50 bg-background/85 px-2 py-1 font-sans text-xs text-foreground backdrop-blur-sm"
      :style="{ left: `${hoverLabel.x}px`, top: `${hoverLabel.y + 14}px` }"
    >
      {{ hoverLabel.text }}
    </div>

    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>
  </div>
</template>
