<script setup lang="ts">
import type { GraphNode, GraphPayload } from '#shared/types/wiki'
import { nodeRadius, readGraphPalette, withAlpha, type GraphPalette } from '~/utils/graphLab'

/**
 * Map-lab variant: Sigma.js v3 + graphology. Sigma is a WebGL renderer built
 * specifically for large node-link graphs — camera (wheel, drag, pinch,
 * inertia), hover, and density-aware label placement all come built in, so
 * this component mostly just loads data and styles it. The trade-off is less
 * control over the exact visual language than the home-brew renderers.
 */

const emit = defineEmits<{ select: [node: GraphNode] }>()

const { data: payload } = useGraph()

const containerRef = ref<HTMLElement | null>(null)
const ready = shallowRef(false)

let renderer: any = null
let graph: any = null
let disposed = false
let builtFor: GraphPayload | null = null
let hovered: string | null = null
let palette: GraphPalette | null = null

// Adjacency as string keys, for the hover reducers.
let neighbourSet = new Set<string>()

async function build(): Promise<void> {
  const el = containerRef.value
  const p = payload.value
  if (!el || !p || builtFor === p) return

  const [{ MultiGraph }, { default: Sigma }] = await Promise.all([
    import('graphology'),
    import('sigma'),
  ])
  if (disposed || builtFor === p) return
  builtFor = p

  palette = readGraphPalette()

  graph = new MultiGraph()
  for (const n of p.nodes) {
    graph.addNode(String(n.i), {
      // Sigma's y axis points up; the baked layout's points down.
      x: n.x,
      y: -n.y,
      size: nodeRadius(n.d),
      label: n.l,
    })
  }
  for (const [a, b] of p.edges) graph.addEdge(String(a), String(b))

  renderer = new Sigma(graph, el, {
    minCameraRatio: 0.2,
    maxCameraRatio: 8,
    itemSizesReference: 'screen',
    defaultNodeColor: palette.node,
    defaultEdgeColor: withAlpha(palette.edge, 0.16),
    labelFont: 'ui-sans-serif, system-ui, sans-serif',
    labelSize: 11,
    labelColor: { color: palette.foreground },
    labelDensity: 0.35,
    labelRenderedSizeThreshold: 5,
    // Sigma's own perf levers — worth toggling while testing on a device:
    hideEdgesOnMove: false,
    hideLabelsOnMove: false,
    nodeReducer: (node: string, data: any) => {
      if (!hovered || !palette) return data
      if (node === hovered) return { ...data, color: palette.primary, size: data.size + 3, zIndex: 2 }
      if (neighbourSet.has(node)) return { ...data, zIndex: 1 }
      return { ...data, color: withAlpha(palette.node, 0.28), label: null }
    },
    edgeReducer: (edge: string, data: any) => {
      if (!hovered || !palette || !graph) return data
      if (graph.hasExtremity(edge, hovered)) return { ...data, color: withAlpha(palette.primary, 0.9), size: 1.6 }
      return { ...data, color: withAlpha(palette.edge, 0.07) }
    },
  })

  renderer.on('clickNode', ({ node }: { node: string }) => {
    const target = p.nodes[Number(node)]
    if (target) emit('select', target)
  })
  renderer.on('enterNode', ({ node }: { node: string }) => {
    hovered = node
    neighbourSet = new Set(graph.neighbors(node))
    renderer.refresh({ skipIndexation: true })
  })
  renderer.on('leaveNode', () => {
    hovered = null
    neighbourSet = new Set()
    renderer.refresh({ skipIndexation: true })
  })

  ready.value = true
}

watch(payload, () => build())

const { theme } = useTheme()
watch(theme, async () => {
  if (!renderer) return
  await nextTick()
  palette = readGraphPalette()
  renderer.setSetting('defaultNodeColor', palette.node)
  renderer.setSetting('defaultEdgeColor', withAlpha(palette.edge, 0.16))
  renderer.setSetting('labelColor', { color: palette.foreground })
})

onMounted(() => build())

onBeforeUnmount(() => {
  disposed = true
  renderer?.kill()
  renderer = null
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-background">
    <div
      ref="containerRef"
      class="absolute inset-0"
      :style="{ touchAction: 'none' }"
      role="application"
      aria-label="Knowledge graph rendered with Sigma.js"
    />
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <span class="font-mono text-xs tracking-[0.1em] text-muted-foreground">LOADING MAP…</span>
    </div>
  </div>
</template>
